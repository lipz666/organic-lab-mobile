/**
 * 确定性化学工具。
 *
 * 结构相关的运算走 RDKit（跑在隐藏 WebView 里，见 src/chem）。RDKit 万一没起来，
 * 退回到纯 TS 的语法自检，并**在结果里说清这次只做了语法检查**——
 * 悄悄降级比直接失败更糟，模型会拿语法通过当成结构没问题。
 */

import { rdkitBridge } from "../../chem/bridge";
import type { RegisteredTool, ToolResult } from "./types";
import { fail } from "./types";

const ORGANIC_SUBSET = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I", "b", "c", "n", "o", "p", "s"]);

type SyntaxProblem = string;

/** 只做括号、方括号、成环编号的配平检查，以及方括号外的原子是否在有机子集内。 */
function inspectSmiles(smiles: string): SyntaxProblem[] {
  const problems: SyntaxProblem[] = [];
  if (!smiles.trim()) return ["SMILES 为空"];

  let parens = 0;
  let inBracket = false;
  const openRings = new Map<string, number>();

  for (let i = 0; i < smiles.length; i += 1) {
    const ch = smiles[i];
    if (inBracket) {
      if (ch === "]") inBracket = false;
      continue;
    }
    if (ch === "[") {
      inBracket = true;
      continue;
    }
    if (ch === "]") {
      problems.push(`第 ${i + 1} 位有多余的 ]`);
      continue;
    }
    if (ch === "(") parens += 1;
    else if (ch === ")") {
      parens -= 1;
      if (parens < 0) {
        problems.push(`第 ${i + 1} 位有多余的 )`);
        parens = 0;
      }
    } else if (ch === "%") {
      const label = smiles.slice(i + 1, i + 3);
      if (!/^\d{2}$/.test(label)) problems.push(`第 ${i + 1} 位的 % 后面不是两位数字`);
      else {
        openRings.set(label, (openRings.get(label) ?? 0) + 1);
        i += 2;
      }
    } else if (/\d/.test(ch)) {
      openRings.set(ch, (openRings.get(ch) ?? 0) + 1);
    } else if (/[A-Za-z]/.test(ch)) {
      const two = smiles.slice(i, i + 2);
      if (ORGANIC_SUBSET.has(two)) i += 1;
      else if (!ORGANIC_SUBSET.has(ch)) {
        problems.push(`第 ${i + 1} 位的 "${ch}" 不在有机子集里，需要写成方括号形式`);
      }
    }
  }

  if (inBracket) problems.push("有未闭合的 [");
  if (parens > 0) problems.push(`有 ${parens} 个未闭合的 (`);
  for (const [label, count] of openRings) {
    if (count % 2 !== 0) problems.push(`成环编号 ${label} 只出现了 ${count} 次，没有配对`);
  }
  return problems;
}

/** RDKit 不可用时的退路。明确标注 syntax_only，不让它冒充结构检查。 */
function syntaxOnlyFallback(smiles: string, reason: string): ToolResult {
  const segments = smiles.includes(">>") ? smiles.split(">>") : [smiles];
  const problems = segments.flatMap((segment, index) =>
    inspectSmiles(segment).map((problem) =>
      segments.length > 1 ? `${index === 0 ? "反应物" : "产物"}侧：${problem}` : problem,
    ),
  );
  return {
    value: {
      ok: problems.length === 0,
      syntax_only: true,
      problems,
      rdkit_unavailable: reason,
      note:
        "RDKit 没能加载，这次只做了语法检查。**语法通过不代表结构正确**——" +
        "化合价错误、芳香性问题都查不出来。回答时要说明这一点。",
    },
    // 降级这件事必须出现在摘要里——UI 上的工具条只显示摘要，
    // 只写进 value 的话用户看到的就是一次普普通通的检查。
    summary:
      problems.length === 0
        ? "RDKit 不可用，仅语法检查通过"
        : `RDKit 不可用，仅语法检查发现 ${problems.length} 处问题`,
  };
}

