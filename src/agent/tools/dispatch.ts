/**
 * 工具的分发。
 *
 * 刻意不 import 任何具体工具：loop.ts 只依赖这里，工具集合由调用方传进来。
 * 这样 app 传全量注册表，而测试可以只传不碰 SQLite 的那几个，让整个循环能在 node 里跑。
 */

import type { ToolDef } from "../provider";
import type { RegisteredTool, ToolContext, ToolResult } from "./types";

export function toolDefs(tools: RegisteredTool[]): ToolDef[] {
  return tools.map((tool) => tool.def);
}

export async function runTool(
  tools: RegisteredTool[],
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.def.function.name === name);
  if (!tool) {
    return { value: { ok: false, error: `没有叫 ${name} 的工具` }, summary: `未知工具 ${name}` };
  }

  let args: Record<string, unknown>;
  try {
    args = rawArguments.trim() ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    // 参数不是合法 JSON 时把原文回灌，模型看到自己写坏了才能重来。
    return {
      value: { ok: false, error: "参数不是合法 JSON", received: rawArguments.slice(0, 300) },
      summary: "参数解析失败",
    };
  }

  try {
    return await tool.run(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: { ok: false, error: message }, summary: `工具出错：${message}` };
  }
}
