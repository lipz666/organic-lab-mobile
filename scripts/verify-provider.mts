/**
 * 拿真实端点验证 provider.ts，不经过 RN。
 *
 * 手机上跑不了自动化测试，而 provider 是整个 app 唯一对外的一层，
 * 换 endpoint 最容易出问题，所以留一个能对着真接口跑的脚本。
 *
 *   npm run verify:provider        # 读 .env.local
 */

import { chat, listModels, type FetchLike, type ProviderConfig } from "../src/agent/provider";

const config: ProviderConfig = {
  baseUrl: process.env.ORGANICLAB_BASE_URL ?? "",
  apiKey: process.env.ORGANICLAB_API_KEY ?? "",
  model: process.env.ORGANICLAB_MODEL ?? "gemini-3.7-flash-high",
  // node 的 fetch 有真正的 ReadableStream，可以替掉 expo/fetch。
  fetchImpl: globalThis.fetch as unknown as FetchLike,
};

if (!config.baseUrl || !config.apiKey) {
  console.error("缺少 ORGANICLAB_BASE_URL / ORGANICLAB_API_KEY，先写进 apps/mobile/.env.local");
  process.exit(1);
}

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const models = await listModels(config);
  report("列出模型", models.includes(config.model), `${models.length} 个可用，含 ${config.model}=${models.includes(config.model)}`);

  const plain = await chat(config, {
    messages: [{ role: "user", content: "只回答两个字：收到" }],
  });
  report("非流式对话", plain.content.length > 0, JSON.stringify(plain.content.slice(0, 40)));

  let streamedChunks = 0;
  const streamed = await chat(config, {
    stream: true,
    messages: [{ role: "user", content: "用一句话说明什么是逆合成分析" }],
    onEvent: (event) => {
      if (event.type === "text") streamedChunks += 1;
    },
  });
  report("流式对话", streamedChunks > 1 && streamed.content.length > 0, `${streamedChunks} 个增量帧，${streamed.content.length} 字`);

  const tooled = await chat(config, {
    stream: true,
    messages: [{ role: "user", content: "帮我标准化这个 SMILES: c1ccccc1C(=O)C" }],
    tools: [
      {
        type: "function",
        function: {
          name: "standardize_smiles",
          description: "把 SMILES 标准化为规范形式",
          parameters: {
            type: "object",
            properties: { smiles: { type: "string", description: "输入 SMILES" } },
            required: ["smiles"],
          },
        },
      },
    ],
  });
  const call = tooled.toolCalls[0];
  const args = call ? (JSON.parse(call.function.arguments) as { smiles?: string }) : {};
  report(
    "流式工具调用",
    call?.function.name === "standardize_smiles" && args.smiles === "c1ccccc1C(=O)C",
    call ? `${call.function.name}(${call.function.arguments.replace(/\s+/g, " ")})` : "没有返回 tool_calls",
  );

  // 工具结果回灌，确认第二轮能正常收尾——agent loop 的核心就是这一步。
  const followUp = await chat(config, {
    messages: [
      { role: "user", content: "帮我标准化这个 SMILES: c1ccccc1C(=O)C" },
      { role: "assistant", content: null, tool_calls: tooled.toolCalls },
      { role: "tool", tool_call_id: call?.id ?? "", content: JSON.stringify({ canonical_smiles: "CC(=O)c1ccccc1" }) },
    ],
  });
  report("工具结果回灌", followUp.content.includes("CC(=O)c1ccccc1"), JSON.stringify(followUp.content.slice(0, 80)));

  const badKey = await chat({ ...config, apiKey: "definitely-not-a-key" }, {
    messages: [{ role: "user", content: "hi" }],
  }).then(
    () => null,
    (error: unknown) => error,
  );
  report("错误提示可读", badKey instanceof Error && badKey.message.includes("API Key"), badKey instanceof Error ? badKey.message.slice(0, 60) : "没有抛错");

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
