/**
 * Recreates Ketcher's Android-only loopback asset server after every prebuild.
 * Native folders are generated and ignored, so the implementation lives here.
 */

const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

function withServerRegistration(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.contents.includes("add(KetcherAssetServerPackage())")) return mod;

    const anchor = "PackageList(this).packages.apply {";
    if (!mod.modResults.contents.includes(anchor)) {
      throw new Error("[withKetcherAssetServer] MainApplication package list anchor not found");
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      anchor,
      `${anchor}\n          add(KetcherAssetServerPackage())`,
    );
    return mod;
  });
}

function withLoopbackSecurity(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return mod;
  });
}

function withNativeSources(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const androidRoot = mod.modRequest.platformProjectRoot;
      const source = join(projectRoot, "plugins", "ketcher-native");
      const kotlin = join(androidRoot, "app", "src", "main", "java", "org", "organiclab", "mobile");
      const xml = join(androidRoot, "app", "src", "main", "res", "xml");
      mkdirSync(kotlin, { recursive: true });
      mkdirSync(xml, { recursive: true });
      copyFileSync(join(source, "KetcherAssetServerModule.kt"), join(kotlin, "KetcherAssetServerModule.kt"));
      copyFileSync(join(source, "KetcherAssetServerPackage.kt"), join(kotlin, "KetcherAssetServerPackage.kt"));
      copyFileSync(join(source, "network_security_config.xml"), join(xml, "network_security_config.xml"));
      return mod;
    },
  ]);
}

module.exports = function withKetcherAssetServer(config) {
  return withNativeSources(withLoopbackSecurity(withServerRegistration(config)));
};
