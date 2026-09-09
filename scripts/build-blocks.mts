/**
 * 把 building-blocks.json 编译成带 InChIKey 的索引。
 *
 * 用真实 RDKit 规范化，顺带就检验了每条 SMILES 写得对不对——写错的会在这里被挡下来，
 * 而不是等到 app 里匹配不上才发现。
 *
 *   npm run build:blocks
 */

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const distribution = join(here, "..", "node_modules", "@rdkit", "rdkit", "dist");
const initRDKitModule = require(join(distribution, "RDKit_minimal.js"));

type Block = { name: string; smiles: string; category: string };

const source = JSON.parse(
  readFileSync(join(here, "..", "assets", "chem", "building-blocks.json"), "utf8"),
) as { version: string; note: string; blocks: Block[] };

const RDKit = await initRDKitModule({
  wasmBinary: readFileSync(join(distribution, "RDKit_minimal.wasm")),
});

const compiled: { name: string; smiles: string; canonical: string; inchiKey: string; category: string }[] = [];
const rejected: { name: string; smiles: string }[] = [];

for (const block of source.blocks) {
  const mol = RDKit.get_mol(block.smiles);
  if (!mol || !mol.is_valid()) {
    rejected.push({ name: block.name, smiles: block.smiles });
    mol?.delete();
    continue;
  }
  try {
    const canonical = mol.get_smiles();
    const inchiKey = RDKit.get_inchikey_for_inchi(mol.get_inchi());
    compiled.push({ name: block.name, smiles: block.smiles, canonical, inchiKey, category: block.category });
  } finally {
    mol.delete();
  }
}

if (rejected.length > 0) {
  console.error(`RDKit 读不出这 ${rejected.length} 条，先修好再编译：`);
  for (const entry of rejected) console.error(`  ${entry.name}  ${entry.smiles}`);
  process.exit(1);
}

// InChIKey 可能重复（同一化合物不同写法），保留第一个，其余提示出来。
const seen = new Map<string, string>();
const duplicates: string[] = [];
for (const entry of compiled) {
  const existing = seen.get(entry.inchiKey);
  if (existing) duplicates.push(`${entry.name} 与 ${existing} 是同一化合物`);
  else seen.set(entry.inchiKey, entry.name);
}

const lines = [
  "// 由 scripts/build-blocks.mts 从 assets/chem/building-blocks.json 生成，不要手改。",
  "// 重新生成：npm run build:blocks",
  "",
  "export type BuildingBlock = {",
  "  name: string;",
  "  canonical: string;",
  "  inchiKey: string;",
  "  category: string;",
  "};",
  "",
  `export const BUILDING_BLOCK_VERSION = ${JSON.stringify(source.version)};`,
  "",
  "export const BUILDING_BLOCKS: BuildingBlock[] = [",
  ...compiled.map(
    (entry) =>
      `  { name: ${JSON.stringify(entry.name)}, canonical: ${JSON.stringify(entry.canonical)}, inchiKey: ${JSON.stringify(entry.inchiKey)}, category: ${JSON.stringify(entry.category)} },`,
  ),
  "];",
  "",
  "/** InChIKey → 砌块。连接层（第一段 14 位）单独索引，用于忽略立体/盐型的宽松匹配。 */",
  "export const BY_INCHIKEY = new Map(BUILDING_BLOCKS.map((block) => [block.inchiKey, block]));",
  "export const BY_SKELETON = new Map(BUILDING_BLOCKS.map((block) => [block.inchiKey.split('-')[0], block]));",
  "",
  "/**",
  " * 给提示词用的目录摘要：按类别分组的名称+SMILES。",
  " * 模型看得到我们有什么，才谈得上「拆到能买到的东西」。",
  " */",
  "export function catalogDigest(): string {",
  "  const groups = new Map<string, string[]>();",
  "  for (const block of BUILDING_BLOCKS) {",
  "    const list = groups.get(block.category) ?? [];",
  "    list.push(`${block.name} ${block.canonical}`);",
  "    groups.set(block.category, list);",
  "  }",
  "  return [...groups.entries()]",
  "    .map(([category, items]) => `【${category}】${items.join('；')}`)",
  "    .join('\\n');",
  "}",
  "",
];

writeFileSync(join(here, "..", "src", "chem", "buildingBlocks.generated.ts"), lines.join("\n"), "utf8");
console.log(`已编译 ${compiled.length} 个砌块 → src/chem/buildingBlocks.generated.ts`);
if (duplicates.length > 0) console.log(`重复项（已保留第一个）：\n  ${duplicates.join("\n  ")}`);
