/**
 * 光催化剂库。
 *
 * 每个数值都带来源和测量条件——氧化还原电位和三重态能量强烈依赖溶剂与参比电极，
 * 脱离条件的数字没有意义，拿它做筛选更是会把人带偏。所以这里的每条记录
 * 都要说清「在什么溶剂里、对什么参比、谁测的」。
 *
 * 数据取自常见综述中广泛引用的值，仅供**定性筛选**。做定量判断前应回查原始文献
 * 并确认测量条件与你的体系一致。
 */

export type RedoxCondition = {
  solvent: string;
  reference: string;
};

export type Photocatalyst = {
  id: string;
  name: string;
  aliases: string[];
  smiles: string | null;
  /** 吸收峰，nm */
  lambdaMaxNm: number | null;
  /** 常用激发波长范围 */
  usefulRangeNm: [number, number] | null;
  /** 激发态还原电位 E(PC 自由基正离子 / PC 激发态)，越负还原能力越强，V vs SCE */
  excitedStateReduction: number | null;
  /** 激发态氧化电位 E(PC 激发态 / PC 自由基负离子)，越正氧化能力越强，V vs SCE */
  excitedStateOxidation: number | null;
  /** 基态还原电位 E(PC/PC•−) */
  groundStateReduction: number | null;
  /** 基态氧化电位 E(PC•+/PC) */
  groundStateOxidation: number | null;
  /** 三重态能量 kcal/mol */
  tripletEnergyKcal: number | null;
  /** 激发态寿命 ns */
  lifetimeNs: number | null;
  condition: RedoxCondition;
  notes: string;
};

