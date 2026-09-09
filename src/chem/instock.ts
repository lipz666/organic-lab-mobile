/**
 * ZINC 现货砌块索引。
 *
 * 3.2 MB 的 Bloom filter，覆盖 195 万条现货砌块。首次用到时才加载，
 * 加载失败不影响其余功能——退回到只用手写的命名表。
 *
 * 语义要说清楚：命中表示「ZINC 现货库里查到了这个结构」，不是「保证买得到」。
 * 库有构建日期，供应商库存也会变。约 0.13% 的假阳性也在这个方向上。
 */

import { Asset } from "expo-asset";
import { File } from "expo-file-system";

import { bloomHas, type BloomFilter } from "./bloom";
import meta from "../../assets/chem/bb-instock.meta.json";

export const INSTOCK_META = meta;

let filter: BloomFilter | null = null;
let loading: Promise<BloomFilter | null> | null = null;
let failure: string | null = null;

async function load(): Promise<BloomFilter | null> {
  try {
    const [asset] = await Asset.loadAsync(require("../../assets/chem/bb-instock.bloom"));
    const bytes = await new File(asset.localUri ?? asset.uri).bytes();
    filter = { bits: bytes, m: meta.m, k: meta.k, n: meta.entries };
    return filter;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function instockStatus(): { ready: boolean; error: string | null } {
  return { ready: filter !== null, error: failure };
}

/** 返回 null 表示索引还没加载好或加载失败——那和「查不到」是两回事。 */
export async function isInStock(canonicalSmiles: string): Promise<boolean | null> {
  if (!filter) {
    if (!loading) loading = load();
    await loading;
  }
  if (!filter) return null;
  return bloomHas(filter, canonicalSmiles);
}
