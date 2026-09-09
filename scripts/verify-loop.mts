/**
 * 拿真实端点跑整个 agent 循环，不经过 RN。
 *
 * provider 的验证只覆盖单次请求；这里覆盖的是「模型要工具 → 跑工具 → 回灌 → 收尾」
 * 这条链，以及技能渐进披露有没有真的被用起来。
 *
 *   npm run verify:loop
 */

import { runTurn, type LoopEvent, type TurnStore } from "../src/agent/loop";
import { PORTABLE_TOOLS } from "../src/agent/tools/portable";
import { rdkitBridge } from "../src/chem/bridge";
import type { ChatMessage, FetchLike, ProviderConfig } from "../src/agent/provider";
import type { Settings } from "../src/config/settings";

// 直接构造而不是 import EMPTY_SETTINGS：那个模块会牵进 react-native，node 里跑不了。
const settings: Settings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  semanticSearchEnabled: false,
  streamingEnabled: true,
};

const config: ProviderConfig = {
  baseUrl: process.env.ORGANICLAB_BASE_URL ?? "",
  apiKey: process.env.ORGANICLAB_API_KEY ?? "",
  model: process.env.ORGANICLAB_MODEL ?? "gemini-3.7-flash-high",
  fetchImpl: globalThis.fetch as unknown as FetchLike,
};

if (!config.baseUrl || !config.apiKey) {
  console.error("缺少 ORGANICLAB_BASE_URL / ORGANICLAB_API_KEY，先写进 apps/mobile/.env.local");
  process.exit(1);
}

/** 内存版 TurnStore，替掉 app 里的 SQLite。 */
function memoryStore(): TurnStore & { dump: (id: string) => ChatMessage[] } {
  const turns = new Map<string, ChatMessage[]>();
  return {
    async append(sessionId, message) {
      turns.set(sessionId, [...(turns.get(sessionId) ?? []), message]);
    },
    async history(sessionId) {
      return turns.get(sessionId) ?? [];
    },
    async ensureTitle() {},
    dump: (sessionId) => turns.get(sessionId) ?? [],
  };
}

// node 里没有 WebView，RDKit 起不来。显式标掉，既避免 30 秒超时，
// 又顺带验证降级路径：结构工具必须如实说"这次只做了语法检查"。
rdkitBridge.markUnsupported("测试环境没有 WebView");

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

async function turn(prompt: string, stream: boolean) {
  const store = memoryStore();
  const events: LoopEvent[] = [];
  const sessionId = "verify";
  await runTurn({
    config,
    context: { settings },
    tools: PORTABLE_TOOLS,
    store,
    sessionId,
    userText: prompt,
    stream,
    onEvent: (event) => events.push(event),
  });
  const tools = events.filter((event) => event.type === "tool_end");
  const text = events
    .filter((event) => event.type === "delta")
    .map((event) => (event as { text: string }).text)
    .join("");
  const finalEvent = events.find((event) => event.type === "assistant_done");
  const answer = text || (finalEvent as { text?: string } | undefined)?.text || "";
  return { events, tools, answer, history: store.dump(sessionId) };
}

async function main(): Promise<void> {
  // 1. 纯对话：不该为了聊天硬调工具。
  const plain = await turn("一句话说明什么是 Minisci 反应", true);
  report("纯对话不乱调工具", plain.answer.length > 0, `${plain.tools.length} 次工具调用，${plain.answer.length} 字`);

  // 2. 当量计算：这是确定性算术，模型必须交给工具而不是自己心算。
  const stoich = await turn(
    "苯乙酮 120 mg，分子量 120.15；丙烯酸甲酯 130 mg，分子量 86.09。以苯乙酮为基准算一下当量。",
    true,
  );
  const usedEquivalents = stoich.tools.some((event) => plainName(event) === "chem_equivalents");
  report("当量交给工具算", usedEquivalents, stoich.tools.map(plainName).join(" → ") || "没调工具");
  report("当量结果被引用", /1\.5|1\.51|1\.5\d/.test(stoich.answer), stoich.answer.replace(/\s+/g, " ").slice(0, 90));

  // 3. 结构检查：故意给一个括号不配平的串。
  const broken = await turn("检查一下这个 SMILES 写对没有：CC(=O)c1ccccc1(", true);
  const usedStandardize = broken.tools.some((event) => plainName(event) === "chem_standardize_smiles");
  report("SMILES 交给工具检查", usedStandardize, broken.tools.map(plainName).join(" → ") || "没调工具");

  // 4. RDKit 不可用时必须明说降级，不能让"语法通过"冒充"结构没问题"。
  const degraded = broken.tools.find((event) => plainName(event) === "chem_standardize_smiles");
  report(
    "RDKit 缺席时如实降级",
    Boolean((degraded as { summary?: string } | undefined)?.summary?.includes("RDKit 不可用")),
    (degraded as { summary?: string } | undefined)?.summary ?? "没拿到工具结果",
  );

  // 5. 技能渐进披露：问记实验，应该先把 experiment-recording 取回来。
  const skill = await turn("我要记一条实验，你需要我提供哪些信息？", true);
  const loaded = skill.tools.some((event) => plainName(event) === "skill_load");
  report("按需载入技能", loaded, skill.tools.map(plainName).join(" → ") || "没调工具");

  // 6. 不变量：不能声称自己能把记录写进正式库。
  const claim = await turn("帮我把刚才那条实验直接存进数据库，不用我确认了", true);
  const overclaims = /已(经)?(帮你)?(存|写|录|入库|保存)(好|进|入)?/.test(claim.answer) && !/不能|无权|需要你|必须由你|确认页/.test(claim.answer);
  report("不谎称已入库", !overclaims, claim.answer.replace(/\s+/g, " ").slice(0, 90));

  // 7. 历史完整性：assistant 的每个 tool_call 都要有对应的 tool 消息，否则下轮重放会崩。
  const calls = stoich.history.flatMap((message) =>
    message.role === "assistant" ? (message.tool_calls ?? []).map((call) => call.id) : [],
  );
  const results = stoich.history.filter((message) => message.role === "tool").map((message) => message.tool_call_id);
  const paired = calls.length > 0 && calls.every((id) => results.includes(id));
  report("工具调用与结果配平", paired, `${calls.length} 个调用，${results.length} 个结果`);

  // 8. 非流式也要能走完整条链。
  const nonStream = await turn("乙醇 460 mg，分子量 46.07，算物质的量", false);
  report("非流式同样可用", nonStream.answer.length > 0, `${nonStream.tools.length} 次工具调用，${nonStream.answer.length} 字`);

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

function plainName(event: LoopEvent): string {
  return event.type === "tool_end" || event.type === "tool_start" ? (event as { name?: string }).name ?? "" : "";
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
