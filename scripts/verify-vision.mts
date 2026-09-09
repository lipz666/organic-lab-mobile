/**
 * 拿真实端点验证照片识读，用仓库里的实验记录本样张。
 *
 * 这条链替掉了服务器版的 MolScribe + DECIMER + RxnScribe，值得对着真图跑一次：
 * 字段读得对不对、该空的有没有空着、有没有自作主张替用户换算。
 *
 *   npm run verify:vision
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRecord, parseExtraction } from "../src/agent/extraction";
import type { FetchLike, ProviderConfig } from "../src/agent/provider";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "tests", "fixtures", "notebook-page-with-scheme.png");

const config: ProviderConfig = {
  baseUrl: process.env.ORGANICLAB_BASE_URL ?? "",
  apiKey: process.env.ORGANICLAB_API_KEY ?? "",
  model: process.env.ORGANICLAB_MODEL ?? "gemini-3.7-flash-high",
  fetchImpl: globalThis.fetch as unknown as FetchLike,
};

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

function offlineChecks(): void {
  // 模型爱加 ``` 围栏、把数字连单位一起给、把条件塞进嵌套对象——三种都得吃下来。
  const messy = parseExtraction(
    '```json\n{"experiment_code":"AB-1","yield_percent":"78 %","conditions":{"solvent":"MeCN","wavelength_nm":450},"materials":[{"name":"cat","amount":"2","unit":"mol%"}]}\n```',
  );
  report("吃得下带围栏的返回", messy.code === "AB-1", `code=${messy.code}`);
  report("数字带单位也能解析", messy.yieldPercent === 78, `yield=${messy.yieldPercent}`);
  report("条件嵌套或平铺都认", messy.solvent === "MeCN" && messy.wavelengthNm === 450, `solvent=${messy.solvent}`);
  report("缺的字段是 null 不是 0", messy.temperatureC === null && messy.notes === null, `temp=${messy.temperatureC}`);

  const empty = parseExtraction('{"materials":[],"observations":[]}');
  report("空返回不炸", empty.code === null && empty.materials.length === 0, "全部为空");
}

async function liveChecks(): Promise<void> {
  const base64 = readFileSync(fixture).toString("base64");
  const record = await extractRecord(config, base64, "image/png");

  report("读出实验编号", record.code === "LZ-4-088", String(record.code));
  report("读出日期", record.performedOn === "2026-07-28", String(record.performedOn));
  report("读出收率", record.yieldPercent === 78, String(record.yieldPercent));
  report("读出产物质量", record.productMassMg === 32.5, String(record.productMassMg));
  report("读出溶剂", record.solvent === "MeCN", String(record.solvent));
  report(
    "读出光源参数",
    record.wavelengthNm === 450 && record.powerW === 40 && record.distanceCm === 5,
    `${record.wavelengthNm} nm / ${record.powerW} W / ${record.distanceCm} cm`,
  );
  report("读出反应时间", record.durationHours === 12, String(record.durationHours));
  report(
    "从结构式读出反应 SMILES",
    Boolean(record.reactionSmiles?.includes(">>")),
    String(record.reactionSmiles),
  );

  const catalyst = record.materials.find((material) => /ir\(ppy\)/i.test(material.name));
  report(
    "催化剂负载按原样保留",
    catalyst?.unit?.includes("mol%") === true && catalyst.amount === 2,
    catalyst ? `${catalyst.name} ${catalyst.amount} ${catalyst.unit}` : "没读到催化剂",
  );

  // 页面上没有的东西不能凭空出现。这一页没写压力，也没写产物名称之外的表征。
  report("没写的字段留空", record.temperatureC === 25 || record.temperatureC === null, `temperature=${record.temperatureC}`);
  report("观察被收进列表", record.observations.length >= 2, `${record.observations.length} 条观察`);
}

async function main(): Promise<void> {
  offlineChecks();
  if (!config.baseUrl || !config.apiKey) {
    console.log("\n跳过联网检查：缺少 ORGANICLAB_BASE_URL / ORGANICLAB_API_KEY");
  } else {
    await liveChecks();
  }
  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
