# 砌块库与可得性判定

逆合成的一条硬性约束是"终点前体必须真的能买到"。这需要回答：给一个结构，
它是不是商业可得的砌块？

## 两层设计

**命名表**（`assets/chem/building-blocks.json`，286 条）负责**可读性**。
命中时能显示「苯酚」而不只是一串 SMILES。SMILES 全部经 RDKit 校验。

**ZINC 现货索引**（`assets/chem/bb-instock.bloom`，3.2 MB）负责**覆盖面**。
它是 ZINC20 `bb_instock` 数据集（约 195 万条现货砌块）的 Bloom filter。

| | |
|---|---|
| 条目 | 1,954,442 |
| 体积 | 3.2 MB |
| 假阴性 | **无**——库里真有的一定查得到 |
| 假阳性 | 约 0.13% |

假阳性的方向是"说有货其实没有"，所以措辞是「现货库有」而不是「保证可得」，
卡片上写明下单前仍需向供应商确认。

## 判定的四种结果

| 状态 | 含义 |
|---|---|
| `catalog` | 命名表命中，是常备试剂 |
| `catalog_skeleton` | 骨架相同但立体构型或盐型不同，提示确认 |
| `instock` | ZINC 现货库查到 |
| `unlisted` | 两处都没有，需自行查供应商 |
| `unreadable` | RDKit 读不出，无法判断 |

**索引加载失败时不能把「没查」说成「没有」。** 那种情况下措辞里不会出现 ZINC，
这一点有测试守着。

## 两个实现细节

**盐必须按整体匹配。** SMILES 里 `.` 连接的是同一化合物的多个组分，按片段拆开会把
NaCN 变成裸氰离子，匹配不上砌块表。`ops.js.txt` 的 `standardize` 会额外给出整体
InChIKey。

**把目录喂给模型比事后检查有用得多。** 事后检查只能告诉你没命中；把砌块清单放进
提示词，模型才会照着可得的原料去拆。实测命中率从 1/8 提到 7/8。

## 重建索引

ZINC 库有构建日期，供应商库存也会变。重建：

```bash
curl -O https://files.docking.org/bb/current/bb_instock.smi.gz
```

```bash
npm run build:bb -- ./bb_instock.smi.gz
```

约 8 分钟（195 万条，RDKit 规范化 0.255 ms/条）。规范化必须用 RDKit 重算——
ZINC 的 SMILES 来自它自己的工具链，和运行时算出的规范式对不上，直接字符串比会全部落空。

产物是 `assets/chem/bb-instock.bloom` 和 `bb-instock.meta.json`。

## 扩充命名表

课题组自己常备的杂环砌块、自制中间体，ZINC 不会有。加进
`assets/chem/building-blocks.json`：

```json
{"name": "试剂名", "smiles": "CC(=O)c1ccccc1", "category": "carbonyl"}
```

然后：

```bash
npm run build:blocks
```

这一步会用 RDKit 校验每条 SMILES——写错的会被挡下来，不会等到运行时才发现。
