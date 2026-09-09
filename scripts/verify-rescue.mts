/**
 * Photo Reaction Rescue 端到端验证。
 *
 * 场景是构造的但有诊断价值：同一个反应，PZ-101 用校准过的灯、2 mL 得到 82%；
 * 当前实验换了没校准的灯、体积放大到 8 mL，只剩 12%。化学条件完全一致。
 * 正确的诊断应该指向光子传递，而不是继续换碱。
 *
 *   npm run verify:rescue
 */

import { detectMissing, parseRescue, runRescue, type ExperimentSummary, type RescueContext } from "../src/photo/rescue";
import { tryPhotonBudget } from "../src/photo/rescue";
import type { FetchLike, ProviderConfig } from "../src/agent/provider";

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

const base: Omit<ExperimentSummary, "id" | "code"> = {
  title: "烯酮 [2+2]",
  performedOn: "2026-08-20",
  yieldPercent: null,
  solvent: "MeCN",
  temperatureC: 25,
  durationHours: 12,
  reactionSmiles: "CC(=O)c1ccccc1.COC(=O)C=C>>COC(=O)C(CC)C(C)=O",
  photocatalyst: "Ir(ppy)3",
  photocatalystLoading: 2,
  wavelengthNm: 450,
  lightSourceName: null,
  distanceCm: null,
  reactionVolumeMl: null,
  degassingMethod: "freeze-pump-thaw ×3",
  atmosphere: "N2",
  observations: [],
};

const target: ExperimentSummary = {
  ...base,
  id: "cur",
  code: "PZ-118",
  yieldPercent: 12,
  lightSourceName: "LED-450-03",
  distanceCm: 5,
  reactionVolumeMl: 8,
  observations: ["TLC 12 h 后仍有大量原料", "反应液颜色比上次浅"],
};

const neighbours: ExperimentSummary[] = [
  {
    ...base,
    id: "n1",
    code: "PZ-101",
    performedOn: "2026-06-02",
    yieldPercent: 82,
    lightSourceName: "LED-450-01",
    distanceCm: 3,
    reactionVolumeMl: 2,
    observations: ["4 h 原料基本消耗"],
  },
  {
    ...base,
    id: "n2",
    code: "PZ-109",
    performedOn: "2026-07-11",
    yieldPercent: 78,
    lightSourceName: "LED-450-01",
    distanceCm: 3,
    reactionVolumeMl: 2,
    photocatalystLoading: 1,
    observations: [],
  },
  {
    ...base,
    id: "n3",
    code: "PZ-114",
    performedOn: "2026-08-02",
    yieldPercent: 9,
    lightSourceName: "LED-450-03",
    distanceCm: 5,
    reactionVolumeMl: 8,
    observations: ["与 PZ-118 类似，转化率低"],
  },
];

const context: RescueContext = {
  target,
  neighbours,
  equipment: [
    { name: "LED-450-01", nominalWavelengthNm: 450, latestCalibration: "2026-05-18" },
    { name: "LED-450-03", nominalWavelengthNm: 450, latestCalibration: null },
  ],
  note: "化学条件和 PZ-101 完全一样，只有灯和体积不同。",
};

// ---- 离线检查 ----
const missing = detectMissing({ ...target, photocatalyst: null, distanceCm: null });
report("检出缺失的关键变量", missing.length === 2 && missing.some((m) => m.includes("光催化剂")), missing.join("；"));
report("变量齐全时不误报", detectMissing(target).length === 0, `${detectMissing(target).length} 项缺失`);

const noBudget = tryPhotonBudget(target, null, 0.2);
report("缺光功率时不给光子预算", noBudget === null, "null");
const withBudget = tryPhotonBudget(target, 120, 0.2);
report("有实测光功率才算", withBudget?.dose !== null && withBudget?.equivalents !== null, `${withBudget?.equivalents?.incidentEquivalents.toFixed(0)} equiv`);

const parsed = parseRescue(
  '```json\n{"headline":"h","hypotheses":[{"category":"bogus","statement":"s","confidence":5}],"experiments":[{"title":"t","information_gain":"nope"}]}\n```',
  [],
);
report("未知分类落到常规化学", parsed.hypotheses[0].category === "ordinary_chemistry", parsed.hypotheses[0].category);
report("置信度被夹到 0–1", parsed.hypotheses[0].confidence === 1, String(parsed.hypotheses[0].confidence));
report("非法枚举取默认值", parsed.experiments[0].informationGain === "medium", parsed.experiments[0].informationGain);

// ---- 联网检查 ----
async function main(): Promise<void> {
  if (!config.baseUrl || !config.apiKey) {
    console.log("\n跳过联网检查：缺少 ORGANICLAB_BASE_URL / ORGANICLAB_API_KEY");
  } else {
    const result = await runRescue(config, context, null);

    report("给出多个假设", result.hypotheses.length >= 2, `${result.hypotheses.length} 个假设`);
    report("按置信度降序", result.hypotheses.every((h, i, all) => i === 0 || all[i - 1].confidence >= h.confidence), result.hypotheses.map((h) => h.confidence.toFixed(2)).join(" ≥ "));
    report("给出 3 个下一步实验", result.experiments.length >= 3, `${result.experiments.length} 个实验`);

    // 核心：这个场景的正确诊断应该指向光子传递
    const topCategory = result.hypotheses[0]?.category;
    report(
      "首要假设指向光子传递",
      topCategory === "photon_delivery",
      `${topCategory} — ${result.hypotheses[0]?.statement.slice(0, 60)}`,
    );

    // 证据必须引用具体实验，不能泛泛而谈
    const citesExperiment = result.hypotheses.some((h) =>
      [...h.evidenceFor, ...h.evidenceAgainst].some((e) => /PZ-1\d\d|LED-450/.test(e)),
    );
    report("证据引用具体实验或设备", citesExperiment, result.hypotheses[0]?.evidenceFor[0]?.slice(0, 70) ?? "无证据");

    // 每个实验都要能区分假设
    const wellFormed = result.experiments.every((e) => e.change && e.predictedIfTrue && e.predictedIfFalse);
    report("每个实验写清了改什么与两种预期", wellFormed, result.experiments.map((e) => e.title).join(" / "));

    const holdsConstant = result.experiments.some((e) => e.holdConstant.length > 0);
    report("有实验明确了保持不变项", holdsConstant, result.experiments.find((e) => e.holdConstant.length)?.holdConstant.join("、") ?? "无");

    // 不许编光功率
    const fabricated = JSON.stringify(result).match(/\d+(\.\d+)?\s*(mW\/cm|mW |W\/cm)/g);
    report("没有编造光功率数值", fabricated === null, fabricated ? fabricated.join(",") : "无");

    console.log(`\n诊断结论：${result.headline}`);
    console.log(`首要假设：${result.hypotheses[0]?.statement}`);
    console.log(`建议实验：${result.experiments.map((e) => e.title).join(" | ")}`);
  }

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
