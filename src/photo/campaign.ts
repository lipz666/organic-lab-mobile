/**
 * 条件优化 Campaign。
 *
 * 回答的是「我做了一批实验，还剩有限预算，下一轮做什么」。
 *
 * V1.5 用规则 + 实验设计，不是贝叶斯优化。理由是数据量：一个 campaign 通常只有
 * 十几到几十个点，变量却有七八个，高斯过程在这个规模上给出的后验几乎全由先验决定，
 * 看起来精密实则是包装过的猜测。规则策略至少是可解释、可复核的。
 *
 * 三条策略对应三种目的：
 *   exploit  —— 在当前最好点附近微调，确认它不是噪声
 *   explore  —— 去没采过的区域，避免困在局部
 *   discriminate —— 单变量对照，回答「是不是这个因素在起作用」
 */

export type VariableKind = "continuous" | "categorical";

export type CampaignVariable = {
  name: string;
  kind: VariableKind;
  /** 连续变量的取值范围 */
  min?: number;
  max?: number;
  unit?: string;
  /** 分类变量的候选值 */
  options?: string[];
};

export type CampaignObservation = {
  /** 变量名 → 取值 */
  conditions: Record<string, string | number>;
  /** 目标值，越大越好（最小化目标请先取负） */
  outcome: number;
  label?: string;
};

export type Suggestion = {
  strategy: "exploit" | "explore" | "discriminate";
  conditions: Record<string, string | number>;
  purpose: string;
  changedFrom?: string;
};

export type CampaignAnalysis = {
  best: CampaignObservation | null;
  /** 每个变量的取值覆盖情况 */
  coverage: {
    name: string;
    tried: (string | number)[];
    /** 连续变量：已采样区间占整个范围的比例 */
    spanFraction: number | null;
    /** 这个变量是否始终没变过——没变过就无从判断它有没有影响 */
    neverVaried: boolean;
  }[];
  /** 单变量对照组：只有一个变量不同的实验对 */
  pairs: { variable: string; a: CampaignObservation; b: CampaignObservation; delta: number }[];
  warnings: string[];
};

