/**
 * 光谱：解析、重采样、LED 发射建模、与吸收谱的重叠。
 *
 * 纯函数，node 里可验证。重叠度只回答"光谱上匹配不匹配"，
 * 不回答"反应做不做得成"——那两件事之间隔着热力学、动力学和一整套实验。
 */

export type SpectrumPoint = { wavelengthNm: number; value: number };

export type Spectrum = {
  points: SpectrumPoint[];
  label: string;
  /** absorbance / emission / normalized */
  kind: "absorbance" | "emission";
};

/**
 * 解析用户粘贴的两列数据。
 * 容忍逗号、制表符、空格分隔，容忍表头，容忍空行和 BOM。
 */
export function parseSpectrum(raw: string, label: string, kind: Spectrum["kind"]): Spectrum {
  const points: SpectrumPoint[] = [];
  for (const line of raw.replace(/^﻿/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = trimmed.split(/[,\t;]|\s{1,}/).filter(Boolean);
    if (cells.length < 2) continue;
    const wavelengthNm = Number(cells[0]);
    const value = Number(cells[1]);
    // 表头行会在这里被自然跳过，不用猜它长什么样。
    if (!Number.isFinite(wavelengthNm) || !Number.isFinite(value)) continue;
    if (wavelengthNm <= 0) continue;
    points.push({ wavelengthNm, value });
  }
  points.sort((a, b) => a.wavelengthNm - b.wavelengthNm);
  return { points, label, kind };
}

export function spectrumRange(spectrum: Spectrum): { min: number; max: number } | null {
  if (spectrum.points.length === 0) return null;
  return {
    min: spectrum.points[0].wavelengthNm,
    max: spectrum.points[spectrum.points.length - 1].wavelengthNm,
  };
}

/** λmax：吸收/发射最强处。 */
export function peakWavelength(spectrum: Spectrum): SpectrumPoint | null {
  if (spectrum.points.length === 0) return null;
  return spectrum.points.reduce((best, point) => (point.value > best.value ? point : best));
}

/**
 * 吸收边：从长波端往回找，第一次超过峰值某比例的位置。
 * 这是个操作性定义，不是严格的光学带隙，UI 上要写明。
 */
export function absorptionEdge(spectrum: Spectrum, fraction = 0.05): number | null {
  const peak = peakWavelength(spectrum);
  if (!peak) return null;
  const threshold = peak.value * fraction;
  for (let i = spectrum.points.length - 1; i >= 0; i -= 1) {
    if (spectrum.points[i].value >= threshold) return spectrum.points[i].wavelengthNm;
  }
  return null;
}

/** 线性插值取某波长处的值；超出数据范围返回 null 而不是外推。 */
export function valueAt(spectrum: Spectrum, wavelengthNm: number): number | null {
  const points = spectrum.points;
  if (points.length === 0) return null;
  if (wavelengthNm < points[0].wavelengthNm) return null;
  if (wavelengthNm > points[points.length - 1].wavelengthNm) return null;

  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1];
    const right = points[i];
    if (wavelengthNm <= right.wavelengthNm) {
      const span = right.wavelengthNm - left.wavelengthNm;
      if (span === 0) return left.value;
      const t = (wavelengthNm - left.wavelengthNm) / span;
      return left.value + t * (right.value - left.value);
    }
  }
  return points[points.length - 1].value;
}

/**
 * 由峰值波长和半高全宽生成 LED 发射谱（高斯近似）。
 * 大多数人手上只有"450 nm LED"这一个数字，没有实测发射谱；
 * 用高斯近似比完全不画要好，但结果必须标成 estimated。
 */
export function gaussianEmission(peakNm: number, fwhmNm = 20, stepNm = 1): Spectrum {
  const sigma = fwhmNm / (2 * Math.sqrt(2 * Math.LN2));
  const span = Math.max(fwhmNm * 3, 45);
  const points: SpectrumPoint[] = [];
  for (let lambda = peakNm - span; lambda <= peakNm + span; lambda += stepNm) {
    points.push({
      wavelengthNm: Number(lambda.toFixed(2)),
      value: Math.exp(-((lambda - peakNm) ** 2) / (2 * sigma ** 2)),
    });
  }
  return { points, label: `${peakNm} nm LED（高斯近似）`, kind: "emission" };
}

