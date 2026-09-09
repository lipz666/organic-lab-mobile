/**
 * 光子学确定性计算。
 *
 * 纯函数、不 import 任何 RN 模块，这样能在 node 里对着已知答案验证。
 * 这些量必须由代码算，不能交给模型心算——产率、当量这类数字一旦编错，
 * 会被当成实验事实往下传。
 *
 * 最重要的一条边界：**电功率不是光功率**。灯标称 30 W 指的是耗电，
 * 落到样品上的光功率通常低一个数量级且强烈依赖几何。没有实测光功率时，
 * 这里拒绝给出 photon flux，而不是假装算得出来。
 */

export const PLANCK_J_S = 6.62607015e-34;
export const SPEED_OF_LIGHT_M_S = 2.99792458e8;
export const AVOGADRO_PER_MOL = 6.02214076e23;

/** 每个数值都要说清来源。measured ≠ calculated ≠ literature ≠ predicted。 */
export type SourceKind = "measured" | "calculated" | "estimated" | "literature" | "predicted";

export type Provenance = {
  sourceKind: SourceKind;
  formula?: string;
  assumptions?: string[];
};

export type PhotonEnergy = {
  wavelengthNm: number;
  energyPerPhotonJ: number;
  energyPerMolKJ: number;
  energyEv: number;
  provenance: Provenance;
};

export function photonEnergy(wavelengthNm: number): PhotonEnergy {
  if (!Number.isFinite(wavelengthNm) || wavelengthNm <= 0) {
    throw new Error("波长必须是正数（nm）");
  }
  const lambdaM = wavelengthNm * 1e-9;
  const energyPerPhotonJ = (PLANCK_J_S * SPEED_OF_LIGHT_M_S) / lambdaM;
  return {
    wavelengthNm,
    energyPerPhotonJ,
    energyPerMolKJ: (energyPerPhotonJ * AVOGADRO_PER_MOL) / 1000,
    energyEv: energyPerPhotonJ / 1.602176634e-19,
    provenance: { sourceKind: "calculated", formula: "E = hc / λ" },
  };
}

export type PowerKind = "optical_measured" | "electrical_nominal";

export type PhotonFlux = {
  /** 算不出来时为 null——这是刻意的，见文件头。 */
  photonsPerSecond: number | null;
  molPhotonsPerSecond: number | null;
  wavelengthNm: number;
  opticalPowerW: number | null;
  warnings: string[];
  provenance: Provenance;
};

export type FluxInput = {
  wavelengthNm: number;
  powerValue: number;
  powerUnit: "W" | "mW";
  powerKind: PowerKind;
  /**
   * 只有用户明确给出光电转换效率时，才从电功率估算。
   * 结果会被标成 estimated 并把假设原样带出来。
   */
  assumedOpticalEfficiency?: number;
};

export function photonFlux(input: FluxInput): PhotonFlux {
  const { wavelengthNm, powerValue, powerUnit, powerKind } = input;
  const watts = powerUnit === "mW" ? powerValue / 1000 : powerValue;
  const energy = photonEnergy(wavelengthNm);
  const warnings: string[] = [];

  if (powerKind === "electrical_nominal" && input.assumedOpticalEfficiency === undefined) {
    // 这是整个模块最重要的拒绝。标称电功率算出来的"photon flux"是假的，
    // 而它看起来和真的一模一样，一旦进了记录就再也分不出来。
    return {
      photonsPerSecond: null,
      molPhotonsPerSecond: null,
      wavelengthNm,
      opticalPowerW: null,
      warnings: [
        "给出的是灯的标称电功率，不是落到样品上的光功率，无法据此计算 photon flux。",
        "需要用功率计或化学露光计实测样品位置的光功率/辐照度；或明确给出一个假设的光电转换效率，结果会被标为估算值。",
      ],
      provenance: { sourceKind: "calculated", formula: "无法计算" },
    };
  }

  const efficiency = powerKind === "electrical_nominal" ? (input.assumedOpticalEfficiency as number) : 1;
  if (powerKind === "electrical_nominal") {
    warnings.push(
      `由标称电功率乘以假设效率 ${(efficiency * 100).toFixed(0)}% 估算，不是实测光功率。该效率没有依据时结论不可用于定量比较。`,
    );
  }

  const opticalPowerW = watts * efficiency;
  const photonsPerSecond = opticalPowerW / energy.energyPerPhotonJ;

  return {
    photonsPerSecond,
    molPhotonsPerSecond: photonsPerSecond / AVOGADRO_PER_MOL,
    wavelengthNm,
    opticalPowerW,
    warnings,
    provenance: {
      sourceKind: powerKind === "electrical_nominal" ? "estimated" : "calculated",
      formula: "Φ = P / (hc/λ)",
      assumptions:
        powerKind === "electrical_nominal"
          ? [`假设光电转换效率 = ${efficiency}`, "假设全部光功率入射到样品"]
          : ["假设给出的光功率即入射到样品的功率"],
    },
  };
}

export type PhotonDose = {
  molPhotons: number;
  hours: number;
  provenance: Provenance;
};

export function photonDose(molPhotonsPerSecond: number, hours: number): PhotonDose {
  if (!Number.isFinite(hours) || hours < 0) throw new Error("照射时间必须是非负数（h）");
  return {
    molPhotons: molPhotonsPerSecond * hours * 3600,
    hours,
    provenance: { sourceKind: "calculated", formula: "n(photon) = Φ × t" },
  };
}

export type PhotonEquivalents = {
  /** 入射光子当量。**不是**被吸收光子当量，两者不能混用。 */
  incidentEquivalents: number;
  substrateMmol: number;
  molPhotons: number;
  warnings: string[];
  provenance: Provenance;
};

export function photonEquivalents(molPhotons: number, substrateMmol: number): PhotonEquivalents {
  if (!Number.isFinite(substrateMmol) || substrateMmol <= 0) {
    throw new Error("底物物质的量必须是正数（mmol）");
  }
  return {
    incidentEquivalents: molPhotons / (substrateMmol / 1000),
    substrateMmol,
    molPhotons,
    warnings: [
      "这是**入射**光子当量。真正被光催化剂吸收的比例取决于吸光度、光程和几何，通常显著更低。",
      "不要把它当作被吸收光子当量去算量子产率。",
    ],
    provenance: { sourceKind: "calculated", formula: "photon equiv = n(photon) / n(substrate)" },
  };
}

/** 一次算完整条链：能量 → 通量 → 剂量 → 当量。任一步算不出就停在那里。 */
export type PhotonBudget = {
  energy: PhotonEnergy;
  flux: PhotonFlux;
  dose: PhotonDose | null;
  equivalents: PhotonEquivalents | null;
  warnings: string[];
};

export function photonBudget(input: FluxInput & { hours?: number; substrateMmol?: number }): PhotonBudget {
  const energy = photonEnergy(input.wavelengthNm);
  const flux = photonFlux(input);
  const warnings = [...flux.warnings];

  if (flux.molPhotonsPerSecond === null || input.hours === undefined) {
    return { energy, flux, dose: null, equivalents: null, warnings };
  }

  const dose = photonDose(flux.molPhotonsPerSecond, input.hours);
  if (input.substrateMmol === undefined || input.substrateMmol <= 0) {
    return { energy, flux, dose, equivalents: null, warnings };
  }

  const equivalents = photonEquivalents(dose.molPhotons, input.substrateMmol);
  return { energy, flux, dose, equivalents, warnings: [...warnings, ...equivalents.warnings] };
}
