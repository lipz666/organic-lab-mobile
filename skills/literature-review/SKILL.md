---
name: literature-review
description: "Search published literature, read uploaded PDFs, and write a review with verified citations — for total synthesis and photocatalysis, not biomedicine."
version: 1.0.0
metadata:
  hermes:
    tags: [literature, 文献, 检索, review, 综述, 总结, paper, PDF, DOI, 引用, citation]
    related_skills: [precedent-search, research-planning, condition-screening]
---

# 文献检索与综述

## 先分清两件事

**「组里做过没有」和「文献上有没有」是两个问题。**

- 组里做过 → `find_group_precedents`（本组已确认的实验记录）
- 文献上有 → `search_published_literature`（Crossref / OpenAlex / Europe PMC）

被问到"这个反应能不能做"时，**两个都查**，然后分开讲。组里的失败记录比任何文献都重要——
它是这些人在这些设备上的真实结果。

## 检索

`search_published_literature(query, limit, sort, sources)`

**用英文检索。** 三个库存的都是英文元数据，中文检索式命中率极低。用户用中文问，
你把它翻成英文检索式，然后**把用了什么检索式告诉用户**——这样他们能判断你是不是搜偏了。

排序：
- `relevance`（默认）年均引用。光催化领域迭代快，按总引用排会把近两年的工作全压下去
- `citations` 总引用。找该领域的奠基性工作时用
- `year` 最新优先。想知道"最近有什么新进展"时用

每条结果带 `found_in`。**只有一个库收录**的条目要留个心眼——可能是冷门期刊，也可能是元数据有问题。

### 检索式怎么写

化学检索靠的是**具体的名词**，不是自然语言问句：

- 好：`Minisci alkylation quinoline photoredox`
- 差：`how to do Minisci reaction on quinoline`
- 好：`Ir(ppy)3 decarboxylative coupling scope`
- 差：`iridium catalyst papers`

试剂名、底物类别、反应名、机理术语——这些是索引里真实存在的词。

同一个问题**换 2–3 个检索式再搜**，因为命名习惯不统一（`photoredox` / `visible-light` /
`photocatalytic` 指的是同一件事）。

## 读 PDF

用户直接把 PDF 发给你（飞书里发文件，或工作台上传），系统会抽文字层、生成总结、存下来。

- `list_uploaded_papers` — 组里传过哪些
- `read_uploaded_paper(id)` — 读出已有总结

**先查有没有人传过。** 同一篇文献在组里传三遍是常态，第二个人应该看到第一个人的总结。

**扫描件读不了。** 没有文字层的 PDF 会被拒绝而不是硬编一个总结。遇到这种情况，让用户
换出版社原版 PDF，或者把关键页当图片发过来——那条路走视觉模型。

## 引用必须核验

**这是唯一不能妥协的一条。**

编造的 DOI 和真的长得一模一样。任何 DOI 进入总结、报告、或者发给研究人员的消息之前，
**先过 `verify_literature_doi`**。

- `resolves: false` → 这个 DOI 不存在。**不要写进去**，也不要"改一改试试"
- 核验返回的标题和你以为的不一样 → 你记混了，用返回的那个

不确定的引用，宁可写"我没能核实这条引用"，也不要给一个看起来很像的。

## 写综述

### 结构按主题，不按论文

**不要**逐篇罗列（"文献1说……文献2说……"）。那是文献列表，不是综述。

**要**按主题组织，每个主题下面说清楚不同工作之间的**分歧和共识**：

> 关于自由基加成的区域选择性，有两种解释。Hong 组（2019）认为…（doi:…），
> 而 Phipps 组（2021）的手性磷酸体系给出了相反的选择性…（doi:…）。
> 两者的差别可能在于…

### 必须写清楚的四件事

1. **检索留痕** — 用了哪些检索式、哪几个库、什么时候搜的、各返回多少条。
   没有这个，别人无法重复你的检索，综述就只是一段观点。
2. **排除了什么** — 你看了 30 条只用了 8 条，那 22 条为什么不用。
3. **反面证据** — 失败的底物、低产率的例子、作者承认的局限。
   **这比成功案例更有信息量**，因为它划出了方法的边界。
4. **你没查到的** — "这个方向我没有找到直接的文献"是一个有价值的结论，
   但要说清楚是"没有人做过"还是"我没搜到"。这两件事完全不同。

### 对本组的落点

综述的最后要回到胡老师组自己的问题上：天然产物全合成、可见光催化方法学。

- 这些文献里的条件，哪些可以直接拿来试
- 哪些和组里已有的失败记录冲突（**冲突时以组里的记录为准**，那是真实做过的）
- 哪些需要组里没有的设备或试剂

没有明显关联就直说没有，不要硬凑。

## 边界

- **你没有全文访问权。** 检索返回的是题录和摘要；`open_access_pdf` 有值的才有全文。
  RSC、Wiley、ACS 对自动下载返回 403——需要全文时让用户用机构权限下载后发给你。
- **摘要不等于全文。** 只读了摘要就写"该文献报道产率 85%"是不诚实的。
  说清楚你依据的是摘要还是全文。
- **引用年份和期刊以核验结果为准**，不要凭记忆写。
