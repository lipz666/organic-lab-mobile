---
name: precedent-search
description: "Search what the Hu lab has already tried before answering about conditions, substrates, reagents, or failure modes."
version: 1.0.0
metadata:
  hermes:
    tags: [precedent, 先例, conditions, 条件, substrate, 底物, failure, 失败, 组里做过, group history]
    related_skills: [condition-screening]
---

# 先查组里做过没有

通用模型谁都有。你的独特之处是**能查到这个组自己做过什么**——所以遇到条件、底物、试剂、
失败模式相关的问题，**先调 `find_group_precedents`，再谈文献和推测**。

## 怎么调

按手头有什么传参，三个都可以组合：

- `smiles` — 底物或产物结构（同时做子结构和 Morgan 相似性检索）
- `reaction_smiles` — 整个转化（按反应中心相似性检索）
- `query` — 自由文本：试剂名（`Ir(ppy)3`）、失败模式（`原料未转化`）、反应类型（`Minisci`）

一次调用覆盖三种索引并合并结果，同一个实验被多个索引命中时只出现一次、带上所有命中理由。

## 怎么读返回

**`failed: true` 的先例不要跳过。** 它们说明哪块条件空间已经被排除了，
往往比又一个成功案例更有决策价值。返回里 `succeeded` 和 `failed` 是分开计数的。

只返回**已确认**的实验——草稿不算先例。

`conditions` 里带着决定可复现性的字段（光源、波长、功率、灯距、冷却、脱气、试剂、溶剂）。
讨论"能不能重复"的时候，这些比产率重要。

## 怎么回答

引用实验编号，让研究者能自己去核。明确区分三类来源：

- **本组实验记录**（给编号）
- **文献报道**（给出处）
- **你的推测**（说依据）

**组里没有先例就直说没有**，然后再讲文献和你的推断。不要把"我没查到"说成"没人做过"。
