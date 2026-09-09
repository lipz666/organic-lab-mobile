/** Bloom filter 的验证。不需要网络也不需要 API key。 */

import { bloomAdd, bloomHas, createBloom, estimatedFalsePositiveRate, sizeFor } from "../src/chem/bloom";

let failures = 0;
function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

const { m, k } = sizeFor(1_000_000, 0.002);
report("参数计算合理", k >= 6 && k <= 12 && m / 1_000_000 > 10, `m/n = ${(m / 1e6).toFixed(1)} bits，k = ${k}`);

const filter = createBloom(20000, 0.002);
const inserted: string[] = [];
for (let i = 0; i < 20000; i += 1) {
  const key = `CC(=O)c1ccccc1-${i}`;
  bloomAdd(filter, key);
  inserted.push(key);
}

report("装入的全部查得到（无假阴性）", inserted.every((key) => bloomHas(filter, key)), `${inserted.length} 条全部命中`);

let falsePositives = 0;
const trials = 100000;
for (let i = 0; i < trials; i += 1) {
  if (bloomHas(filter, `NOT-IN-SET-${i}`)) falsePositives += 1;
}
const actual = falsePositives / trials;
report("实际误判率接近设计值", actual < 0.006, `${(actual * 100).toFixed(3)}%（设计 0.2%）`);
report(
  "估算误判率与实测吻合",
  Math.abs(estimatedFalsePositiveRate(filter) - actual) < 0.005,
  `估算 ${(estimatedFalsePositiveRate(filter) * 100).toFixed(3)}%`,
);

// 序列化往返
const restored = { bits: Uint8Array.from(filter.bits), m: filter.m, k: filter.k, n: filter.n };
report(
  "位数组往返后结果一致",
  inserted.slice(0, 500).every((key) => bloomHas(restored, key)),
  "500 条抽样一致",
);

report("空表不误报", !bloomHas(createBloom(1000, 0.01), "anything"), "空表返回 false");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
