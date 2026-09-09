# Organic Lab Mobile

**面向有机光化学课题组的本地 AI 研究助手。装上、填一组 API 信息就能用——不登录、不需要服务器、不需要 Docker，实验数据只存在你自己的手机上。**

> A local-first AI agent for organic photochemistry. Install it, enter any
> OpenAI-compatible endpoint, and it runs — no account, no server, no Docker.
> Your experimental records never leave the device.

---

## 它想解决什么

不是做一个"会回答光化学问题的聊天机器人"，而是：

> **当反应失败、产率低、条件难复现时，根据已有实验、设备和光化学参数，帮你决定下一步最值得做什么实验。**

```
实验结果 → 结构化记录 → 失败诊断 → 假设 → 下一批实验 → 新结果 → 更新判断
```

## 功能

| | |
|---|---|
| **科研对话** | 带工具的合成化学对话。提到的分子自动用 RDKit 画出结构图。上下文超长时按轮次裁剪，并保证工具调用与结果成对 |
| **实验记录电子化** | 拍记录本 → 多模态模型识读 → 逐字段核对 → 入库。取代了服务器版几百 MB 的 OCSR 模型 |
| **反应诊断** | 带上本组相似记录、设备清单和光子预算，排出失败假设并设计能区分它们的下一组实验 |
| **光子预算** | 光子能量、通量、剂量、当量。**电功率不会被当成光功率** |
| **光谱与重叠** | UV–Vis 分析，LED 发射与吸收谱叠图，光子加权重叠度 |
| **光催化剂选择** | 按氧化 / 还原 / 能量转移筛选，给出热力学驱动力与波长匹配 |
| **Stern–Volmer** | 猝灭数据线性拟合，KSV、R²、离群点 |
| **条件优化** | 录入已做条件与结果，给出下一批实验（归因 / 精调 / 探索） |
| **设备记忆** | 光源与反应器登记，校准留版本 |
| **逆合成** | 断开策略不同的路线，每步单步反应，前体对照 195 万条现货砌块库 |

## 设计上不肯让步的几件事

**模型只能产出草稿，写入是人的动作。** 实验记录的 `status` 从 `draft` 变成
`committed` 只有一个函数能做，它不在工具列表里，只有确认页调用。逆合成路线同理——
模型能提议能展开，保存是 UI 上的按钮。

**不替用户补数字。** 照片上没写的字段就是 `null`，不按常规值补、不做单位换算。
模型曾把 `2 mol%` 自行折成 `equiv 0.02`，补出来的数字会被当成实验事实。

**电功率不是光功率。** 灯标称 30 W 指的是耗电，落到样品上的光功率通常低一个数量级
且强烈依赖几何。没有实测光功率时，程序**拒绝**给出光子通量，而不是假装算得出来。

**降级要说出来。** RDKit 起不来时结构工具退回语法检查，这件事必须出现在工具摘要里——
悄悄降级比直接失败更糟。

**「没查」和「查了没有」是两回事。** 砌块不在库里只说明需要自行确认供应商，
不等于买不到；索引加载失败时措辞里不会出现 ZINC。

## 快速开始

```bash
npm install
```

```bash
npm run sync-skills && npm run build:ketcher
```

```bash
npm run android   # 或 npm run ios / npm run web
```

打开后到「设置」填 Base URL、API Key 和模型名，点「测试连接并保存」。
任何 OpenAI 兼容的接口都可以。

- **iOS** 需要完整版 Xcode
- **Android** 需要 JDK 17 与 Android SDK，见 [docs/build.md](docs/build.md)
- **Web** 只用于快速看 UI，不是发布目标（`expo-secure-store` 在 web 上不可用，Key 只留在内存）

## 验证

```bash
npm run verify
```

九套检查约 150 项。其中不需要网络的（`verify:chem`、`verify:bloom`、
`verify:context`、`verify:photo`）可以直接跑；其余需要在 `.env.verify.local` 里
填一个可用的接口：

```
ORGANICLAB_BASE_URL=https://your-endpoint
ORGANICLAB_API_KEY=sk-...
ORGANICLAB_MODEL=your-model
```

有几项是**回归性质**的，守着上面那些不肯让步的地方：要求模型跳过确认直接入库时它必须
拒绝；RDKit 缺席时工具摘要必须写明降级；催化剂负载 `2 mol%` 必须原样保留。

**发包前还要在模拟器上跑一遍**——Node 覆盖不到 RDKit 真正运行的环境（release 构建是
Hermes 字节码，WebView 不是浏览器），这个盲区已经造成过两次只在真机上出现的故障。
详见 [docs/build.md](docs/build.md)。

## 架构

```
手机
├── UI (Expo Router)
├── Agent Loop (TypeScript)      ← 直连你填的模型端点
│   ├── Provider  流式 + 工具调用
│   ├── Skills    按需载入 skills/*.md
│   └── Tools     原生 TS 函数
├── SQLite                        实验记录、设备、优化任务
├── FileSystem                    照片附件
└── RDKit WASM（隐藏 WebView）    结构解析与出图
```

选 React Native 而不是 PWA，决定性理由是 **CORS**：浏览器无法直连任意模型端点，
而"填你自己的 API 信息"正要求它能。

更多见 [docs/architecture.md](docs/architecture.md)。

## 文档

- [架构与设计决策](docs/architecture.md)
- [构建与发布](docs/build.md)
- [砌块库与可得性判定](docs/building-blocks.md)
- [参与贡献](CONTRIBUTING.md)
- [第三方组件与数据](NOTICE.md)

## 许可

MIT，见 [LICENSE](LICENSE)。第三方组件与数据的来源和引用要求见 [NOTICE.md](NOTICE.md)。
