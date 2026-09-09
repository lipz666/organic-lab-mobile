import { Asset } from "expo-asset";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, NativeModules, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";

import { theme } from "./theme";

type KetcherMessage = {
  type: "ready" | "molecule_set" | "smiles" | "error";
  requestId?: string;
  value?: string;
  message?: string;
  version?: string;
};

const KetcherAssetServer = (
  NativeModules as {
    KetcherAssetServer?: { start: (assetUri: string) => Promise<string> };
  }
).KetcherAssetServer;

export function KetcherModal({
  visible,
  initialSmiles,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialSmiles: string;
  onClose: () => void;
  onApply: (smiles: string) => void;
}) {
  const webView = useRef<WebView>(null);
  const pendingRequest = useRef<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    let cancelled = false;
    if (!KetcherAssetServer) {
      setError("当前安装包没有分子画板本地服务");
      return;
    }
    const asset = Asset.fromModule(require("../../assets/ketcher/index.html"));
    asset.downloadAsync()
      .then(() => KetcherAssetServer.start(asset.localUri ?? asset.uri))
      .then((localUri) => {
        if (!cancelled) setUri(localUri);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setReady(false);
      setApplying(false);
      setError(null);
      pendingRequest.current = null;
    }
  }, [visible]);

  const send = useCallback((message: Record<string, unknown>) => {
    webView.current?.postMessage(JSON.stringify(message));
  }, []);

  const receive = useCallback(
    (event: WebViewMessageEvent) => {
      let message: KetcherMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as KetcherMessage;
      } catch {
        return;
      }
      if (message.type === "ready") {
        setReady(true);
        send({ type: "set_molecule", value: initialSmiles.trim() });
      } else if (message.type === "smiles" && message.requestId === pendingRequest.current) {
        pendingRequest.current = null;
        setApplying(false);
        onApply((message.value ?? "").trim());
      } else if (message.type === "error") {
        pendingRequest.current = null;
        setApplying(false);
        setError(message.message ?? "分子画板发生错误");
      }
    },
    [initialSmiles, onApply, send],
  );

  const apply = useCallback(() => {
    const requestId = `smiles-${Date.now()}`;
    pendingRequest.current = requestId;
    setApplying(true);
    send({ type: "get_smiles", requestId });
  }, [send]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.root}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={21} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>分子画板</Text>
            <Text style={styles.subtitle}>Ketcher 在本机运行，应用后只回填 SMILES</Text>
          </View>
          <Pressable style={[styles.apply, (!ready || applying) && styles.disabled]} onPress={apply} disabled={!ready || applying}>
            {applying ? <ActivityIndicator size="small" color={theme.onAccent} /> : <Text style={styles.applyLabel}>应用</Text>}
          </Pressable>
        </View>

        {Platform.OS !== "android" ? (
          <View style={styles.center}>
            <Text style={styles.error}>分子画板当前随 Android 安装包离线提供；此平台请直接输入 SMILES。</Text>
          </View>
        ) : uri ? (
          <WebView
            ref={webView}
            source={{ uri }}
            style={styles.webView}
            onMessage={receive}
            onError={(event) => setError(event.nativeEvent.description)}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.loading}>正在打开本地画板…</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBar}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.surface },
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(3),
    paddingHorizontal: theme.space(3),
    paddingTop: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.surface,
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: theme.surfaceAlt },
  headerCopy: { flex: 1 },
  title: { color: theme.text, fontSize: 17, fontWeight: "700" },
  subtitle: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  apply: { minWidth: 66, height: 40, borderRadius: 20, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.space(3) },
  applyLabel: { color: theme.onAccent, fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  webView: { flex: 1, backgroundColor: "#faf9f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space(3), padding: theme.space(6) },
  loading: { color: theme.textDim, fontSize: 13 },
  error: { color: theme.danger, fontSize: 13, lineHeight: 20, textAlign: "center" },
  errorBar: { flexDirection: "row", alignItems: "center", gap: theme.space(2), padding: theme.space(3), backgroundColor: theme.dangerSoft },
  errorText: { color: theme.danger, fontSize: 12, flex: 1 },
});
