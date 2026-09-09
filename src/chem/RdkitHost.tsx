import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { rdkitBridge } from "./bridge";

/**
 * 隐藏的 WebView，RDKit 就跑在里面。
 *
 * 三个文件写进 document 目录，WebView 以本地文件加载。
 *
 * **wasm 不能让页面自己去取。** 页面来源是 file://，Android WebView 会拦掉从 file:// 发起的
 * fetch 和 XHR，Emscripten 两条路都会失败（Aborted: both async and sync fetching of the
 * wasm failed）。所以把 wasm 转成 base64 写进一个 .js，用 <script> 标签喂进去——
 * script 标签在 file:// 下是通的，RDKit_minimal.js 自己就是这么加载的——
 * 再用 Emscripten 的 wasmBinary 直接交给它，全程不发任何请求。
 *
 * 代价是首次启动要写一个 9MB 的文件并 atob 一次。只做一次，之后复用。
 *
 * 运算逻辑来自 assets/chem/ops.js.txt，以 <script> 加载。**不要改回 toString() 注入**：
 * release 构建把 JS 编译成 Hermes 字节码后，toString() 返回的是 `{ [bytecode] }`，
 * 注进去直接 ReferenceError，而 node 上的测试永远复现不出来。
 */

const DIRECTORY = "rdkit";

async function materialize(): Promise<string> {
  const directory = new Directory(Paths.document, DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });

  const [libraryAsset, wasmAsset, opsAsset] = await Asset.loadAsync([
    require("../../assets/rdkit/RDKit_minimal.js.txt"),
    require("../../assets/rdkit/RDKit_minimal.wasm"),
    require("../../assets/chem/ops.js.txt"),
  ]);

  const library = new File(directory, "RDKit_minimal.js");
  const wasm = new File(directory, "RDKit_minimal.wasm.js");
  const page = new File(directory, "index.html");

  if (!library.exists) {
    library.create();
    library.write(await new File(libraryAsset.localUri ?? libraryAsset.uri).text());
  }
  if (!wasm.exists) {
    const base64 = await new File(wasmAsset.localUri ?? wasmAsset.uri).base64();
    wasm.create();
    wasm.write(`var RDKIT_WASM_BASE64 = "${base64}";`);
  }

  // ops 每次重写：改了运算逻辑，装了新包就该立刻生效，不该被上一次的副本挡住。
  const ops = new File(directory, "ops.js");
  if (ops.exists) ops.delete();
  ops.create();
  ops.write(await new File(opsAsset.localUri ?? opsAsset.uri).text());

  if (page.exists) page.delete();
  page.create();
  page.write(html());

  return page.uri;
}

function html(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script src="./RDKit_minimal.js"></script>
<script src="./RDKit_minimal.wasm.js"></script>
<script src="./ops.js"></script>
<script>
  var RDKit = null;
  function reply(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  window.__dispatch = function (id, op, args) {
    try {
      reply({ type: "result", id: id, value: rdkitOps(RDKit, op, args) });
    } catch (error) {
      reply({ type: "result", id: id, value: { ok: false, error: String(error) } });
    }
  };
  function wasmBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // 给了 wasmBinary，Emscripten 就不会去 fetch——这正是 file:// 下唯一走得通的路。
  initRDKitModule({ wasmBinary: wasmBytes(RDKIT_WASM_BASE64) })
    .then(function (module) {
      RDKit = module;
      reply({ type: "ready", version: module.version() });
    })
    .catch(function (error) {
      reply({ type: "failed", error: String(error) });
    });
</script>
</body></html>`;
}

export function RdkitHost() {
  const webViewRef = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      // web 预览用不了 react-native-webview 的注入通道。web 只是开发预览，不是发布目标。
      rdkitBridge.markUnsupported("web 预览下没有 RDKit，请在真机或模拟器上使用结构相关功能");
      return;
    }

    materialize()
      .then(setUri)
      .catch((error: unknown) =>
        rdkitBridge.markUnsupported(
          `RDKit 文件准备失败：${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    return () => rdkitBridge.detach();
  }, []);

  if (!uri) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri }}
        originWhitelist={["*"]}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf("/"))}
        javaScriptEnabled
        onLoadEnd={() =>
          rdkitBridge.attach((script) => webViewRef.current?.injectJavaScript(script))
        }
        onMessage={(event) => rdkitBridge.handleMessage(event.nativeEvent.data)}
        onError={({ nativeEvent }) =>
          rdkitBridge.markUnsupported(`RDKit 视图加载失败：${nativeEvent.description}`)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 不能用 display:none 或 0 尺寸——有些 WebView 实现会因此不执行脚本。放到屏幕外。
  hidden: { position: "absolute", width: 1, height: 1, left: -100, top: -100, opacity: 0 },
});