export type OverlapResult = {
  /**
   * 光子加权的相对吸光度：把发射谱归一成光子概率分布，
   * 再用吸收谱（对自身峰值归一）加权求和。0–1，可解释为
   * "发出的光子平均落在吸收带多强的位置上"。
   */
  photonWeightedAbsorbance: number;
  /** 落在吸收数据覆盖范围之外的发射光子比例——这部分完全无法判断。 */
  fractionOutsideAbsorptionData: number;
  overlapRangeNm: { min: number; max: number } | null;
  verdict: "strong" | "moderate" | "weak" | "unknown";
  warnings: string[];
};

export function spectralOverlap(emission: Spectrum, absorption: Spectrum): OverlapResult {
  const warnings: string[] = [];
  const absorptionPeak = peakWavelength(absorption);
  const absorptionRange = spectrumRange(absorption);

  if (!absorptionPeak || !absorptionRange || absorptionPeak.value <= 0) {
    return {
      photonWeightedAbsorbance: 0,
      fractionOutsideAbsorptionData: 1,
      overlapRangeNm: null,
      verdict: "unknown",
      warnings: ["吸收谱为空或全零，无法计算重叠。"],
    };
  }

  let emissionTotal = 0;
  let weighted = 0;
  let outside = 0;
  let overlapMin: number | null = null;
  let overlapMax: number | null = null;

  for (let i = 0; i < emission.points.length; i += 1) {
    const point = emission.points[i];
    // 梯形宽度：用相邻点间距，末点沿用前一段，避免不等间距数据被算错权重。
    const previous = emission.points[i - 1];
    const next = emission.points[i + 1];
    const width =
      next && previous
        ? (next.wavelengthNm - previous.wavelengthNm) / 2
        : next
          ? next.wavelengthNm - point.wavelengthNm
          : previous
            ? point.wavelengthNm - previous.wavelengthNm
            : 1;
    const weight = Math.max(point.value, 0) * width;
    if (weight <= 0) continue;
    emissionTotal += weight;

    const absorbance = valueAt(absorption, point.wavelengthNm);
    if (absorbance === null) {
      outside += weight;
      continue;
    }
    const relative = Math.max(absorbance, 0) / absorptionPeak.value;
    weighted += weight * relative;
    if (relative > 0.05) {
      overlapMin = overlapMin === null ? point.wavelengthNm : Math.min(overlapMin, point.wavelengthNm);
      overlapMax = overlapMax === null ? point.wavelengthNm : Math.max(overlapMax, point.wavelengthNm);
    }
  }

  if (emissionTotal === 0) {
    return {
      photonWeightedAbsorbance: 0,
      fractionOutsideAbsorptionData: 1,
      overlapRangeNm: null,
      verdict: "unknown",
      warnings: ["发射谱为空或全零，无法计算重叠。"],
    };
  }

  const photonWeightedAbsorbance = weighted / emissionTotal;
  const fractionOutside = outside / emissionTotal;

  if (fractionOutside > 0.2) {
    warnings.push(
      `发射谱有 ${(fractionOutside * 100).toFixed(0)}% 的光子落在吸收数据覆盖范围（${absorptionRange.min}–${absorptionRange.max} nm）之外，这部分无法判断。`,
    );
  }
  warnings.push("光谱重叠只说明吸不吸得到光，不代表反应做得通——热力学与动力学是另外的事。");

  const verdict: OverlapResult["verdict"] =
    fractionOutside > 0.5
      ? "unknown"
      : photonWeightedAbsorbance >= 0.5
        ? "strong"
        : photonWeightedAbsorbance >= 0.15
          ? "moderate"
          : "weak";

  return {
    photonWeightedAbsorbance,
    fractionOutsideAbsorptionData: fractionOutside,
    overlapRangeNm: overlapMin !== null && overlapMax !== null ? { min: overlapMin, max: overlapMax } : null,
    verdict,
    warnings,
  };
}
