/**
 * 工具注册表的类型。
 *
 * 服务器版的工具是 MCP stdio 子进程，手机上没有进程可 spawn，所以工具就是普通 TS 函数。
 * 代价是工具跑在和 UI 同一个 JS 线程上——重活必须放到原生模块里（M3 的 RDKit WASM），
 * 不能在这里写长循环。
 */

import type { ToolDef } from "../provider";
import type { Settings } from "../../config/settings";

export type ToolContext = {
  settings: Settings;
};

export type ToolResult = {
  /** 回灌给模型的内容。对象会被 JSON 序列化。 */
  value: unknown;
  /** 给用户看的一行摘要，显示在工具调用条上。 */
  summary: string;
};

export type RegisteredTool = {
  def: ToolDef;
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
};

export function fail(message: string): ToolResult {
  // 工具失败不抛异常：把失败作为结果回灌，模型才能自己改参数重试或者如实告诉用户。
  return { value: { ok: false, error: message }, summary: message };
}