async function callRdkit(op: string, args: Record<string, unknown>): Promise<Record<string, unknown> | string> {
  try {
    return (await rdkitBridge.call(op, args)) as Record<string, unknown>;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const standardizeSmiles: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "chem_standardize_smiles",
      description:
        "用 RDKit 解析并标准化 SMILES，返回规范式、InChIKey、分子量和若干描述符。" +
        "反应写成 reactants>>products 时两侧分别处理。" +
        "结构读不出来会如实报错——**读不出的结构不要继续往下用**，画不出图也比不了。",
      parameters: {
        type: "object",
        properties: {
          smiles: { type: "string", description: "分子或反应 SMILES" },
        },
        required: ["smiles"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const smiles = typeof args.smiles === "string" ? args.smiles.trim() : "";
    if (!smiles) return fail("没有提供 smiles");

    const result = await callRdkit("standardize", { smiles });
    if (typeof result === "string") return syntaxOnlyFallback(smiles, result);
    if (result.ok === false) return { value: result, summary: String(result.error ?? "RDKit 解析失败") };

    const components = (result.components ?? []) as { molecular_weight?: number }[];
    return {
      value: result,
      summary: `${result.is_reaction ? "反应" : "分子"}已标准化，${components.length} 个片段`,
    };
  },
};

const similarity: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "chem_similarity",
      description:
        "用 Morgan 指纹算两个结构的 Tanimoto 相似度。" +
        "**相似不等于可以套用同一套条件**，给出数字时要说明这一点。",
      parameters: {
        type: "object",
        properties: {
          a: { type: "string", description: "第一个 SMILES" },
          b: { type: "string", description: "第二个 SMILES" },
        },
        required: ["a", "b"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const a = typeof args.a === "string" ? args.a : "";
    const b = typeof args.b === "string" ? args.b : "";
    if (!a || !b) return fail("需要两个 SMILES");

    const result = await callRdkit("similarity", { a, b });
    if (typeof result === "string") return fail(`RDKit 不可用，算不了相似度：${result}`);
    if (result.ok === false) return { value: result, summary: String(result.error ?? "算不了") };
    return { value: result, summary: `Tanimoto ${result.tanimoto}` };
  },
};

type Reagent = {
  name?: unknown;
  mass_mg?: unknown;
  volume_ml?: unknown;
  density_g_ml?: unknown;
  molecular_weight?: unknown;
  mmol?: unknown;
  purity?: unknown;
};

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const equivalents: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "chem_equivalents",
      description:
        "由质量/体积和分子量算出每个试剂的物质的量与当量。纯算术，结果确定。" +
        "算不出物质的量的试剂会被如实标出缺什么参数，不会用常规值替用户补。",
      parameters: {
        type: "object",
        properties: {
          reagents: {
            type: "array",
            description: "试剂列表。每项至少要能算出 mmol：直接给 mmol，或给 mass_mg + molecular_weight，或给 volume_ml + density_g_ml + molecular_weight。",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                mmol: { type: "number", description: "物质的量，mmol" },
                mass_mg: { type: "number", description: "质量，mg" },
                volume_ml: { type: "number", description: "体积，mL" },
                density_g_ml: { type: "number", description: "密度，g/mL" },
                molecular_weight: { type: "number", description: "分子量，g/mol" },
                purity: { type: "number", description: "纯度，0-1；不填按 1 算" },
              },
              required: ["name"],
            },
          },
          limiting_reagent: {
            type: "string",
            description: "作为 1.0 当量基准的试剂名。不填则取算得出物质的量里最小的那个。",
          },
        },
        required: ["reagents"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const list = Array.isArray(args.reagents) ? (args.reagents as Reagent[]) : [];
    if (list.length === 0) return fail("没有提供 reagents");

    const rows = list.map((reagent) => {
      const name = typeof reagent.name === "string" ? reagent.name : "未命名";
      const purity = toNumber(reagent.purity) ?? 1;
      const mw = toNumber(reagent.molecular_weight);
      const direct = toNumber(reagent.mmol);
      const mass = toNumber(reagent.mass_mg);
      const volume = toNumber(reagent.volume_ml);
      const density = toNumber(reagent.density_g_ml);

      let mmol: number | null = null;
      let basis = "";
      if (direct !== null) {
        mmol = direct;
        basis = "直接给出";
      } else if (mass !== null && mw) {
        mmol = (mass * purity) / mw;
        basis = "由质量与分子量算出";
      } else if (volume !== null && density !== null && mw) {
        mmol = (volume * density * 1000 * purity) / mw;
        basis = "由体积、密度与分子量算出";
      }

      const missing: string[] = [];
      if (mmol === null) {
        if (mass === null && volume === null) missing.push("质量或体积");
        if (volume !== null && density === null) missing.push("密度");
        if (!mw) missing.push("分子量");
      }

      return { name, mmol, basis, missing };
    });

    const computable = rows.filter((row) => row.mmol !== null && row.mmol > 0);
    if (computable.length === 0) {
      return {
        value: { ok: false, rows, error: "没有任何试剂能算出物质的量" },
        summary: "参数不足，算不出当量",
      };
    }

    const requested = typeof args.limiting_reagent === "string" ? args.limiting_reagent : null;
    const limiting =
      (requested ? computable.find((row) => row.name === requested) : null) ??
      computable.reduce((min, row) => ((row.mmol as number) < (min.mmol as number) ? row : min));

    const round = (value: number) => Number(value.toPrecision(4));

    return {
      value: {
        ok: true,
        limiting_reagent: limiting.name,
        limiting_note:
          requested && limiting.name !== requested
            ? `指定的 ${requested} 算不出物质的量，改用 ${limiting.name} 作基准`
            : undefined,
        rows: rows.map((row) => ({
          name: row.name,
          mmol: row.mmol === null ? null : round(row.mmol),
          equivalents: row.mmol === null ? null : round(row.mmol / (limiting.mmol as number)),
          basis: row.basis || undefined,
          missing: row.missing.length ? row.missing : undefined,
        })),
      },
      summary: `${computable.length}/${rows.length} 个试剂算出当量，基准 ${limiting.name}`,
    };
  },
};

export const CHEMISTRY_TOOLS: RegisteredTool[] = [standardizeSmiles, similarity, equivalents];
