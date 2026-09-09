# 第三方组件与数据

## 软件

| 组件 | 许可证 | 用途 |
|---|---|---|
| [RDKit](https://www.rdkit.org/)（MinimalLib WASM） | BSD-3-Clause | 结构解析、规范化、出图、指纹 |
| [Ketcher](https://github.com/epam/ketcher) | Apache-2.0 | 分子结构编辑器 |
| [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/) | MIT | 应用框架 |
| [react-native-svg](https://github.com/software-mansion/react-native-svg) | MIT | 图表与结构图渲染 |

RDKit 与 Ketcher 均在安装依赖时从 npm 获取，其构建产物不随本仓库分发。

## 数据

### ZINC20 现货砌块库

`assets/chem/bb-instock.bloom` 是由 [ZINC20](https://zinc20.docking.org/) 的
`bb_instock` 数据集（约 195 万条现货砌块）派生的 Bloom filter。

ZINC 由加州大学旧金山分校 Irwin & Shoichet 实验室维护，可免费用于研究用途。
本仓库分发的是**概率性成员索引**，不包含也无法还原原始结构数据——Bloom filter
只能回答「这个结构可能在库中」，取不出任何一条记录。

引用 ZINC 时请使用：

> Irwin, J. J. et al. ZINC20—A Free Ultralarge-Scale Chemical Database for
> Ligand Discovery. *J. Chem. Inf. Model.* **2020**, 60, 6065–6073.

重建索引见 [docs/building-blocks.md](docs/building-blocks.md)。

### 光催化剂参数

`src/photo/photocatalysts.ts` 中的氧化还原电位、三重态能量等数值取自光氧化还原
催化领域综述中被广泛引用的报道值，**仅供定性筛选**。每条记录都标注了测量溶剂与
参比电极——这些量强烈依赖测量条件，脱离条件比较没有意义。定量判断前请回查原始文献。

### 常备砌块命名表

`assets/chem/building-blocks.json` 为本项目整理，SMILES 均经 RDKit 校验。

### 合成经验

`src/agent/retro.ts` 中的 16 条合成经验由课题组提供，随本项目以 MIT 许可证公开。
