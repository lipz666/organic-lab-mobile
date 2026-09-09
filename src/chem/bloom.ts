/**
 * Bloom filter，用来回答「这个结构在现货砌块库里吗」。
 *
 * 为什么不直接存全表：ZINC 的现货砌块有 195 万条，规范 SMILES 加起来几十 MB，
 * 塞进手机 app 不现实。Bloom filter 用几 MB 就能覆盖全量，代价是有小概率假阳性。
 *
 * **误判方向很重要**：假阳性意味着「说有货，其实没有」。所以 UI 上的措辞是
 * 「库里查到」而不是「保证可得」，并且把误判率标出来。假阴性不存在——
 * 库里真有的一定查得到。
 */

export type BloomFilter = {
  bits: Uint8Array;
  /** 位数 */
  m: number;
  /** 哈希个数 */
  k: number;
  /** 装入的元素个数，用于估算实际误判率 */
  n: number;
};

/** FNV-1a 32 位。够快、分布够好，且不需要引依赖。 */
function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // 乘 16777619，用移位避免 32 位溢出丢精度
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Kirsch–Mitzenmacher：用两个独立哈希合成 k 个，效果与 k 个独立哈希相当，
 * 但只算两次。
 */
function positions(text: string, m: number, k: number): number[] {
  const h1 = fnv1a(text, 0x811c9dc5);
  const h2 = fnv1a(text, 0x01000193) | 1;
  const result: number[] = [];
  for (let i = 0; i < k; i += 1) {
    result.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
  }
  return result;
}

/** 由目标容量和误判率算出最优参数。 */
export function sizeFor(n: number, falsePositiveRate: number): { m: number; k: number } {
  const m = Math.ceil((-n * Math.log(falsePositiveRate)) / Math.LN2 ** 2);
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  return { m, k };
}

export function createBloom(n: number, falsePositiveRate: number): BloomFilter {
  const { m, k } = sizeFor(n, falsePositiveRate);
  return { bits: new Uint8Array(Math.ceil(m / 8)), m, k, n: 0 };
}

export function bloomAdd(filter: BloomFilter, text: string): void {
  for (const position of positions(text, filter.m, filter.k)) {
    filter.bits[position >>> 3] |= 1 << (position & 7);
  }
  filter.n += 1;
}

export function bloomHas(filter: BloomFilter, text: string): boolean {
  for (const position of positions(text, filter.m, filter.k)) {
    if ((filter.bits[position >>> 3] & (1 << (position & 7))) === 0) return false;
  }
  return true;
}

/** 装填之后的实际误判率估计。 */
export function estimatedFalsePositiveRate(filter: BloomFilter): number {
  return (1 - Math.exp((-filter.k * filter.n) / filter.m)) ** filter.k;
}
