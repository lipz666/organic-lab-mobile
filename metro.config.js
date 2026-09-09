// Metro 配置。除了 web 端跑 expo-sqlite 需要的两项，其余保持 Expo 默认。
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite 的 web 实现是 wa-sqlite，需要把 .wasm 当资源解析，
// 并且它用了 SharedArrayBuffer，浏览器要求页面处于跨源隔离状态。
// 这两项只影响 web 开发预览，原生端用系统 SQLite，不走这条路。
config.resolver.assetExts.push("wasm");
// RDKit 的 JS 要作为文件内容取出来注入 WebView，所以以 .js.txt 存放并按资源打包。
config.resolver.assetExts.push("txt");
// ZINC 现货砌块的 Bloom filter，作为二进制资源打包。
config.resolver.assetExts.push("bloom");
// Ketcher 由 Vite 构建成一个离线 HTML，再由原生 WebView 加载。
config.resolver.assetExts.push("html");
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  return middleware(req, res, next);
};

module.exports = config;
