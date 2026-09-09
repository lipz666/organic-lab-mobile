import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  base: "./",
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: path.resolve(import.meta.dirname, "../assets/ketcher"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    target: "es2020",
  },
});
