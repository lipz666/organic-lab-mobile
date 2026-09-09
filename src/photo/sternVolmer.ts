/**
 * Stern–Volmer 拟合。
 *
 * I0/I = 1 + KSV[Q]
 *
 * 拟合用自由截距的最小二乘，然后把截距报出来：理论上截距应为 1，
 * 明显偏离通常意味着基线、内滤或数据本身有问题——强行固定截距会把这个信号抹掉。
 */

export type SternVolmerPoint = {
  quencherConcentration: number;
  ratio: number;
};

export type SternVolmerFit = {
  points: SternVolmerPoint[];
  slope: number;
  intercept: number;
  rSquared: number;
  /** KSV 就是斜率；有寿命时可算 kq。 */
  ksv: number;
  kqPerMPerS: number | null;
  residuals: number[];
  outlierIndices: number[];
  warnings: string[];
};

export type SternVolmerInput = {
  /** 每行：[Q], I（或 I0/I）。 */
  concentrations: number[];
  intensities?: number[];
  ratios?: number[];
  i0?: number;
  /** 激发态寿命（ns），用于换算 kq。 */
  lifetimeNs?: number;
};

/** 解析粘贴的两列数据：浓度 + 强度。 */
export function parsePairs(raw: string): { a: number[]; b: number[] } {
  const a: number[] = [];
  const b: number[] = [];
  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = trimmed.split(/[,\t;]|\s{1,}/).filter(Boolean);
    if (cells.length < 2) continue;
    const first = Number(cells[0]);
    const second = Number(cells[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;
    a.push(first);
    b.push(second);
  }
  return { a, b };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function findOutliers(residuals: number[], values: number[]): number[] {
  const center = median(residuals);
  // 1.4826 让 MAD 在正态分布下与标准差可比。
  const mad = 1.4826 * median(residuals.map((residual) => Math.abs(residual - center)));
  const span = Math.max(...values) - Math.min(...values);
  const scale = span > 0 ? span : 1;

  // MAD 必须相对数据尺度有意义才能用相对判据。完美拟合时残差是 1e-16 量级的
  // 浮点噪声，MAD 虽非零却毫无意义，此时相对 z 分数会爆炸并把好点报成离群点。
  if (mad > scale * 1e-6) {
    return residuals
      .map((residual, index) => ({ score: Math.abs(residual - center) / mad, index }))
      .filter((entry) => entry.score > 3.5)
      .map((entry) => entry.index);
  }

  // 走到这里说明过半数点落在同一条线上；只有肉眼可见的偏离才算离群点。
  const threshold = Math.max(scale * 0.02, 1e-9);
  return residuals
    .map((residual, index) => ({ deviation: Math.abs(residual - center), index }))
    .filter((entry) => entry.deviation > threshold)
    .map((entry) => entry.index);
}

export function fitSternVolmer(input: SternVolmerInput): SternVolmerFit {
  const warnings: string[] = [];
  const concentrations = input.concentrations;

  let ratios: number[];
  if (input.ratios) {
    ratios = input.ratios;
  } else if (input.intensities) {
    // I0 没给就用最低浓度点的强度当 I0——这是常见做法，但要说出来。
    const zeroIndex = concentrations.indexOf(Math.min(...concentrations));
    const i0 = input.i0 ?? input.intensities[zeroIndex];
    if (input.i0 === undefined) {
      warnings.push(
        `未提供 I₀，已用最低浓度点（[Q] = ${concentrations[zeroIndex]}）的强度作为 I₀。若该点并非零猝灭剂对照，KSV 会被低估。`,
      );
    }
    if (!Number.isFinite(i0) || i0 <= 0) throw new Error("I₀ 必须是正数");
    ratios = input.intensities.map((intensity) => i0 / intensity);
  } else {
    throw new Error("需要提供 intensities 或 ratios");
  }

  if (concentrations.length !== ratios.length) throw new Error("浓度与强度点数不一致");
  const n = concentrations.length;
  if (n < 3) throw new Error("至少需要 3 个数据点才能拟合");

  const points: SternVolmerPoint[] = concentrations.map((quencherConcentration, index) => ({
    quencherConcentration,
    ratio: ratios[index],
  }));

  const meanX = concentrations.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ratios.reduce((sum, value) => sum + value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (concentrations[i] - meanX) ** 2;
    sxy += (concentrations[i] - meanX) * (ratios[i] - meanY);
  }
  if (sxx === 0) throw new Error("所有浓度点相同，无法拟合");

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  const residuals: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const predicted = slope * concentrations[i] + intercept;
    const residual = ratios[i] - predicted;
    residuals.push(residual);
    ssRes += residual ** 2;
    ssTot += (ratios[i] - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  // 用 MAD 而不是标准差找离群点：离群点会把标准差自己撑大，于是逃过 2σ 判据
  // （掩蔽效应）。中位数绝对偏差不受单个坏点影响。
  const outlierIndices = findOutliers(residuals, ratios);

  if (Math.abs(intercept - 1) > 0.15) {
    warnings.push(
      `拟合截距为 ${intercept.toFixed(3)}，理论值应接近 1。偏离通常提示基线、内滤效应或 I₀ 取值有问题，而不是更强的猝灭。`,
    );
  }
  if (rSquared < 0.95) {
    warnings.push(`R² = ${rSquared.toFixed(3)}，线性不佳。可能存在静态+动态混合猝灭，简单线性 Stern–Volmer 未必适用。`);
  }
  if (slope <= 0) {
    warnings.push("斜率非正，数据不支持猝灭。检查 I 与 I₀ 是否弄反。");
  }
  if (outlierIndices.length > 0) {
    warnings.push(`第 ${outlierIndices.map((index) => index + 1).join("、")} 个点残差偏大，建议复测。`);
  }
  warnings.push("Stern–Volmer 只说明谁在猝灭激发态，单凭这一项不能确定完整机理。");

  const kqPerMPerS =
    input.lifetimeNs && input.lifetimeNs > 0 ? slope / (input.lifetimeNs * 1e-9) : null;

  return {
    points,
    slope,
    intercept,
    rSquared,
    ksv: slope,
    kqPerMPerS,
    residuals,
    outlierIndices,
    warnings,
  };
}
