/**
 * 会话上下文管理。
 *
 * 之前的做法是把整段历史原样发出去，会话一长就有三个问题：
 * 每轮都在为早已无关的内容付钱、超出窗口后直接报错、工具返回的大块 JSON
 * 把真正的对话内容挤到边缘。
 *
 * 这里做三件事：
 *   1. 估算 token 并在超预算时裁剪最早的轮次；
 *   2. 裁剪时**保持工具调用与结果成对**——拆散了模型下一轮会直接报错；
 *   3. 把被裁掉的部分压成一句摘要留在开头，而不是让它凭空消失。
 */

import type { ChatMessage, ToolCall } from "./provider";

/**
 * 粗略的 token 估算。中文约 1 字 1 token，英文约 4 字符 1 token。
 * 只用于决定裁不裁，不需要精确——宁可保守一点。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[一-鿿　-〿＀-￯]/.test(char)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function messageTokens(message: ChatMessage): number {
  const content =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((part) => (part.type === "text" ? part.text : "[图片]"))
            .join("")
        : "";
  const toolCalls =
    message.role === "assistant" && message.tool_calls
      ? message.tool_calls.map((call) => call.function.name + call.function.arguments).join("")
      : "";
  // 每条消息有固定开销（角色、分隔符），算 4 个 token。
  return estimateTokens(content) + estimateTokens(toolCalls) + 4;
}

export type TrimResult = {
  messages: ChatMessage[];
  /** 被裁掉的轮次数，UI 上要告诉用户。 */
  droppedTurns: number;
  estimatedTokens: number;
};

/** 工具结果里的长 JSON 只有模型当轮需要，留在历史里没有价值。 */
const TOOL_RESULT_LIMIT = 600;

function condenseToolResult(message: ChatMessage): ChatMessage {
  if (message.role !== "tool" || message.content.length <= TOOL_RESULT_LIMIT) return message;
  return {
    ...message,
    content: `${message.content.slice(0, TOOL_RESULT_LIMIT)}…（结果已截断，完整内容当时已用于回答）`,
  };
}

/**
 * 把历史裁到预算之内。
 *
 * 从最早的消息开始丢，但**一个 assistant 的 tool_calls 和它对应的所有 tool 结果
 * 必须同进同出**——只丢一半会让下一轮请求直接失败。
 */
export function trimHistory(history: ChatMessage[], budgetTokens: number): TrimResult {
  const condensed = history.map(condenseToolResult);
  const total = condensed.reduce((sum, message) => sum + messageTokens(message), 0);
  if (total <= budgetTokens) {
    return { messages: condensed, droppedTurns: 0, estimatedTokens: total };
  }

  // 把消息切成「块」：user 消息开启一个块，其后的 assistant/tool 都属于它。
  const blocks: ChatMessage[][] = [];
  for (const message of condensed) {
    if (message.role === "user" || blocks.length === 0) blocks.push([message]);
    else blocks[blocks.length - 1].push(message);
  }

  // 从最早的块开始丢，直到装得下。最后一个块（当前轮）永远保留。
  let dropped = 0;
  let remaining = [...blocks];
  let size = total;
  while (remaining.length > 1 && size > budgetTokens) {
    const removed = remaining.shift();
    if (!removed) break;
    size -= removed.reduce((sum, message) => sum + messageTokens(message), 0);
    dropped += 1;
  }

  const kept = remaining.flat();
  if (dropped === 0) return { messages: kept, droppedTurns: 0, estimatedTokens: size };

  const summary: ChatMessage = {
    role: "system",
    content: `（此前还有 ${dropped} 轮对话，因长度限制未包含在本次上下文中。如果用户提到更早的内容而你没有印象，直接说明看不到了，不要猜。）`,
  };
  return {
    messages: [summary, ...kept],
    droppedTurns: dropped,
    estimatedTokens: size + messageTokens(summary),
  };
}

/** 从一段文本里抽出候选 SMILES，用于在对话里自动画结构。 */
export function extractSmilesCandidates(text: string): string[] {
  const found = new Set<string>();

  // 1) 反引号或代码块里的内容——模型写 SMILES 时通常会这样标注
  for (const match of text.matchAll(/`([^`\n]{2,200})`/g)) {
    const candidate = match[1].trim();
    if (looksLikeSmiles(candidate)) found.add(candidate);
  }

  // 2) 显式标注的 SMILES: xxx
  for (const match of text.matchAll(/SMILES\s*[:：]\s*([^\s，。、；`]{2,200})/gi)) {
    const candidate = match[1].trim().replace(/[.。，,；;]$/, "");
    if (looksLikeSmiles(candidate)) found.add(candidate);
  }

  return [...found];
}

/**
 * SMILES 的启发式判据。
 *
 * 宁可漏也不要滥：把普通英文单词当成 SMILES 画出一张错图，比不画更糟。
 * 真正的判定交给 RDKit，这里只做粗筛。
 */
export function looksLikeSmiles(text: string): boolean {
  if (text.length < 2 || text.length > 200) return false;
  if (/\s/.test(text)) return false;
  // 必须只由 SMILES 允许的字符组成
  if (!/^[A-Za-z0-9@+\-\[\]()=#$%.\\/*>:]+$/.test(text)) return false;
  // 必须含有元素符号
  if (!/[CNOSPFIBcnosp]/.test(text)) return false;

  // 全小写字母且没有任何 SMILES 特征符号的，多半是普通单词
  const hasStructuralHint = /[=#()\[\]@\-+0-9]|>>/.test(text);
  if (!hasStructuralHint) {
    // c1ccccc1 这类没有括号但有数字的已经被上面接住；剩下纯字母的要求短且像分子式
    if (!/^[A-Z][a-z]?$|^[CNOSP]+$/.test(text)) return false;
  }

  // 常见英文词误判兜底
  if (/^(?:and|the|for|with|from|this|that|not|use|see|nmr|dmf|dmso|thf|hplc)$/i.test(text)) return false;
  return true;
}
