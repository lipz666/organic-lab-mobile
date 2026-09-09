/**
 * Photo Reaction Rescue。
 *
 * 用户说「我的光化学反应不工作」时，任务不是写一篇 troubleshooting 长文，
 * 而是：**基于现有证据排出最可能的失败假设，并设计最值得做的下一组实验。**
 *
 * 这里刻意把上下文组装（读实验、读设备、跑确定性计算）和模型调用分开：
 * 上下文由调用方传进来，所以整条链能在 node 里对着真实端点验证。
 */

import { chat, type ProviderConfig } from "../agent/provider";
import { photonBudget, type PhotonBudget } from "./photon";

/** 失败分类，对应 PRD 的 Category A–E。 */
export type FailureCategory =
  | "photon_delivery"
  | "photoredox_thermodynamics"
  | "excited_state_kinetics"
  | "photodegradation"
  | "ordinary_chemistry";

export const CATEGORY_LABELS: Record<FailureCategory, string> = {
  photon_delivery: "光子传递",
  photoredox_thermodynamics: "光氧还热力学",
  excited_state_kinetics: "激发态动力学",
  photodegradation: "光降解",
  ordinary_chemistry: "常规化学",
};

export type Hypothesis = {
  category: FailureCategory;
  statement: string;
  /** 0–1。模型自评，UI 上必须标明这是推断而不是测量。 */
  confidence: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingInformation: string[];
};

export type NextExperiment = {
  title: string;
  change: string;
  holdConstant: string[];
  purpose: string;
  predictedIfTrue: string;
  predictedIfFalse: string;
  informationGain: "high" | "medium" | "low";
  practicalCost: "low" | "medium" | "high";
  testsHypothesis: string;
};

export type RescueResult = {
  headline: string;
  hypotheses: Hypothesis[];
  experiments: NextExperiment[];
  missingCritical: string[];
};

export type ExperimentSummary = {
  id: string;
  code: string | null;
  title: string | null;
  performedOn: string | null;
  yieldPercent: number | null;
  solvent: string | null;
  temperatureC: number | null;
  durationHours: number | null;
  reactionSmiles: string | null;
  photocatalyst: string | null;
  photocatalystLoading: number | null;
  wavelengthNm: number | null;
  lightSourceName: string | null;
  distanceCm: number | null;
  reactionVolumeMl: number | null;
  degassingMethod: string | null;
  atmosphere: string | null;
  observations: string[];
};

export type RescueContext = {
  /** 出问题的那条实验。 */
  target: ExperimentSummary;
  /** 本组做过的相似实验，成功和失败都要给——失败先例往往更有信息量。 */
  neighbours: ExperimentSummary[];
  /** 实验室现有光源，让建议落在真实设备上。 */
  equipment: { name: string; nominalWavelengthNm: number | null; latestCalibration: string | null }[];
  /** 用户补充的自由描述。 */
  note?: string;
};

/** 缺了这些字段就没法判断光子传递，必须先问用户而不是替他假设。 */
const CRITICAL_FIELDS: { key: keyof ExperimentSummary; label: string; why: string }[] = [
  { key: "wavelengthNm", label: "波长", why: "决定能否被光催化剂吸收" },
  { key: "lightSourceName", label: "光源型号或编号", why: "不同灯即使标称同波长，实际辐照度可能差数倍" },
  { key: "distanceCm", label: "光源距离", why: "辐照度随距离快速衰减" },
  { key: "reactionVolumeMl", label: "反应体积", why: "决定光程与单位体积光子供给" },
  { key: "photocatalyst", label: "光催化剂", why: "决定吸收与氧化还原能力" },
  { key: "degassingMethod", label: "除气方式", why: "氧气既猝灭激发态又消耗自由基" },
];

export function detectMissing(target: ExperimentSummary): string[] {
  return CRITICAL_FIELDS.filter((field) => {
    const value = target[field.key];
    return value === null || value === undefined || value === "";
  }).map((field) => `${field.label}（${field.why}）`);
}