export const PHOTOCATALYSTS: Photocatalyst[] = [
  {
    id: "ir-ppy3",
    name: "Ir(ppy)₃",
    aliases: ["fac-Ir(ppy)3", "三(2-苯基吡啶)合铱"],
    smiles: null,
    lambdaMaxNm: 375,
    usefulRangeNm: [370, 450],
    excitedStateReduction: -1.73,
    excitedStateOxidation: 0.31,
    groundStateReduction: -2.19,
    groundStateOxidation: 0.77,
    tripletEnergyKcal: 55.2,
    lifetimeNs: 1900,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "强还原型光催化剂，激发态还原能力在常用 PC 中居前。三重态能量高，也常作能量转移敏化剂。",
  },
  {
    id: "ir-dfppy-dtbbpy",
    name: "Ir[dF(CF₃)ppy]₂(dtbbpy)PF₆",
    aliases: ["Ir-F", "MacMillan 催化剂"],
    smiles: null,
    lambdaMaxNm: 380,
    usefulRangeNm: [380, 460],
    excitedStateReduction: -0.89,
    excitedStateOxidation: 1.21,
    groundStateReduction: -1.37,
    groundStateOxidation: 1.69,
    tripletEnergyKcal: 60.1,
    lifetimeNs: 2300,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "金属光氧还中最常用的一支，氧化与还原能力均衡，三重态能量高，适合 metallaphotoredox。",
  },
  {
    id: "ru-bpy3",
    name: "Ru(bpy)₃Cl₂",
    aliases: ["Ru(bpy)3", "三联吡啶钌"],
    smiles: null,
    lambdaMaxNm: 452,
    usefulRangeNm: [430, 480],
    excitedStateReduction: -0.81,
    excitedStateOxidation: 0.77,
    groundStateReduction: -1.33,
    groundStateOxidation: 1.29,
    tripletEnergyKcal: 46.5,
    lifetimeNs: 1100,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "吸收正好落在蓝光 LED 峰上，最经典的可见光催化剂。氧化还原能力中等。",
  },
  {
    id: "4czipn",
    name: "4CzIPN",
    aliases: ["4CzIPN", "有机 TADF 催化剂"],
    smiles:
      "N#Cc1c(-n2c3ccccc3c3ccccc32)c(-n2c3ccccc3c3ccccc32)c(C#N)c(-n2c3ccccc3c3ccccc32)c1-n1c2ccccc2c2ccccc21",
    lambdaMaxNm: 435,
    usefulRangeNm: [400, 470],
    excitedStateReduction: -1.04,
    excitedStateOxidation: 1.35,
    groundStateReduction: -1.21,
    groundStateOxidation: 1.52,
    tripletEnergyKcal: 57.0,
    lifetimeNs: 5100,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "无金属，价格远低于铱配合物，氧化还原窗口宽，是铱催化剂最常见的替代品。",
  },
  {
    id: "mes-acr",
    name: "Mes-Acr⁺",
    aliases: ["9-均三甲苯基吖啶鎓", "Fukuzumi 催化剂"],
    smiles: "C[n+]1c2ccccc2c(-c2c(C)cc(C)cc2C)c2ccccc21",
    lambdaMaxNm: 425,
    usefulRangeNm: [400, 450],
    excitedStateReduction: null,
    excitedStateOxidation: 2.06,
    groundStateReduction: -0.57,
    groundStateOxidation: null,
    tripletEnergyKcal: null,
    lifetimeNs: 6000,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "极强的单电子氧化剂，用于难氧化底物（如烯烃、芳烃）的直接氧化。还原能力弱。",
  },
  {
    id: "eosin-y",
    name: "曙红 Y",
    aliases: ["Eosin Y"],
    smiles: "[O-]C(=O)c1ccccc1C1=C2C=C(Br)C(=O)C(Br)=C2Oc2c(Br)c([O-])c(Br)cc21",
    lambdaMaxNm: 539,
    usefulRangeNm: [500, 560],
    excitedStateReduction: -1.11,
    excitedStateOxidation: 0.83,
    groundStateReduction: -1.06,
    groundStateOxidation: 0.78,
    tripletEnergyKcal: 43.0,
    lifetimeNs: 24,
    condition: { solvent: "MeCN/H₂O", reference: "vs SCE" },
    notes: "便宜的有机染料，绿光激发。激发态寿命短，需要较高浓度或高效猝灭剂。",
  },
  {
    id: "rose-bengal",
    name: "玫瑰红",
    aliases: ["Rose Bengal"],
    smiles:
      "[O-]C(=O)c1c(Cl)c(Cl)c(Cl)c(Cl)c1C1=C2C=C(I)C(=O)C(I)=C2Oc2c(I)c([O-])c(I)cc21",
    lambdaMaxNm: 549,
    usefulRangeNm: [520, 570],
    excitedStateReduction: -0.98,
    excitedStateOxidation: 0.99,
    groundStateReduction: -0.78,
    groundStateOxidation: null,
    tripletEnergyKcal: 39.5,
    lifetimeNs: 100,
    condition: { solvent: "MeOH", reference: "vs SCE" },
    notes: "重原子效应使系间窜越效率高，是常用的单线态氧敏化剂。",
  },
  {
    id: "thioxanthone",
    name: "噻吨酮",
    aliases: ["Thioxanthone", "TX"],
    smiles: "O=C1c2ccccc2Sc2ccccc21",
    lambdaMaxNm: 385,
    usefulRangeNm: [370, 420],
    excitedStateReduction: null,
    excitedStateOxidation: null,
    groundStateReduction: null,
    groundStateOxidation: null,
    tripletEnergyKcal: 63.0,
    lifetimeNs: null,
    condition: { solvent: "MeCN", reference: "—" },
    notes: "三重态敏化剂，不走单电子转移。三重态能量高，常用于 [2+2] 环加成和 E/Z 异构化。",
  },
  {
    id: "benzophenone",
    name: "二苯甲酮",
    aliases: ["Benzophenone", "BP"],
    smiles: "O=C(c1ccccc1)c1ccccc1",
    lambdaMaxNm: 335,
    usefulRangeNm: [300, 380],
    excitedStateReduction: null,
    excitedStateOxidation: null,
    groundStateReduction: null,
    groundStateOxidation: null,
    tripletEnergyKcal: 69.0,
    lifetimeNs: null,
    condition: { solvent: "MeCN", reference: "—" },
    notes: "经典三重态敏化剂与夺氢试剂。需要 UV 激发，可见光 LED 打不动。",
  },
  {
    id: "ir-dfppy-dtbbpy-ent",
    name: "Ir(dF-CF₃-ppy)₂(5,5′-dCF₃-bpy)PF₆",
    aliases: ["强氧化型铱"],
    smiles: null,
    lambdaMaxNm: 380,
    usefulRangeNm: [380, 450],
    excitedStateReduction: -0.66,
    excitedStateOxidation: 1.68,
    groundStateReduction: -0.94,
    groundStateOxidation: null,
    tripletEnergyKcal: 61.8,
    lifetimeNs: 1500,
    condition: { solvent: "MeCN", reference: "vs SCE" },
    notes: "氧化能力更强的铱配合物，用于常规铱催化剂氧化不动的底物。",
  },
];

export type Role = "oxidation" | "reduction" | "energy_transfer";

export type ScreenResult = {
  catalyst: Photocatalyst;
  /** 热力学是否有利。null 表示缺数据，不是「不利」。 */
  thermodynamicallyFeasible: boolean | null;
  /** 驱动力，V（能量转移时为 kcal/mol）。 */
  drivingForce: number | null;
  spectralMatch: number | null;
  reasons: string[];
};

/**
 * 热力学粗筛。
 *
 * 只回答「电位差的方向对不对」，不回答反应做不做得成——动力学、副反应、
 * 后续电子转移的可逆性都不在这里。缺数据时返回 null 而不是猜。
 */
