#!/usr/bin/env node
/**
 * 把 RDKit MinimalLib 从 node_modules 复制进 assets。
 *
 * 不把 7MB 的 .wasm 提交进仓库——它是 @rdkit/rdkit 的构建产物，装依赖时复制一份就行。
 * .js 要改名成 .js.txt：metro 不会把 .js 当资源打包，改成 txt 才能作为文件取到源码。
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "node_modules", "@rdkit", "rdkit", "dist");
const target = join(here, "..", "assets", "rdkit");

mkdirSync(target, { recursive: true });
copyFileSync(join(source, "RDKit_minimal.js"), join(target, "RDKit_minimal.js.txt"));
copyFileSync(join(source, "RDKit_minimal.wasm"), join(target, "RDKit_minimal.wasm"));
console.log("已复制 RDKit MinimalLib → assets/rdkit/");