/** 能算就算：有实测光功率时给出光子预算，没有就如实留空。 */
export function tryPhotonBudget(
  target: ExperimentSummary,
  opticalPowerMw: number | null,
  substrateMmol: number | null,
): PhotonBudget | null {
  if (!target.wavelengthNm || opticalPowerMw === null || opticalPowerMw <= 0) return null;
  return photonBudget({
    wavelengthNm: target.wavelengthNm,
    powerValue: opticalPowerMw,
    powerUnit: "mW",
    powerKind: "optical_measured",
    hours: target.durationHours ?? undefined,
    substrateMmol: substrateMmol ?? undefined,
  });
}

function describeExperiment(experiment: ExperimentSummary, index?: number): string {
  const parts = [
    index !== undefined ? `[${index + 1}]` : "[当前]",
    experiment.code ?? experiment.id.slice(0, 6),
    experiment.performedOn ?? "",
    experiment.reactionSmiles ? `反应 ${experiment.reactionSmiles}` : "",
    experiment.photocatalyst
      ? `PC ${experiment.photocatalyst}${experiment.photocatalystLoading ? ` ${experiment.photocatalystLoading} mol%` : ""}`
      : "PC 未记录",
    experiment.wavelengthNm ? `${experiment.wavelengthNm} nm` : "波长未记录",
    experiment.lightSourceName ? `灯 ${experiment.lightSourceName}` : "光源未记录",
    experiment.distanceCm !== null ? `距离 ${experiment.distanceCm} cm` : "距离未记录",
    experiment.reactionVolumeMl !== null ? `体积 ${experiment.reactionVolumeMl} mL` : "体积未记录",
    experiment.solvent ?? "",
    experiment.temperatureC !== null ? `${experiment.temperatureC} °C` : "",
    experiment.durationHours !== null ? `${experiment.durationHours} h` : "",
    experiment.atmosphere ?? "",
    experiment.degassingMethod ? `除气 ${experiment.degassingMethod}` : "除气未记录",
    experiment.yieldPercent !== null ? `**产率 ${experiment.yieldPercent}%**` : "产率未记录",
    experiment.observations.length ? `观察：${experiment.observations.join("；")}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

export function buildRescuePrompt(context: RescueContext, budget: PhotonBudget | null): string {
  const missing = detectMissing(context.target);

  return [
    "你是有机光化学课题组的研究助手。研究者的一个光化学反应结果不理想，请诊断并设计下一步实验。",
    "",
    "## 当前实验",
    describeExperiment(context.target),
    context.note ? `\n研究者补充：${context.note}` : "",
    "",
    "## 本组相似实验（成功与失败都在内）",
    context.neighbours.length
      ? context.neighbours.map((experiment, index) => describeExperiment(experiment, index)).join("\n")
      : "（本组还没有可比的记录）",
    "",
    "## 实验室现有光源",
    context.equipment.length
      ? context.equipment
          .map(
            (item) =>
              `- ${item.name}${item.nominalWavelengthNm ? ` / 标称 ${item.nominalWavelengthNm} nm` : ""}${
                item.latestCalibration ? ` / 最近校准 ${item.latestCalibration}` : " / **无校准记录**"
              }`,
          )
          .join("\n")
      : "（设备库为空）",
    "",
    "## 已由程序算出的确定量",
    budget
      ? [
          `- 光子能量：${budget.energy.energyPerMolKJ.toFixed(1)} kJ/mol`,
          budget.flux.molPhotonsPerSecond
            ? `- 入射光子通量：${budget.flux.molPhotonsPerSecond.toExponential(2)} mol/s`
            : "- 光子通量：无法计算（缺实测光功率）",
          budget.dose ? `- 光子剂量：${budget.dose.molPhotons.toExponential(2)} mol` : "",
          budget.equivalents
            ? `- 入射光子当量：${budget.equivalents.incidentEquivalents.toFixed(1)}（注意是入射而非吸收）`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "（缺少实测光功率，无法计算光子预算。不要自己估一个数字。）",
    "",
    "## 记录缺失的关键变量",
    missing.length ? missing.map((item) => `- ${item}`).join("\n") : "（关键变量齐全）",
    "",
    "## 要求",
    "",
    "1. 排出 2–4 个失败假设，按可能性从高到低。每个假设必须写明**支持证据**和**反对证据**；",
    "   证据要尽量引用上面的具体实验编号或参数，不要泛泛而谈。",
    "2. 设计 3 个下一步实验，每个只改一个主要变量，其余明确保持不变。",
    "   每个实验要写清：假设成立会看到什么、不成立会看到什么。**能区分假设的实验优先。**",
    "3. 如果关键变量缺失导致无法判断，就把「先补测什么」本身作为一个实验，不要绕过去猜。",
    "",
    "## 边界",
    "",
    "- 不要说原因已经确定；这些是假设。",
    "- 不要编造产率、光功率、辐照度等任何没给你的数字。",
    "- 不要把灯的标称电功率当作光功率。",
    "- 不要声称有文献先例——你没有检索文献。",
    "",
    "## 输出",
    "",
    "只输出 JSON：",
    "{",
    '  "headline": "一句话说清当前最该排查什么，以及为什么",',
    '  "hypotheses": [{',
    '    "category": "photon_delivery|photoredox_thermodynamics|excited_state_kinetics|photodegradation|ordinary_chemistry",',
    '    "statement": "假设内容",',
    '    "confidence": 0.0-1.0,',
    '    "evidence_for": ["..."], "evidence_against": ["..."], "missing_information": ["..."]',
    "  }],",
    '  "experiments": [{',
    '    "title": "简短标题",',
    '    "change": "改什么",',
    '    "hold_constant": ["保持不变的关键项"],',
    '    "purpose": "验证什么",',
    '    "predicted_if_true": "假设成立会看到",',
    '    "predicted_if_false": "假设不成立会看到",',
    '    "information_gain": "high|medium|low",',
    '    "practical_cost": "low|medium|high",',
    '    "tests_hypothesis": "对应上面哪个假设"',
    "  }]",
    "}",
  ].join("\n");
}

function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

const CATEGORIES = new Set<string>([
  "photon_delivery",
  "photoredox_thermodynamics",
  "excited_state_kinetics",
  "photodegradation",
  "ordinary_chemistry",
]);

export function parseRescue(raw: string, missingCritical: string[]): RescueResult {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;
  const rawHypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [];
  const rawExperiments = Array.isArray(parsed.experiments) ? parsed.experiments : [];

  const hypotheses: Hypothesis[] = rawHypotheses.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const category =
      typeof item.category === "string" && CATEGORIES.has(item.category)
        ? (item.category as FailureCategory)
        : "ordinary_chemistry";
    const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5;
    return {
      category,
      statement: typeof item.statement === "string" ? item.statement : "（未给出假设内容）",
      confidence,
      evidenceFor: asStringList(item.evidence_for),
      evidenceAgainst: asStringList(item.evidence_against),
      missingInformation: asStringList(item.missing_information),
    };
  });

  const experiments: NextExperiment[] = rawExperiments.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const gain = item.information_gain;
    const cost = item.practical_cost;
    return {
      title: typeof item.title === "string" ? item.title : "未命名实验",
      change: typeof item.change === "string" ? item.change : "",
      holdConstant: asStringList(item.hold_constant),
      purpose: typeof item.purpose === "string" ? item.purpose : "",
      predictedIfTrue: typeof item.predicted_if_true === "string" ? item.predicted_if_true : "",
      predictedIfFalse: typeof item.predicted_if_false === "string" ? item.predicted_if_false : "",
      informationGain: gain === "high" || gain === "medium" || gain === "low" ? gain : "medium",
      practicalCost: cost === "high" || cost === "medium" || cost === "low" ? cost : "medium",
      testsHypothesis: typeof item.tests_hypothesis === "string" ? item.tests_hypothesis : "",
    };
  });

  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    // 置信度高的排前面，UI 不用再排一次。
    hypotheses: hypotheses.sort((a, b) => b.confidence - a.confidence),
    experiments,
    missingCritical,
  };
}

export async function runRescue(
  config: ProviderConfig,
  context: RescueContext,
  budget: PhotonBudget | null,
): Promise<RescueResult> {
  const missingCritical = detectMissing(context.target);
  const completion = await chat(config, {
    messages: [{ role: "user", content: buildRescuePrompt(context, budget) }],
  });

  if (!completion.content.trim()) throw new Error("模型没有返回内容");
  try {
    return parseRescue(completion.content, missingCritical);
  } catch {
    throw new Error(`模型返回的不是合法 JSON：${completion.content.slice(0, 140)}`);
  }
}
