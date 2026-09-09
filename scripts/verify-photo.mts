/**
 * 光化学确定性计算的验证。不需要 API key，纯本地。
 *
 *   npm run verify:photo
 */

import { photonBudget, photonEnergy, photonEquivalents, photonFlux } from "../src/photo/photon";
import { fitSternVolmer, parsePairs } from "../src/photo/sternVolmer";
import { gaussianEmission, parseSpectrum, peakWavelength, spectralOverlap, valueAt } from "../src/photo/spectra";
import { screenCatalysts } from "../src/photo/photocatalysts";
import {
  analyzeCampaign,
  recommendNext,
  type CampaignObservation,
  type CampaignVariable,
} from "../src/photo/campaign";

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

function close(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

// ---- 光子能量：对着教科书数值 ----
const e450 = photonEnergy(450);
report("450 nm 光子能量", close(e450.energyPerPhotonJ, 4.414e-19, 2e-22), `${e450.energyPerPhotonJ.toExponential(3)} J`);
report("450 nm 每摩尔能量", close(e450.energyPerMolKJ, 265.9, 0.5), `${e450.energyPerMolKJ.toFixed(1)} kJ/mol`);
report("450 nm 光子能量 eV", close(e450.energyEv, 2.755, 0.005), `${e450.energyEv.toFixed(3)} eV`);

// 波长翻倍能量减半
const e900 = photonEnergy(900);
report("能量与波长成反比", close(e900.energyPerPhotonJ * 2, e450.energyPerPhotonJ, 1e-25), "E(900) × 2 = E(450)");

// ---- 光子通量：最重要的那条拒绝 ----
const nominal = photonFlux({ wavelengthNm: 450, powerValue: 30, powerUnit: "W", powerKind: "electrical_nominal" });
report(
  "标称电功率拒绝算通量",
  nominal.molPhotonsPerSecond === null && nominal.warnings.length >= 2,
  nominal.warnings[0] ?? "居然算出来了",
);

const withEfficiency = photonFlux({
  wavelengthNm: 450,
  powerValue: 30,
  powerUnit: "W",
  powerKind: "electrical_nominal",
  assumedOpticalEfficiency: 0.2,
});
report(
  "给了效率才估算，且标为 estimated",
  withEfficiency.molPhotonsPerSecond !== null && withEfficiency.provenance.sourceKind === "estimated",
  `${withEfficiency.provenance.sourceKind}，${withEfficiency.warnings.length} 条警告`,
);

const measured = photonFlux({ wavelengthNm: 450, powerValue: 100, powerUnit: "mW", powerKind: "optical_measured" });
// 100 mW @ 450 nm → 0.1 / 4.414e-19 = 2.266e17 photons/s = 3.76e-7 mol/s
report(
  "实测光功率算得出通量",
  measured.molPhotonsPerSecond !== null && close(measured.molPhotonsPerSecond, 3.762e-7, 5e-10),
  `${measured.molPhotonsPerSecond?.toExponential(3)} mol/s`,
);

// ---- 剂量与当量 ----
const budget = photonBudget({
  wavelengthNm: 450,
  powerValue: 100,
  powerUnit: "mW",
  powerKind: "optical_measured",
  hours: 12,
  substrateMmol: 0.2,
});
// 3.762e-7 mol/s × 43200 s = 1.625e-2 mol photons
report("12 小时光子剂量", budget.dose !== null && close(budget.dose.molPhotons, 1.625e-2, 5e-5), `${budget.dose?.molPhotons.toExponential(3)} mol`);
// 1.625e-2 / 2e-4 = 81.3 equiv
report(
  "光子当量",
  budget.equivalents !== null && close(budget.equivalents.incidentEquivalents, 81.3, 0.5),
  `${budget.equivalents?.incidentEquivalents.toFixed(1)} equiv`,
);
report(
  "当量结果声明是入射而非吸收",
  (budget.equivalents?.warnings ?? []).some((warning) => warning.includes("入射")),
  budget.equivalents?.warnings[0] ?? "没有声明",
);

// 通量算不出来时，整条链停住而不是接着编
const blocked = photonBudget({
  wavelengthNm: 450,
  powerValue: 30,
  powerUnit: "W",
  powerKind: "electrical_nominal",
  hours: 12,
  substrateMmol: 0.2,
});
report("通量算不出时剂量也不给", blocked.dose === null && blocked.equivalents === null, "dose = null");

// ---- 光谱解析 ----
const absorption = parseSpectrum(
  "wavelength,absorbance\n380,0.10\n400,0.35\n420,0.80\n440,0.95\n450,0.88\n460,0.60\n480,0.20\n500,0.05",
  "4CzIPN",
  "absorbance",
);
report("跳过表头解析光谱", absorption.points.length === 8, `${absorption.points.length} 个点`);
report("找到 λmax", peakWavelength(absorption)?.wavelengthNm === 440, `${peakWavelength(absorption)?.wavelengthNm} nm`);
report("插值取中间值", close(valueAt(absorption, 430) ?? 0, 0.875, 1e-9), String(valueAt(absorption, 430)));
report("范围外返回 null 而不外推", valueAt(absorption, 600) === null, "null");

const tabSeparated = parseSpectrum("400\t0.5\n410\t0.7", "tab", "absorbance");
report("制表符分隔也认", tabSeparated.points.length === 2, `${tabSeparated.points.length} 个点`);

// ---- LED 发射与重叠 ----
const led450 = gaussianEmission(450, 20);
report("高斯发射峰在设定波长", peakWavelength(led450)?.wavelengthNm === 450, `${peakWavelength(led450)?.wavelengthNm} nm`);

const overlap450 = spectralOverlap(led450, absorption);
report(
  "450 nm 与该吸收谱重叠良好",
  overlap450.verdict === "strong" && overlap450.photonWeightedAbsorbance > 0.5,
  `${(overlap450.photonWeightedAbsorbance * 100).toFixed(0)}% / ${overlap450.verdict}`,
);

const led520 = gaussianEmission(520, 20);
const overlap520 = spectralOverlap(led520, absorption);
report(
  "520 nm 明显更差",
  overlap520.photonWeightedAbsorbance < overlap450.photonWeightedAbsorbance,
  `520 nm: ${(overlap520.photonWeightedAbsorbance * 100).toFixed(0)}%`,
);
report(
  "落在数据范围外的光子被如实报出",
  overlap520.fractionOutsideAbsorptionData > 0.2 && overlap520.warnings.some((w) => w.includes("覆盖范围")),
  `${(overlap520.fractionOutsideAbsorptionData * 100).toFixed(0)}% 在范围外`,
);
report(
  "重叠结论不越界到可行性",
  overlap450.warnings.some((warning) => warning.includes("不代表反应做得通")),
  overlap450.warnings[overlap450.warnings.length - 1],
);

// ---- Stern–Volmer ----
// 构造 KSV = 120 M⁻¹ 的理想数据
const concentrations = [0, 0.002, 0.004, 0.006, 0.008, 0.01];
const ideal = concentrations.map((q) => 1 + 120 * q);
const fit = fitSternVolmer({ concentrations, ratios: ideal });
report("理想数据拟合出 KSV", close(fit.ksv, 120, 1e-6), `KSV = ${fit.ksv.toFixed(2)} M⁻¹`);
report("理想数据截距为 1", close(fit.intercept, 1, 1e-6), `intercept = ${fit.intercept.toFixed(4)}`);
report("理想数据 R² = 1", close(fit.rSquared, 1, 1e-9), `R² = ${fit.rSquared.toFixed(4)}`);

const withLifetime = fitSternVolmer({ concentrations, ratios: ideal, lifetimeNs: 5 });
// 120 / 5e-9 = 2.4e10
report("有寿命时算 kq", withLifetime.kqPerMPerS !== null && close(withLifetime.kqPerMPerS, 2.4e10, 1e7), `${withLifetime.kqPerMPerS?.toExponential(2)} M⁻¹s⁻¹`);

// 完美数据不能误报离群点：残差是 1e-16 量级的浮点噪声，
// 若用相对判据会把噪声放大成"离群"。
report("完美数据不误报离群点", fit.outlierIndices.length === 0, `报了 ${fit.outlierIndices.length} 个`);

// 掺一个离群点
const withOutlier = [...ideal];
withOutlier[3] = 3.5;
const outlierFit = fitSternVolmer({ concentrations, ratios: withOutlier });
report("离群点被标出", outlierFit.outlierIndices.includes(3), `离群索引 ${outlierFit.outlierIndices.join(",")}`);

// 由强度反推比值
const intensities = ideal.map((ratio) => 1000 / ratio);
const fromIntensity = fitSternVolmer({ concentrations, intensities });
report("由 I 反推 I₀/I", close(fromIntensity.ksv, 120, 1e-6), `KSV = ${fromIntensity.ksv.toFixed(2)}`);
report(
  "自动取 I₀ 时会声明",
  fromIntensity.warnings.some((warning) => warning.includes("未提供 I₀")),
  fromIntensity.warnings[0],
);

const pairs = parsePairs("0, 1000\n0.002, 806.5\n0.004, 675.7");
report("解析粘贴的两列", pairs.a.length === 3 && pairs.b[0] === 1000, `${pairs.a.length} 行`);

let rejected = false;
try {
  fitSternVolmer({ concentrations: [0, 0.001], ratios: [1, 1.1] });
} catch {
  rejected = true;
}
report("点数不足时拒绝拟合", rejected, "抛错");

// ---- 光催化剂筛选 ----
const oxidation = screenCatalysts({ role: "oxidation", substratePotential: 1.5, wavelengthNm: 450 });
const topOx = oxidation[0];
report(
  "强氧化剂排在氧化任务前列",
  topOx.thermodynamicallyFeasible === true && (topOx.catalyst.excitedStateOxidation ?? 0) > 1.5,
  `${topOx.catalyst.name}，驱动力 ${topOx.drivingForce?.toFixed(2)} V`,
);

const reduction = screenCatalysts({ role: "reduction", substratePotential: -1.5, wavelengthNm: 400 });
report(
  "还原任务选还原能力强的",
  reduction[0].thermodynamicallyFeasible === true && (reduction[0].catalyst.excitedStateReduction ?? 0) < -1.5,
  `${reduction[0].catalyst.name}，E* = ${reduction[0].catalyst.excitedStateReduction} V`,
);

// 底物极难氧化时，所有催化剂都应判为不利，而不是硬推一个出来
const impossible = screenCatalysts({ role: "oxidation", substratePotential: 3.0 });
report(
  "够不着的底物不硬推候选",
  impossible.every((entry) => entry.thermodynamicallyFeasible !== true),
  `${impossible.filter((e) => e.thermodynamicallyFeasible === true).length} 个被判可行`,
);

// 缺数据必须是 null，不能当成不可行
const noData = screenCatalysts({ role: "oxidation", substratePotential: null, wavelengthNm: 450 });
report(
  "没有底物电位时不下热力学结论",
  noData.every((entry) => entry.thermodynamicallyFeasible === null),
  "全部为 null",
);

const ent = screenCatalysts({ role: "energy_transfer", substrateTripletKcal: 50 });
report(
  "能量转移按三重态能量筛",
  ent[0].thermodynamicallyFeasible === true && (ent[0].catalyst.tripletEnergyKcal ?? 0) > 50,
  `${ent[0].catalyst.name}，ET = ${ent[0].catalyst.tripletEnergyKcal} kcal/mol`,
);

const filtered = screenCatalysts({ role: "oxidation", substratePotential: 1.0, availableIds: ["4czipn"] });
report("可只在现有催化剂里挑", filtered.length === 1 && filtered[0].catalyst.id === "4czipn", filtered[0].catalyst.name);

const conditionNoted = oxidation.every((entry) => entry.reasons.some((reason) => reason.includes("条件")));
report("每个结果都带测量条件", conditionNoted, "全部标注了溶剂与参比");

// ---- 条件优化 Campaign ----
const variables: CampaignVariable[] = [
  { name: "波长", kind: "continuous", min: 380, max: 520, unit: "nm" },
  { name: "催化剂负载", kind: "continuous", min: 0.5, max: 5, unit: "mol%" },
  { name: "溶剂", kind: "categorical", options: ["MeCN", "DMF", "DMSO", "丙酮"] },
];

const empty = recommendNext([], variables, 4);
report("没有数据时先给基准点", empty.length === 1 && empty[0].strategy === "explore", empty[0].purpose.slice(0, 24));

const observations: CampaignObservation[] = [
  { conditions: { 波长: 450, 催化剂负载: 2, 溶剂: "MeCN" }, outcome: 45, label: "PZ-1" },
  { conditions: { 波长: 450, 催化剂负载: 3, 溶剂: "MeCN" }, outcome: 62, label: "PZ-2" },
  { conditions: { 波长: 450, 催化剂负载: 4, 溶剂: "MeCN" }, outcome: 58, label: "PZ-3" },
  { conditions: { 波长: 450, 催化剂负载: 3, 溶剂: "DMF" }, outcome: 41, label: "PZ-4" },
];

const analysis = analyzeCampaign(observations, variables);
report("找出最好的一组", analysis.best?.label === "PZ-2", `${analysis.best?.label} = ${analysis.best?.outcome}%`);
report(
  "指出从未变过的变量",
  analysis.coverage.find((entry) => entry.name === "波长")?.neverVaried === true &&
    analysis.warnings.some((warning) => warning.includes("波长")),
  analysis.warnings.find((w) => w.includes("波长")) ?? "没有指出",
);
report(
  "识别单变量对照组",
  analysis.pairs.length >= 3 && analysis.pairs[0].variable !== undefined,
  `${analysis.pairs.length} 对，最大差异在 ${analysis.pairs[0].variable}（${analysis.pairs[0].delta > 0 ? "+" : ""}${analysis.pairs[0].delta}）`,
);

const next = recommendNext(observations, variables, 3);
report("给出下一批建议", next.length === 3, next.map((s) => s.strategy).join(" / "));
report(
  "优先动从未变过的变量",
  next[0].strategy === "discriminate" && next[0].changedFrom?.startsWith("波长") === true,
  next[0].changedFrom ?? "无",
);
report(
  "每条建议都基于当前最好点",
  next.every((suggestion) => suggestion.conditions["催化剂负载"] !== undefined),
  "条件完整",
);
report(
  "每条建议只改一个变量",
  next.every((suggestion) => {
    const differing = variables.filter(
      (variable) => String(suggestion.conditions[variable.name]) !== String(analysis.best!.conditions[variable.name]),
    );
    return differing.length === 1;
  }),
  "全部为单变量",
);
report("建议互不重复", new Set(next.map((s) => s.changedFrom)).size === next.length, "3 条各不相同");
report("每条建议都写了目的", next.every((s) => s.purpose.length > 10), "全部有说明");

// 全都只差一个变量时不应报「无法归因」
const noPairWarning = analyzeCampaign(observations, variables).warnings.some((w) => w.includes("无法把效应归因"));
report("有对照组时不误报归因问题", !noPairWarning, "未误报");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