function valuesOf(observations: CampaignObservation[], name: string): (string | number)[] {
  const seen = new Set<string>();
  const values: (string | number)[] = [];
  for (const observation of observations) {
    const value = observation.conditions[name];
    if (value === undefined) continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

/** 找出只差一个变量的实验对——它们是唯一能干净归因的比较。 */
function findPairs(
  observations: CampaignObservation[],
  variables: CampaignVariable[],
): CampaignAnalysis["pairs"] {
  const pairs: CampaignAnalysis["pairs"] = [];
  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const differing = variables.filter(
        (variable) =>
          String(observations[i].conditions[variable.name]) !== String(observations[j].conditions[variable.name]),
      );
      if (differing.length === 1) {
        pairs.push({
          variable: differing[0].name,
          a: observations[i],
          b: observations[j],
          delta: observations[j].outcome - observations[i].outcome,
        });
      }
    }
  }
  return pairs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export function analyzeCampaign(
  observations: CampaignObservation[],
  variables: CampaignVariable[],
): CampaignAnalysis {
  const warnings: string[] = [];
  const best =
    observations.length > 0
      ? observations.reduce((top, entry) => (entry.outcome > top.outcome ? entry : top))
      : null;

  const coverage = variables.map((variable) => {
    const tried = valuesOf(observations, variable.name);
    let spanFraction: number | null = null;
    if (variable.kind === "continuous" && variable.min !== undefined && variable.max !== undefined) {
      const numbers = tried.map(Number).filter((value) => Number.isFinite(value));
      const range = variable.max - variable.min;
      spanFraction =
        numbers.length > 1 && range > 0 ? (Math.max(...numbers) - Math.min(...numbers)) / range : 0;
    }
    return { name: variable.name, tried, spanFraction, neverVaried: tried.length <= 1 };
  });

  for (const entry of coverage) {
    if (entry.neverVaried && observations.length >= 3) {
      warnings.push(`${entry.name} 在所有实验里都是同一个值——它有没有影响目前无从判断。`);
    }
    if (entry.spanFraction !== null && entry.spanFraction > 0 && entry.spanFraction < 0.25) {
      warnings.push(`${entry.name} 只在允许范围的 ${(entry.spanFraction * 100).toFixed(0)}% 内试过，边界区域还没看。`);
    }
  }

  const pairs = findPairs(observations, variables);
  if (observations.length >= 4 && pairs.length === 0) {
    warnings.push("没有任何一对实验只差一个变量——现有数据无法把效应归因到具体因素上。下一轮建议做单变量对照。");
  }

  return { best, coverage, pairs, warnings };
}

/** 连续变量在当前最好点附近取一个没试过的邻近值。 */
function nudge(variable: CampaignVariable, current: number, tried: number[]): number | null {
  if (variable.min === undefined || variable.max === undefined) return null;
  const range = variable.max - variable.min;
  const step = range / 8;
  const candidates = [current + step, current - step, current + step * 2, current - step * 2]
    .map((value) => Math.round(Math.min(variable.max!, Math.max(variable.min!, value)) * 100) / 100)
    .filter((value) => value !== current && !tried.some((entry) => Math.abs(entry - value) < step / 4));
  return candidates[0] ?? null;
}

/** 分类变量取一个还没试过的选项。 */
function untried(variable: CampaignVariable, tried: (string | number)[]): string | null {
  if (!variable.options) return null;
  const used = new Set(tried.map(String));
  return variable.options.find((option) => !used.has(option)) ?? null;
}

export function recommendNext(
  observations: CampaignObservation[],
  variables: CampaignVariable[],
  budget: number,
): Suggestion[] {
  const analysis = analyzeCampaign(observations, variables);
  const suggestions: Suggestion[] = [];

  // 还没有数据：先铺开，别一上来就精调
  if (observations.length === 0) {
    const base: Record<string, string | number> = {};
    for (const variable of variables) {
      if (variable.kind === "categorical" && variable.options?.length) base[variable.name] = variable.options[0];
      else if (variable.min !== undefined && variable.max !== undefined)
        base[variable.name] = Math.round(((variable.min + variable.max) / 2) * 100) / 100;
    }
    suggestions.push({
      strategy: "explore",
      conditions: base,
      purpose: "还没有任何数据，先做一个居中的基准点，后续实验都以它为参照。",
    });
    return suggestions.slice(0, budget);
  }

  const best = analysis.best!;

  // 1) 从来没变过的变量最值得先动——它可能一直是瓶颈，而现有数据完全看不出来
  for (const entry of analysis.coverage) {
    if (!entry.neverVaried || suggestions.length >= budget) continue;
    const variable = variables.find((item) => item.name === entry.name)!;
    const next =
      variable.kind === "categorical"
        ? untried(variable, entry.tried)
        : nudge(variable, Number(best.conditions[variable.name]), entry.tried.map(Number));
    if (next === null) continue;
    suggestions.push({
      strategy: "discriminate",
      conditions: { ...best.conditions, [variable.name]: next },
      purpose: `${variable.name} 至今没变过，无法判断它是否重要。只改它一个，其余保持最好条件不变。`,
      changedFrom: `${variable.name}: ${best.conditions[variable.name]} → ${next}`,
    });
  }

  // 2) 在最好点附近微调——确认它是真峰还是噪声
  if (suggestions.length < budget) {
    const continuous = variables.filter((variable) => variable.kind === "continuous");
    for (const variable of continuous) {
      if (suggestions.length >= budget) break;
      const tried = valuesOf(observations, variable.name).map(Number);
      const next = nudge(variable, Number(best.conditions[variable.name]), tried);
      if (next === null) continue;
      if (suggestions.some((entry) => entry.changedFrom?.startsWith(variable.name))) continue;
      suggestions.push({
        strategy: "exploit",
        conditions: { ...best.conditions, [variable.name]: next },
        purpose: `在当前最好点（${best.label ?? "最高产率"}）附近沿 ${variable.name} 微调，确认这是真的最优区还是单点噪声。`,
        changedFrom: `${variable.name}: ${best.conditions[variable.name]} → ${next}`,
      });
    }
  }

  // 3) 还有预算就去没采过的区域
  if (suggestions.length < budget) {
    for (const variable of variables) {
      if (suggestions.length >= budget) break;
      const tried = valuesOf(observations, variable.name);
      const next =
        variable.kind === "categorical"
          ? untried(variable, tried)
          : variable.min !== undefined && variable.max !== undefined
            ? (() => {
                const numbers = tried.map(Number).filter(Number.isFinite);
                if (numbers.length === 0) return null;
                // 往没采样的那一侧推到边界附近
                const low = Math.min(...numbers);
                const high = Math.max(...numbers);
                const toLow = low - variable.min!;
                const toHigh = variable.max! - high;
                return toHigh >= toLow
                  ? Math.round((high + toHigh * 0.6) * 100) / 100
                  : Math.round((low - toLow * 0.6) * 100) / 100;
              })()
            : null;
      if (next === null) continue;
      if (suggestions.some((entry) => entry.changedFrom?.startsWith(variable.name))) continue;
      suggestions.push({
        strategy: "explore",
        conditions: { ...best.conditions, [variable.name]: next },
        purpose: `${variable.name} 的边界区域还没试过，去看一眼，避免困在局部最优。`,
        changedFrom: `${variable.name}: ${best.conditions[variable.name]} → ${next}`,
      });
    }
  }

  return suggestions.slice(0, budget);
}
