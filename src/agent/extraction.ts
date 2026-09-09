/**
 * 从实验记录本照片抽取结构化字段。
 *
 * 这是服务器版那一整套 OCSR（MolScribe + DECIMER + RxnScribe，几百 MB PyTorch）
 * 在手机上的替代物：直接用用户已经配好的多模态模型。纯结构图的精度不如专用模型，
 * 但"读一页手写记录 → 字段 + 反应 SMILES"这个场景上够用，而且零基础设施。
 *
 * **刻意不返回 confidence。** 实测模型会给出 0.95 的自评、uncertain_fields 留空，
 * 同时漏掉标题、并把 "2 mol%" 自行换算成当量。一个不可信的置信度只会诱使我们
 * 拿它做阈值自动入库，那正是这个 app 最不该做的事。所有字段一律由人过目。
 */

import { chat, type ProviderConfig } from "./provider";

export type ExtractedMaterial = {
  name: string;
  role: string | null;
  amount: number | null;
  unit: string | null;
  equivalents: number | null;
};

export type ExtractedRecord = {
  code: string | null;
  title: string | null;
  performedOn: string | null;
  purpose: string | null;
  reactionSmiles: string | null;
  materials: ExtractedMaterial[];
  solvent: string | null;
  solventVolumeMl: number | null;
  temperatureC: number | null;
  durationHours: number | null;
  atmosphere: string | null;
  lightSource: string | null;
  wavelengthNm: number | null;
  powerW: number | null;
  distanceCm: number | null;
  yieldPercent: number | null;
  productMassMg: number | null;
  observations: string[];
  notes: string | null;
};

const PROMPT = [
  "你是有机合成实验记录数字化助手。读这张实验记录本照片，输出严格 JSON，不要任何解释文字。",
  "",
  "字段：",
  "{",
  '  "code": 实验编号, "title": 标题, "date": "YYYY-MM-DD", "purpose": 实验目的,',
  '  "reaction_smiles": 从结构式读出的反应 SMILES，写成 reactants>>products,',
  '  "materials": [{"name","role","amount","unit","equiv"}],',
  '  "solvent", "volume_ml", "temperature_c", "time_h", "atmosphere",',
  '  "light_source", "wavelength_nm", "power_w", "distance_cm",',
  '  "yield_percent", "product_mass_mg",',
  '  "observations": [字符串], "notes"',
  "}",
  "",
  "规则：",
  "- **页面上没写的字段一律填 null。** 不要按常规值补，不要推算。",
  "  比如只写了 '2 mol%'，就把 amount 填 2、unit 填 'mol%'，不要自己换算成当量。",
  "- 数值字段只填数字，单位放在 unit 或对应字段里。",
  "- reaction_smiles 必须来自图中画出的结构，读不出就填 null——不要根据文字描述编一个。",
  "- 观察、TLC、后处理这类过程描述放进 observations 数组。",
  "- 只输出 JSON。",
].join("\n");

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // 模型偶尔会把数字连单位一起给（"32.5 mg"），取头部数字，其余丢掉。
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asText).filter((entry): entry is string => Boolean(entry));
}

/** 去掉模型爱加的 ```json 围栏。 */
function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

export function parseExtraction(raw: string): ExtractedRecord {
  const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;
  const conditions = (parsed.conditions ?? parsed) as Record<string, unknown>;

  const materials = Array.isArray(parsed.materials) ? parsed.materials : [];

  return {
    code: asText(parsed.code) ?? asText(parsed.experiment_code),
    title: asText(parsed.title),
    performedOn: asText(parsed.date) ?? asText(parsed.performed_on),
    purpose: asText(parsed.purpose),
    reactionSmiles: asText(parsed.reaction_smiles),
    materials: materials.map((entry): ExtractedMaterial => {
      const material = (entry ?? {}) as Record<string, unknown>;
      return {
        name: asText(material.name) ?? "未命名",
        role: asText(material.role),
        amount: asNumber(material.amount),
        unit: asText(material.unit),
        equivalents: asNumber(material.equiv ?? material.equivalents),
      };
    }),
    solvent: asText(conditions.solvent),
    solventVolumeMl: asNumber(conditions.volume_ml ?? conditions.volume),
    temperatureC: asNumber(conditions.temperature_c ?? conditions.temperature),
    durationHours: asNumber(conditions.time_h ?? conditions.time),
    atmosphere: asText(conditions.atmosphere),
    lightSource: asText(conditions.light_source),
    wavelengthNm: asNumber(conditions.wavelength_nm),
    powerW: asNumber(conditions.power_w),
    distanceCm: asNumber(conditions.distance_cm),
    yieldPercent: asNumber(parsed.yield_percent),
    productMassMg: asNumber(parsed.product_mass_mg),
    observations: asList(parsed.observations),
    notes: asText(parsed.notes),
  };
}

export async function extractRecord(
  config: ProviderConfig,
  imageBase64: string,
  mimeType = "image/jpeg",
): Promise<ExtractedRecord> {
  const completion = await chat(config, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      },
    ],
  });

  if (!completion.content.trim()) throw new Error("模型没有返回内容，换一张更清晰的照片再试");
  try {
    return parseExtraction(completion.content);
  } catch {
    throw new Error(`模型返回的不是合法 JSON：${completion.content.slice(0, 120)}`);
  }
}
