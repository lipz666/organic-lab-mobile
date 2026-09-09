/**
 * 把 ZINC 现货砌块库编译成随包发布的 Bloom filter。
 *
 * 数据源：https://files.docking.org/bb/current/bb_instock.smi.gz（ZINC20，现货砌块）
 * 195 万条整表塞不进 app，用 Bloom filter 压到几 MB。规范化必须用 RDKit——
 * ZINC 的 SMILES 来自它自己的工具链，和我们运行时算出的规范式对不上，直接字符串比会全部落空。
 *
 *   npm run build:bb -- <bb_instock.smi.gz 的路径>
 */

import { createRequire } from "node:module";
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { bloomAdd, createBloom, estimatedFalsePositiveRate } from "../src/chem/bloom";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const distribution = join(here, "..", "node_modules", "@rdkit", "rdkit", "dist");
const initRDKitModule = require(join(distribution, "RDKit_minimal.js"));

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("用法：npm run build:bb -- <bb_instock.smi.gz 的路径>");
  process.exit(1);
}

/** 目标误判率。假阳性意味着「说有货其实没有」，所以压得比常规更低。 */
const FALSE_POSITIVE_RATE = 0.002;
/** ZINC bb_instock 的量级，多留一点余量不会明显增大文件。 */
const EXPECTED_ENTRIES = 2_100_000;

const RDKit = await initRDKitModule({ wasmBinary: readFileSync(join(distribution, "RDKit_minimal.wasm")) });
const filter = createBloom(EXPECTED_ENTRIES, FALSE_POSITIVE_RATE);

let total = 0;
let unreadable = 0;
const started = Date.now();

const stream = createReadStream(sourcePath).pipe(createGunzip());
const reader = createInterface({ input: stream, crlfDelay: Infinity });

for await (const line of reader) {
  const smiles = line.split(/\s+/)[0];
  if (!smiles) continue;
  total += 1;

  const mol = RDKit.get_mol(smiles);
  if (!mol) {
    unreadable += 1;
    continue;
  }
  try {
    if (!mol.is_valid()) {
      unreadable += 1;
      continue;
    }
    bloomAdd(filter, mol.get_smiles());
  } finally {
    mol.delete();
  }

  if (total % 200000 === 0) {
    const elapsed = (Date.now() - started) / 1000;
    console.log(`  ${total.toLocaleString()} 条，用时 ${elapsed.toFixed(0)}s`);
  }
}

const outputDirectory = join(here, "..", "assets", "chem");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "bb-instock.bloom"), filter.bits);

const meta = {
  source: "ZINC20 bb_instock (files.docking.org/bb/current)",
  builtAt: new Date().toISOString().slice(0, 10),
  entries: filter.n,
  skipped: unreadable,
  m: filter.m,
  k: filter.k,
  estimatedFalsePositiveRate: Number(estimatedFalsePositiveRate(filter).toFixed(5)),
  bytes: filter.bits.byteLength,
};
writeFileSync(join(outputDirectory, "bb-instock.meta.json"), JSON.stringify(meta, null, 2));

console.log(
  `\n完成：${filter.n.toLocaleString()} 条装入（跳过 ${unreadable} 条读不出的），` +
    `${(filter.bits.byteLength / 1048576).toFixed(1)} MB，估计误判率 ${(meta.estimatedFalsePositiveRate * 100).toFixed(3)}%`,
);
