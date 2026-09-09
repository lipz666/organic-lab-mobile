import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { readableMath } from "../src/ui/textFormatting";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function check(label: string, action: () => void) {
  action();
  console.log(`  ok   ${label}`);
}

check("化学式下标不再显示 LaTeX 控制符", () => {
  assert.equal(readableMath(String.raw`$\text{C}_8\text{H}_8\text{O}$`), "C₈H₈O");
});

check("单位与反应箭头可读", () => {
  assert.equal(readableMath(String.raw`$120.15\text{ g/mol}$`), "120.15 g/mol");
  assert.equal(readableMath(String.raw`A \rightarrow B`), "A → B");
});

check("上下标和常见数学符号转成 Unicode", () => {
  assert.equal(readableMath(String.raw`10^{-3}\,mol \pm 0.1`), "10⁻³ mol ± 0.1");
});

check("Ketcher 是随包分发的单文件资源", () => {
  const path = resolve(root, "assets/ketcher/index.html");
  assert.ok(statSync(path).size > 5_000_000, "Ketcher bundle 体积异常，可能没有打入 Indigo");
  const html = readFileSync(path, "utf8");
  assert.match(html, /<script type="module" crossorigin>/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+(?:stylesheet|modulepreload)[^>]+href=/i);
});

console.log("\nUI 离线检查全部通过");
