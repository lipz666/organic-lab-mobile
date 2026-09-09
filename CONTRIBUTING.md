# 参与贡献

## 开始之前

```bash
npm install && npm run sync-skills && npm run build:ketcher
```

首次克隆后先跑一次 Metro，它会生成 `expo-env.d.ts` 和 `.expo/types/`——
没有这两样，`tsc` 会报 CSS 模块和路由类型找不到：

```bash
npx expo start
```

不需要网络也能跑的检查：

```bash
npm run verify:chem && npm run verify:bloom && npm run verify:context && npm run verify:ui && npm run verify:photo
```

需要模型端点的检查见 [README](README.md#验证)。

## 几条不肯让步的地方

改代码前请先读它们，这些不是风格偏好。

**模型只能产出草稿，写入是人的动作。** `commitDraft()` 不在工具列表里，只有确认页
调用。逆合成路线同理——保存是 UI 上的按钮，没有保存工具。如果你想给模型暴露这两个
之一，请先在 issue 里说明理由。

**不替用户补数字。** 没写的字段就是 `null`。不按常规值补、不做单位换算。

**电功率不是光功率。** 没有实测光功率时拒绝给出光子通量，而不是估一个。

**降级要出现在工具摘要里**，不能只写进返回值——UI 的工具条只显示摘要。

**「没查」和「查了没有」要分开。** 索引不可用、数据缺失、确实没有，是三件事。

`verify:loop`、`verify:photo`、`verify:retro` 里有若干项专门守着上面这些。
它们失败通常意味着某个边界被无意中打穿了，而不是测试写错了。

## 提交前

```bash
npx tsc --noEmit && npm run verify
```

发布 Android 包之前还要在模拟器上跑一遍最低验收线，见
[docs/build.md](docs/build.md)——Node 覆盖不到 Hermes release 构建和 WebView。

## 提交信息

说清**为什么**这样改，而不只是改了什么。如果修的是 bug，写明它在什么条件下发生、
为什么之前没被发现。

## 语言

代码注释与文档以中文为主，面向课题组的实际使用者。变量名、类型名用英文。
