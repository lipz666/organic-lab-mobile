/**
 * 让 release 构建用自己的签名密钥，而不是模板里的 debug key。
 *
 * 写成 config plugin 而不是直接改 android/app/build.gradle：`expo prebuild --clean`
 * 会重新生成整个 android 目录，手改的东西会被抹掉。插件在每次 prebuild 时重新打上。
 *
 * 密钥与口令从 credentials/keystore.properties 读，那个目录不入库。
 * 文件不存在时**不报错、退回 debug 签名**——克隆仓库的人应该能直接跑起来，
 * 只是他们打出的包不是你签的。
 */

const { withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");
const { copyFileSync, existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const PROPERTIES = "keystore.properties";

function readCredentials(projectRoot) {
  const file = join(projectRoot, "credentials", PROPERTIES);
  if (!existsSync(file)) return null;

  const entries = Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );

  if (!entries.storeFile || !entries.storePassword || !entries.keyAlias || !entries.keyPassword) return null;
  return entries;
}

/** 把 keystore 复制进 android/app，gradle 才找得到。 */
function withKeystoreFile(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const credentials = readCredentials(mod.modRequest.projectRoot);
      if (credentials) {
        copyFileSync(
          join(mod.modRequest.projectRoot, "credentials", credentials.storeFile),
          join(mod.modRequest.platformProjectRoot, "app", credentials.storeFile),
        );
      }
      return mod;
    },
  ]);
}

function withSigningConfig(config) {
  return withAppBuildGradle(config, (mod) => {
    const credentials = readCredentials(mod.modRequest.projectRoot);
    if (!credentials) {
      console.warn("[withReleaseSigning] 没有 credentials/keystore.properties，release 仍用 debug 签名");
      return mod;
    }

    const block = `        release {
            storeFile file('${credentials.storeFile}')
            storePassword '${credentials.storePassword}'
            keyAlias '${credentials.keyAlias}'
            keyPassword '${credentials.keyPassword}'
        }
    }`;

    // signingConfigs 和 buildTypes 里都有 `release {`，也都有 `signingConfigs.debug`。
    // 从 buildTypes 处切开分别处理，否则正则会跨块匹配，把 buildTypes.debug 改掉。
    const marker = "buildTypes {";
    const split = mod.modResults.contents.indexOf(marker);
    if (split === -1) {
      console.warn("[withReleaseSigning] build.gradle 里找不到 buildTypes，跳过");
      return mod;
    }

    const head = mod.modResults.contents
      .slice(0, split)
      .replace(/(signingConfigs \{[\s\S]*?keyPassword 'android'\n        \}\n)    \}/, `$1${block}`);

    // 切开之后，tail 里的第一个 `release {` 必定是 buildTypes.release。
    const tail = mod.modResults.contents
      .slice(split)
      .replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, "$1signingConfig signingConfigs.release");

    mod.modResults.contents = head + tail;

    return mod;
  });
}

module.exports = function withReleaseSigning(config) {
  return withSigningConfig(withKeystoreFile(config));
};
