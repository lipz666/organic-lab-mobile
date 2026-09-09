/**
 * 起始原料可得性判定。
 *
 * 匹配的是精选砌块表（227 个目录级常备试剂）。**表里没有不等于买不到**——
 * 这一点必须在 UI 上写清楚，否则用户会把「未收录」读成「不可得」，
 * 而后者是我们没有能力做出的判断。
 *
 * 匹配分两级：完整 InChIKey 命中最可靠；只命中连接层（前 14 位）说明
 * 骨架相同但立体化学或盐型不同，仍然算目录级，但要提示确认构型。
 */

import { BY_INCHIKEY, BY_SKELETON, type BuildingBlock } from "./buildingBlocks.generated";

export type AvailabilityStatus =
  | "catalog"
  | "catalog_skeleton"
  | "instock"
  | "unlisted"
  | "unreadable";

export type Availability = {
  smiles: string;
  status: AvailabilityStatus;
  match: BuildingBlock | null;
  note: string;
};

export function classifyAvailability(
  smiles: string,
  inchiKey: string | null,
  heavyAtoms: number | null,
  /** ZINC 现货库的查询结果。null 表示索引不可用，和「查不到」不是一回事。 */
  inStock: boolean | null = null,
): Availability {
  if (!inchiKey) {
    return {
      smiles,
      status: "unreadable",
      match: null,
      note: "RDKit 读不出这个结构，无法判断可得性。",
    };
  }

  const exact = BY_INCHIKEY.get(inchiKey);
  if (exact) {
    return { smiles, status: "catalog", match: exact, note: `常备试剂：${exact.name}` };
  }

  const skeleton = BY_SKELETON.get(inchiKey.split("-")[0]);
  if (skeleton) {
    return {
      smiles,
      status: "catalog_skeleton",
      match: skeleton,
      note: `骨架同 ${skeleton.name}，但立体构型或盐型不同——确认要买的是哪一个。`,
    };
  }

  // 命名表没有，再查 ZINC 现货库。它覆盖面大得多，但只给「有/没有」，给不出名字。
  if (inStock === true) {
    return {
      smiles,
      status: "instock",
      match: null,
      note: "在 ZINC 现货砌块库中查到。下单前仍需向供应商确认现货与价格。",
    };
  }

  // 小分子更可能是常备试剂，但这只是先验，不是结论。
  const small = heavyAtoms !== null && heavyAtoms <= 12;
  const scope = inStock === null ? "常备表" : "常备表和 ZINC 现货库";
  return {
    smiles,
    status: "unlisted",
    match: null,
    note: small
      ? `不在${scope}内。分子不大，多半能买到，但需要自行查供应商确认。`
      : `不在${scope}内，且分子较大——很可能需要自己合成，或从供应商定制。`,
  };
}

export function availabilityLabel(status: AvailabilityStatus): string {
  return status === "catalog"
    ? "常备"
    : status === "catalog_skeleton"
      ? "常备（构型待确认）"
      : status === "instock"
        ? "现货库有"
        : status === "unlisted"
          ? "需查供应商"
          : "结构读不出";
}
