import { loadSkill } from "../skills";
import { CHEMISTRY_TOOLS } from "./chemistry";
import { RETRO_TOOLS } from "./retro";
import type { RegisteredTool } from "./types";

/**
 * 不碰 SQLite 的那一组工具。
 *
 * 单独一个模块，是为了让 node 里的测试能只 import 这些——从 index.ts 取会一并拉进
 * 记录工具，那条链通到 expo-sqlite，node 里加载不了。
 */
export const PORTABLE_TOOLS: RegisteredTool[] = [loadSkill, ...CHEMISTRY_TOOLS, ...RETRO_TOOLS];
