import { loadSkill } from "../skills";
import { CHEMISTRY_TOOLS } from "./chemistry";
import { RECORD_TOOLS } from "./records";
import { RETRO_TOOLS } from "./retro";
import type { RegisteredTool, ToolContext, ToolResult } from "./types";

export type { RegisteredTool, ToolContext, ToolResult };
export { runTool, toolDefs } from "./dispatch";

/** app 里的全量注册表。node 里跑测试用 ./portable 那一组。 */
export const TOOLS: RegisteredTool[] = [loadSkill, ...CHEMISTRY_TOOLS, ...RECORD_TOOLS, ...RETRO_TOOLS];
