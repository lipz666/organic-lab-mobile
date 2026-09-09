/**
 * Agent 循环。
 *
 * 这是 hermes-gateway 里那个被 spawn 的 Hermes CLI 在手机上的替代物：
 * 拼上下文 → 调模型 → 跑工具 → 把结果回灌 → 直到模型不再要工具。
 *
 * 每一步都当场落库，而不是等一轮结束再存。中途被杀掉（切后台、崩溃、用户点停止）时，
 * 已经发生的工具调用必须留在历史里——否则下一轮重放时 tool_call_id 对不上，
 * 模型会直接报错，整个会话就废了。
 */

import { chat, type ChatMessage, type ProviderConfig } from "./provider";
import { trimHistory } from "./context";
import { systemPrompt } from "./prompt";
import { runTool, toolDefs } from "./tools/dispatch";
import type { RegisteredTool, ToolContext } from "./tools/types";

/** 单轮里最多几次工具往返。到顶就停，免得模型在工具间兜圈子把用户的额度烧光。 */
const MAX_STEPS = 8;

/**
 * 送进模型的历史预算（token）。
 *
 * 留得比常见窗口小得多：一是给系统提示词、工具定义和本轮回答留出空间，
 * 二是长上下文本身会让模型抓不住重点。真需要更早的内容时，用户会重新提。
 */
const HISTORY_BUDGET_TOKENS = 12000;

/**
 * 历史的读写。app 里是 SQLite，测试里可以换成内存实现——
 * 这样这个循环能脱离 RN 对着真实模型端点跑端到端验证。
 */
export type TurnStore = {
  append: (sessionId: string, message: ChatMessage) => Promise<void>;
  history: (sessionId: string) => Promise<ChatMessage[]>;
  ensureTitle: (sessionId: string, candidate: string) => Promise<void>;
};

export type LoopEvent =
  | { type: "delta"; text: string }
  | { type: "tool_start"; id: string; name: string; args: string }
  | { type: "tool_end"; id: string; name: string; ok: boolean; summary: string }
  | { type: "assistant_done"; text: string }
  | { type: "context_trimmed"; droppedTurns: number }
  | { type: "error"; message: string };

export type RunTurnOptions = {
  config: ProviderConfig;
  context: ToolContext;
  tools: RegisteredTool[];
  store: TurnStore;
  sessionId: string;
  userText: string;
  stream: boolean;
  signal?: AbortSignal;
  onEvent: (event: LoopEvent) => void;
};

export async function runTurn(options: RunTurnOptions): Promise<void> {
  const { config, context, tools, store, sessionId, userText, stream, signal, onEvent } = options;

  const userMessage: ChatMessage = { role: "user", content: userText };
  await store.append(sessionId, userMessage);
  await store.ensureTitle(sessionId, userText);

  const trimmed = trimHistory(await store.history(sessionId), HISTORY_BUDGET_TOKENS);
  if (trimmed.droppedTurns > 0) {
    onEvent({ type: "context_trimmed", droppedTurns: trimmed.droppedTurns });
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt() }, ...trimmed.messages];

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const completion = await chat(config, {
        messages,
        tools: toolDefs(tools),
        stream,
        signal,
        onEvent: (event) => {
          if (event.type === "text") onEvent({ type: "delta", text: event.delta });
        },
      });

      const assistant: ChatMessage = {
        role: "assistant",
        content: completion.content || null,
        ...(completion.toolCalls.length ? { tool_calls: completion.toolCalls } : {}),
      };
      messages.push(assistant);
      await store.append(sessionId, assistant);

      if (completion.toolCalls.length === 0) {
        onEvent({ type: "assistant_done", text: completion.content });
        return;
      }

      for (const call of completion.toolCalls) {
        onEvent({ type: "tool_start", id: call.id, name: call.function.name, args: call.function.arguments });
        const result = await runTool(tools, call.function.name, call.function.arguments, context);
        const ok = !(
          typeof result.value === "object" &&
          result.value !== null &&
          "ok" in result.value &&
          (result.value as { ok: unknown }).ok === false
        );
        onEvent({ type: "tool_end", id: call.id, name: call.function.name, ok, summary: result.summary });

        const toolMessage: ChatMessage = {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.value),
        };
        messages.push(toolMessage);
        await store.append(sessionId, toolMessage);
      }
    }

    // 到这里说明连着 MAX_STEPS 轮都在要工具。如实告诉用户，不要假装答完了。
    const message = `工具调用超过 ${MAX_STEPS} 轮仍未结束，已停止。可以把问题拆小一点再问。`;
    await store.append(sessionId, { role: "assistant", content: message });
    onEvent({ type: "assistant_done", text: message });
  } catch (error) {
    if (signal?.aborted) {
      onEvent({ type: "assistant_done", text: "" });
      return;
    }
    onEvent({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}
