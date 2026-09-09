/**
 * app 侧调用 RDKit 的入口。工具和 UI 都用这里，不要直接碰 bridge。
 */

import { rdkitBridge } from "./bridge";
import { isInStock } from "./instock";

export type StandardizeResult = {
  ok: boolean;
  canonical?: string;
  is_reaction?: boolean;
  /** 整体的 InChIKey——盐和共晶算作一个化合物，可得性匹配用它。反应时为 null。 */
  inchi_key?: string | null;
  molecular_weight?: number | null;
  heavy_atoms?: number | null;
  components?: { canonical: string; molecular_weight: number; inchi_key: string; heavy_atoms: number }[];
  error?: string;
};

export async function standardize(smiles: string): Promise<StandardizeResult> {
  return (await rdkitBridge.call("standardize", { smiles })) as StandardizeResult;
}

export type DepictResult = {
  ok: boolean;
  is_reaction?: boolean;
  svgs?: string[];
  reactants?: string[];
  products?: string[];
  error?: string;
};

export async function depict(smiles: string, width = 240, height = 180): Promise<DepictResult> {
  return (await rdkitBridge.call("depict", { smiles, width, height })) as DepictResult;
}

/**
 * 给 retro.ts 用的结构校验器。
 *
 * 顺带把 InChIKey 和重原子数带出来——可得性判定要用它们，
 * 分两次调用 RDKit 是白白多走一趟 WebView 往返。
 *
 * RDKit 不可用时会抛错，由 validateRoute 处理成 usable=null。
 */
export async function validateSmiles(smiles: string): Promise<{
  ok: boolean;
  canonical?: string;
  inchiKey?: string;
  heavyAtoms?: number;
  /** ZINC 现货库查询结果；索引不可用时为 null。 */
  inStock?: boolean | null;
  error?: string;
}> {
  const result = await standardize(smiles);
  const first = result.components?.[0];
  const canonical = result.canonical;
  const inStock = result.ok && canonical && !result.is_reaction ? await isInStock(canonical) : null;
  return {
    ok: result.ok,
    canonical,
    inStock,
    // 优先用整体 key：NaCN 这类盐按片段拆开就匹配不上砌块表了。
    inchiKey: result.inchi_key ?? first?.inchi_key,
    heavyAtoms: result.heavy_atoms ?? first?.heavy_atoms,
    error: result.error,
  };
}
