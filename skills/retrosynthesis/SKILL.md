---
name: retrosynthesis
description: "Propose and judge retrosynthetic routes to a target, with every structure validated and every route treated as a hypothesis."
version: 1.0.0
metadata:
  hermes:
    tags: [retrosynthesis, 逆合成, route, 路线, 断开, disconnection, 全合成, total synthesis, 合成设计]
    related_skills: [precedent-search, literature-review, research-planning]
---

# 逆合成分析

## 工具

`propose_retrosynthetic_routes(target_smiles, n_routes, target_name, project_id)`

给出若干条**断开策略不同**的路线，每条一路拆到目录级起始原料。返回的每条路线带
`usable` 和 `problems`。

`usable=false` 的路线**不要往下用**——它里面有 RDKit 读不出来的结构，画不出图、
查不了先例、也没法比对。`problems` 里写了是哪一步坏了。

其他工具：`get_retrosynthesis_run`、`list_retrosynthesis_runs`、`adopt_retrosynthetic_route`。

## 三件必须说清楚的事

**1. 这是假设，不是文献路线。**

模型给的路线没有经过任何实验或文献验证。每次给出路线时都要说明这一点，
不要写成"文献报道该路线"。**如果你没查过，就不要说"有先例"。**

**2. 查完本组和文献再下判断。**

拿到路线之后，对关键步骤：

- `find_group_precedents` — 组里做过这类转化吗？**失败记录尤其重要**，
  它可能正好说明这条路线的关键步在你们手上走不通
- `search_published_literature` — 文献上这个断开有没有先例

组里的失败记录**优先于**路线的表面合理性。模型不知道你们的设备和试剂。

**3. 采纳要用户确认。**

`adopt_retrosynthetic_route` 会把提案变成正式路线，实验记录会挂到它上面。
这是正式写入，需要带外确认，**你无法自己批准**。

## 怎么判断一条路线好不好

不要只看步数。按这几点讲：

**汇聚 vs 线性。** 两个片段分别做、后期接上，通常好过一条长线性链——
线性路线的总产率是每步产率连乘，第 10 步做砸一次就全没了。

**关键断开在哪一步。** 断开越靠前（越接近目标），风险越集中；
后期才做的复杂偶联如果失败，前面所有工作都赔进去。

**立体化学。** 路线有没有说清楚手性从哪来？手性池、不对称催化、还是拆分？
**"到时候再说"是路线里最常见的漏洞**，看到就要指出来。

**起始原料是不是真的能买到。** 返回的 `starting_materials` 是按实际步骤重算的叶子节点，
但"12 个重原子以下"只是个粗略判据。看着不像常见试剂的，提醒用户去查供应商。

**保护基。** 路线里如果完全没提保护基，而底物上有多个活泼官能团，那多半是漏了。

## 和本组方向的关系

课题组做天然产物全合成和可见光催化方法学。看到路线里有光催化步骤时：

- 是不是真的比经典方法有优势，还是硬凑的
- 波长、光敏剂、还原电位这些参数模型通常不会给，需要自己补
- 组里在光催化上的先例是最有价值的参考

## 飞书里怎么用

用户可以直接发 `/逆合成 <SMILES>`，系统会把每条路线画成合成方案图发出来，
**不经过你**。所以：

- 用户已经用过命令的，不要重复调工具再讲一遍
- 用户用自然语言问"帮我设计一条路线"，你调工具，然后**告诉他们用 `/逆合成` 可以直接看到结构图**——
  你的文字回复里画不出完整的路线树

## 边界

- **不做定量预测。** 不要编产率、不要编反应时间、不要编温度，除非有出处
- **不保证可行。** 逆合成是提出假设，可行性靠实验和文献
- **目标太大会被拒。** 超过 200 个重原子的分子超出这个功能的范围
- 用户给的是化合物名而不是 SMILES 时，你要先确认结构再调工具——**名字对错不了，SMILES 会**
