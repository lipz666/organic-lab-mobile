/**
 * 上下文管理与 SMILES 抽取的验证。不需要 API key。
 *
 *   npm run verify:context
 */

import { estimateTokens, extractSmilesCandidates, looksLikeSmiles, trimHistory } from "../src/agent/context";
import type { ChatMessage } from "../src/agent/provider";

let failures = 0;
function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

// ---- token 估算 ----
report("中文按字计", estimateTokens("苯乙酮的分子量") === 7, String(estimateTokens("苯乙酮的分子量")));
report("英文按字符折算", estimateTokens("acetophenone") === 3, String(estimateTokens("acetophenone")));

// ---- 裁剪 ----
function turn(index: number, size = 40): ChatMessage[] {
  return [
    { role: "user", content: `问题${index}`.padEnd(size, "字") },
    { role: "assistant", content: `回答${index}`.padEnd(size, "字") },
  ];
}

const short: ChatMessage[] = [...turn(1), ...turn(2)];
const noTrim = trimHistory(short, 10000);
report("预算充足时不裁剪", noTrim.droppedTurns === 0 && noTrim.messages.length === 4, `${noTrim.messages.length} 条`);

const long: ChatMessage[] = [...turn(1), ...turn(2), ...turn(3), ...turn(4), ...turn(5)];
const trimmed = trimHistory(long, 200);
report("超预算时裁掉最早的轮次", trimmed.droppedTurns > 0, `裁掉 ${trimmed.droppedTurns} 轮`);
report("裁剪后留下摘要说明", trimmed.messages[0].role === "system", String(trimmed.messages[0].role));
report(
  "最后一轮永远保留",
  JSON.stringify(trimmed.messages[trimmed.messages.length - 1]).includes("回答5"),
  "含第 5 轮",
);
report("裁剪后确实变小", trimmed.estimatedTokens < long.reduce((s, m) => s + estimateTokens(String(m.content)), 0), `${trimmed.estimatedTokens} tokens`);

// 工具调用与结果必须成对：拆散了下一轮请求会直接失败
const withTools: ChatMessage[] = [
  { role: "user", content: "第一轮".padEnd(60, "字") },
  { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c1", content: "结果1".padEnd(60, "字") },
  { role: "assistant", content: "答1".padEnd(60, "字") },
  { role: "user", content: "第二轮".padEnd(60, "字") },
  { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "t", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c2", content: "结果2" },
  { role: "assistant", content: "答2" },
];
const toolTrimmed = trimHistory(withTools, 120);
const callIds = toolTrimmed.messages.flatMap((m) => (m.role === "assistant" ? (m.tool_calls ?? []).map((c) => c.id) : []));
const resultIds = toolTrimmed.messages.filter((m) => m.role === "tool").map((m) => (m as { tool_call_id: string }).tool_call_id);
report(
  "裁剪不拆散工具调用与结果",
  callIds.every((id) => resultIds.includes(id)) && resultIds.every((id) => callIds.includes(id)),
  `${callIds.length} 个调用 / ${resultIds.length} 个结果`,
);

// 长工具结果被压缩
const bulky: ChatMessage[] = [
  { role: "user", content: "问" },
  { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c1", content: "x".repeat(5000) },
  { role: "assistant", content: "答" },
];
const condensed = trimHistory(bulky, 100000);
const toolMessage = condensed.messages.find((m) => m.role === "tool");
report(
  "长工具结果被截断",
  typeof toolMessage?.content === "string" && toolMessage.content.length < 800 && toolMessage.content.includes("已截断"),
  `${(toolMessage?.content as string)?.length} 字符`,
);

// ---- SMILES 抽取 ----
report("识别反引号里的 SMILES", extractSmilesCandidates("规范式是 `CC(=O)c1ccccc1` 。").includes("CC(=O)c1ccccc1"), "命中");
report(
  "识别 SMILES: 标注",
  extractSmilesCandidates("产物 SMILES: COC(=O)C=C，收率不错").includes("COC(=O)C=C"),
  "命中",
);
report("识别反应 SMILES", extractSmilesCandidates("`CC=O.CO>>CC(O)OC`").includes("CC=O.CO>>CC(O)OC"), "命中");
report("普通英文词不误判", !looksLikeSmiles("acetophenone"), "acetophenone 被排除");
report("常见缩写不误判", !looksLikeSmiles("DMSO") && !looksLikeSmiles("NMR"), "DMSO/NMR 被排除");
report("带空格的不算", !looksLikeSmiles("CC(=O) c1ccccc1"), "被排除");
report("中文不算", !looksLikeSmiles("苯乙酮"), "被排除");
report("苯的芳香写法算", looksLikeSmiles("c1ccccc1"), "c1ccccc1 通过");
report("不抓正文里的裸词", extractSmilesCandidates("这个反应用 THF 做溶剂").length === 0, "无误报");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