export function screenCatalysts(options: {
  role: Role;
  /** 氧化底物时给底物的氧化电位；还原底物时给还原电位。V vs SCE。 */
  substratePotential?: number | null;
  /** 能量转移时给底物三重态能量，kcal/mol。 */
  substrateTripletKcal?: number | null;
  /** LED 峰值波长，用于光谱匹配。 */
  wavelengthNm?: number | null;
  /** 只在这些催化剂里挑（实验室实际有的）。 */
  availableIds?: string[];
}): ScreenResult[] {
  const pool = options.availableIds?.length
    ? PHOTOCATALYSTS.filter((catalyst) => options.availableIds!.includes(catalyst.id))
    : PHOTOCATALYSTS;

  return pool
    .map((catalyst): ScreenResult => {
      const reasons: string[] = [];
      let feasible: boolean | null = null;
      let drivingForce: number | null = null;

      if (options.role === "oxidation") {
        // 要氧化底物：催化剂激发态的氧化电位必须比底物的氧化电位更正
        const pc = catalyst.excitedStateOxidation;
        const sub = options.substratePotential;
        if (pc === null) {
          reasons.push("缺激发态氧化电位数据，无法判断。");
        } else if (sub === null || sub === undefined) {
          reasons.push("没有底物氧化电位，只能看光谱匹配。");
        } else {
          drivingForce = pc - sub;
          feasible = drivingForce > 0;
          reasons.push(
            feasible
              ? `激发态 E = ${pc.toFixed(2)} V 比底物 ${sub.toFixed(2)} V 更正，驱动力 ${drivingForce.toFixed(2)} V。`
              : `激发态 E = ${pc.toFixed(2)} V 不足以氧化 ${sub.toFixed(2)} V 的底物，差 ${Math.abs(drivingForce).toFixed(2)} V。`,
          );
        }
      } else if (options.role === "reduction") {
        const pc = catalyst.excitedStateReduction;
        const sub = options.substratePotential;
        if (pc === null) {
          reasons.push("缺激发态还原电位数据，无法判断。");
        } else if (sub === null || sub === undefined) {
          reasons.push("没有底物还原电位，只能看光谱匹配。");
        } else {
          drivingForce = sub - pc;
          feasible = drivingForce > 0;
          reasons.push(
            feasible
              ? `激发态 E = ${pc.toFixed(2)} V 比底物 ${sub.toFixed(2)} V 更负，驱动力 ${drivingForce.toFixed(2)} V。`
              : `激发态 E = ${pc.toFixed(2)} V 还原能力不足以还原 ${sub.toFixed(2)} V 的底物。`,
          );
        }
      } else {
        const pc = catalyst.tripletEnergyKcal;
        const sub = options.substrateTripletKcal;
        if (pc === null) {
          reasons.push("缺三重态能量数据，无法判断。");
        } else if (sub === null || sub === undefined) {
          reasons.push("没有底物三重态能量，只能看光谱匹配。");
        } else {
          drivingForce = pc - sub;
          feasible = drivingForce > 0;
          reasons.push(
            feasible
              ? `敏化剂 ET = ${pc.toFixed(1)} kcal/mol 高于底物 ${sub.toFixed(1)}，能量转移放热 ${drivingForce.toFixed(1)} kcal/mol。`
              : `敏化剂 ET = ${pc.toFixed(1)} kcal/mol 低于底物 ${sub.toFixed(1)}，三重态能量转移吸热。`,
          );
        }
      }

      // 光谱匹配：LED 波长落在催化剂常用激发区间内多少
      let spectralMatch: number | null = null;
      if (options.wavelengthNm && catalyst.usefulRangeNm) {
        const [low, high] = catalyst.usefulRangeNm;
        const wavelength = options.wavelengthNm;
        if (wavelength >= low && wavelength <= high) {
          spectralMatch = 1;
          reasons.push(`${wavelength} nm 落在常用激发区间 ${low}–${high} nm 内。`);
        } else {
          const distance = wavelength < low ? low - wavelength : wavelength - high;
          spectralMatch = Math.max(0, 1 - distance / 60);
          reasons.push(
            `${wavelength} nm 在常用激发区间 ${low}–${high} nm 之外 ${distance} nm，吸收会明显减弱。`,
          );
        }
      }

      reasons.push(`电位数据条件：${catalyst.condition.solvent}，${catalyst.condition.reference}。`);

      return { catalyst, thermodynamicallyFeasible: feasible, drivingForce, spectralMatch, reasons };
    })
    .sort((a, b) => {
      // 热力学可行的排前面；其次看驱动力；再看光谱匹配。缺数据的排最后但不排除。
      const rank = (result: ScreenResult) =>
        result.thermodynamicallyFeasible === true ? 2 : result.thermodynamicallyFeasible === null ? 1 : 0;
      if (rank(a) !== rank(b)) return rank(b) - rank(a);
      if ((b.spectralMatch ?? 0) !== (a.spectralMatch ?? 0)) return (b.spectralMatch ?? 0) - (a.spectralMatch ?? 0);
      return (b.drivingForce ?? 0) - (a.drivingForce ?? 0);
    });
}
