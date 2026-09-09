# 架构与设计决策

## 为什么是本地优先

服务器版曾依赖 PostgreSQL + pgvector、MinIO、RDKit、以及几百 MB 的 OCSR 模型
（MolScribe / DECIMER / RxnScribe）。这些在手机上一个都装不下。

重新划分之后：本地 = agent loop 跑在手机上，模型调用从手机直连用户填的端点，
数据和计算都留在设备里。

| 服务器版 | 手机版 |
|---|---|
| PostgreSQL | SQLite（`expo-sqlite`） |
| MinIO | 设备文件系统 |
| 服务端 RDKit | RDKit WASM（隐藏 WebView） |
| pgvector 语义检索 | SQLite 全文检索 |
| OCSR 模型 | 用户已配置的多模态模型 |
| MCP stdio 子进程 | 原生 TS 函数 |
| Hermes CLI 子进程 | `src/agent/loop.ts` |

## 为什么是 React Native 而不是 PWA

**CORS。** 浏览器里直连第三方模型端点会被跨源策略拦下，而"填你自己的 API 信息"
正要求它能。RN 用原生 fetch，没有 CORS 这回事。

## 目录

```
app/                    Expo Router 页面（文件即路由）
├── (tabs)/             对话 / 实验记录 / 功能模块 / 设置
├── draft/[id].tsx      草稿确认页——唯一的入库入口
├── record/[id].tsx     实验记录详情
├── route/[id].tsx      已保存的逆合成路线
└── module/             各功能模块页

src/agent/              Agent 运行时
├── provider.ts         OpenAI 兼容客户端：流式 SSE、工具调用增量累积
├── loop.ts             tool-use 循环
├── context.ts          上下文裁剪与 SMILES 抽取
├── prompt.ts           系统提示词
├── skills.ts           技能渐进披露
├── extraction.ts       照片 → 结构化草稿
├── retro.ts            逆合成（含 16 条合成经验）
└── tools/              工具注册表

src/photo/              光化学
├── photon.ts           光子能量 / 通量 / 剂量 / 当量
├── spectra.ts          光谱解析、LED 建模、重叠度
├── sternVolmer.ts      猝灭拟合
├── photocatalysts.ts   催化剂库与筛选
├── campaign.ts         条件优化
├── rescue.ts           反应诊断
└── demoSeed.ts         演示数据

src/chem/               化学计算
├── RdkitHost.tsx       隐藏 WebView（改动前先读文件头）
├── bridge.ts           RN ↔ WebView 的 RPC
├── api.ts              标准化 / 出图 / 可得性
├── bloom.ts            Bloom filter
├── availability.ts     可得性判定
└── instock.ts          ZINC 现货索引

src/db/                 SQLite
src/ui/                 主题、图表、共享组件
assets/chem/ops.js.txt  RDKit 运算的唯一实现（见下）
```

## RDKit 的运行方式

Hermes 没有 WebAssembly，所以 RDKit 只能跑在 WebView 里。有两个坑值得记住。

**一、WebView 不能 fetch 自己的 wasm。** 页面来源是 `file://`，Android WebView 会拦掉
从该来源发起的 fetch 和 XHR，Emscripten 两条路都会失败。解法是不让它取——把 wasm
转成 base64 写进一个 `.js`，用 `<script>` 标签喂进去，再通过 `wasmBinary` 交给它。

**二、Hermes 不保留函数源码。** 运算逻辑曾写成 TS 函数、用 `rdkitOps.toString()`
注入 WebView，并声称"一份实现两处运行"。那在 Node 上成立，在 Hermes 上不成立：
release 构建后 `toString()` 返回的是 `function rdkitOps(...) { [bytecode] }`。

现在运算逻辑是一个真实文件 `assets/chem/ops.js.txt`：WebView 用 `<script src>` 加载，
Node 测试用 `require` 读同一个文件。**不要改回 toString 注入。**

推广一下：任何依赖"运行时能拿到源码或反射信息"的设计，在 Hermes release 构建下都要
重新验证，Node 测试给不了任何保证。

## 上下文管理

`src/agent/context.ts` 把历史裁到 token 预算之内。裁剪时**一个 assistant 的
`tool_calls` 和它对应的所有 tool 结果必须同进同出**——拆散了下一轮请求会直接失败。
被裁掉的部分留一句说明而不是凭空消失。

## 工具注册表的分层

`loop.ts` 只 import `tools/dispatch.ts`，工具集合由调用方传进来。app 传全量
`TOOLS`，Node 测试传 `PORTABLE_TOOLS`（不碰 SQLite 的子集），整个循环才能脱离 RN
在 Node 里跑端到端验证。

**不要让 `loop.ts` import `tools/index.ts`**——那条链通到 `expo-sqlite`，
Node 里加载不了。
