/**
 * 用真实的 RDKit WASM 验证 assets/chem/ops.js.txt。
 *
 * 这里 require 的就是 app 里 WebView 通过 <script> 加载的**同一个文件**，
 * 不是副本、也不是 TS 版本。所以这些断言覆盖的是线上真正执行的逻辑，
 * 唯一没被覆盖的是 WebView 的加载与消息通道。
 *
 *   npm run verify:chem      （不需要 API key，纯本地）
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";


const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { rdkitOps } = require(join(here, "..", "assets", "chem", "ops.js.txt")) as {
  rdkitOps: (RDKit: unknown, op: string, args: unknown) => unknown;
};
const distribution = join(here, "..", "node_modules", "@rdkit", "rdkit", "dist");
const initRDKitModule = require(join(distribution, "RDKit_minimal.js"));

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const RDKit = await initRDKitModule({ wasmBinary: readFileSync(join(distribution, "RDKit_minimal.wasm")) });
  const run = (op: string, args: unknown) => rdkitOps(RDKit, op, args) as any;

  report("拿得到版本号", run("version", {}).version.startsWith("20"), run("version", {}).version);

  // 同一个分子的不同写法必须收敛到同一个规范式——这才是"标准化"的意义。
  const kekule = run("standardize", { smiles: "CC(=O)C1=CC=CC=C1" });
  const aromatic = run("standardize", { smiles: "CC(=O)c1ccccc1" });
  report(
    "不同写法收敛到同一规范式",
    kekule.canonical === aromatic.canonical,
    `${kekule.canonical} vs ${aromatic.canonical}`,
  );
  report(
    "算出分子量与 InChIKey",
    Math.abs(aromatic.components[0].molecular_weight - 120.15) < 0.01 &&
      aromatic.components[0].inchi_key === "KWOLFJPFCHCOCG-UHFFFAOYSA-N",
    `${aromatic.components[0].molecular_weight} / ${aromatic.components[0].inchi_key}`,
  );

  // 化合价错误是语法检查抓不到、只有真正解析才抓得到的那一类。
  const badValence = run("standardize", { smiles: "C(C)(C)(C)(C)C" });
  report("抓得住化合价错误", badValence.ok === false, badValence.error ?? "居然通过了");

  const unbalanced = run("standardize", { smiles: "CC(=O)c1ccccc1(" });
  report("抓得住括号不配平", unbalanced.ok === false, unbalanced.error ?? "居然通过了");

  const reaction = run("standardize", { smiles: "CC(=O)C1=CC=CC=C1.COC(=O)C=C>>COC(=O)C(CC)C(C)=O" });
  report(
    "反应两侧分别规范化",
    reaction.ok && reaction.is_reaction && reaction.canonical.includes(">>"),
    reaction.canonical ?? reaction.error,
  );

  const svg = run("depict", { smiles: "CC(=O)c1ccccc1" });
  report("画得出结构图", svg.ok && svg.svgs[0].includes("<svg"), `${svg.ok ? svg.svgs[0].length : 0} 字节 SVG`);
  // XML 声明必须去掉：react-native-svg 只认元素，留着它整张图都不渲染。
  report(
    "SVG 从 <svg 开头，没有 XML 声明",
    svg.ok && svg.svgs[0].startsWith("<svg") && !svg.svgs[0].includes("<?xml"),
    svg.ok ? svg.svgs[0].slice(0, 40).replace(/\n/g, " ") : "没画出来",
  );

  const rxnSvg = run("depict", { smiles: "CC(=O)c1ccccc1.COC(=O)C=C>>COC(=O)C(CC)C(C)=O" });
  report(
    "反应图分成反应物与产物",
    rxnSvg.ok && rxnSvg.reactants.length === 2 && rxnSvg.products.length === 1,
    `${rxnSvg.reactants?.length} 反应物 / ${rxnSvg.products?.length} 产物`,
  );

  const same = run("similarity", { a: "CC(=O)c1ccccc1", b: "CC(=O)C1=CC=CC=C1" });
  report("同一分子相似度为 1", same.ok && same.tanimoto === 1, String(same.tanimoto));

  const different = run("similarity", { a: "CC(=O)c1ccccc1", b: "CCCCCCO" });
  report("不同分子相似度明显更低", different.ok && different.tanimoto < 0.2, String(different.tanimoto));

  const badArg = run("similarity", { a: "CC(=O)c1ccccc1", b: "不是SMILES" });
  report("坏输入不炸只报错", badArg.ok === false, badArg.error);

  report("未知操作被拒", run("nope", {}).ok === false, run("nope", {}).error);

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
