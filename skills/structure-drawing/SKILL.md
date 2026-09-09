---
name: structure-drawing
description: "Draw molecules and reactions inline in a Feishu reply using fenced smiles/reaction blocks."
version: 1.0.0
metadata:
  hermes:
    tags: [structure, 结构图, smiles, reaction, 反应式, depiction, 画结构, feishu]
    related_skills: []
---

# 把结构画出来

你在飞书里说话，**结构图会自动渲染**。用围栏块写出来，研究者看到的是画好的结构而不是
一串 SMILES：

    ```smiles 喹啉底物
    c1ccc2ncccc2c1
    ```

    ```reaction
    CC(=O)c1ccccc1.C=CC(=O)OC>>CCC(C(C)=O)C(=O)OC
    ```

围栏标签后面可以跟一句说明（上面的「喹啉底物」），显示在图下方。

## 什么时候画

讨论具体底物、产物、中间体、机理关键物种，或者要说清一个转化的时候。

**一条回复最多画 4 个**，超出的会退回成文字，所以挑最值得看的画。

## 什么时候不画

- 泛泛谈一类反应，没有具体结构
- 只提试剂名（`Ir(ppy)₃`、`DMP`、`NCS` 这类不用画）
- **你对结构没把握的时候**

最后一条最重要：**画错的结构比不画更糟**。围栏只负责渲染，不做正确性校验——
你写错了就是画错了，而研究者会默认图是对的。没把握就用文字描述，并说明你不确定。
