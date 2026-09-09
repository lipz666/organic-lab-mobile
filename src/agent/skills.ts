/**
 * 技能的注入方式。
 *
 * 10 个 SKILL.md 加起来约 20KB，每轮全塞进 system prompt 是浪费，而且大部分和当前问题无关。
 * 所以走渐进披露：system prompt 里只放索引（id + 一句话摘要），模型判断需要哪个，
 * 再用 skill_load 把正文取回来。
 *
 * 有个必须处理的落差：这些技能是给服务器版写的，里面提到的工具名
 * （propose_retrosynthetic_routes、find_group_precedents）和渠道（飞书、Web 工作台）
 * 在这个 app 里都不存在。我们不把技能复制一份改写——那会立刻和上游漂移——
 * 而是在返回正文时套一层边界声明，让工具列表始终是唯一权威。
 */

import { SKILLS } from "./skills.generated";
import type { RegisteredTool, ToolResult } from "./tools/types";
import { fail } from "./tools/types";

export const SKILL_BOUNDARY_NOTE =
  "以上技能文档是为服务器版实验室系统写的。其中的**行为准则适用于你**（怎么判断、" +
  "什么不能说、失败先例的价值、哪些必须由人确认）。但文档里提到的工具名、飞书、" +
  "Web 工作台在本 app 中都不存在——**可用工具以你的工具列表为准，列表以外的一律不要提及或声称调用**。";

export function skillIndex(): string {
  return SKILLS.map((skill) => `- ${skill.id}：${skill.title}——${skill.summary}`).join("\n");
}

export const loadSkill: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "skill_load",
      description:
        "取回某个技能的完整正文。遇到实验记录、逆合成、先例检索、条件筛选、文献、" +
        "光化学记录、结构式书写这类任务时，先取回对应技能再动手。",
      parameters: {
        type: "object",
        properties: {
          skill_id: {
            type: "string",
            description: "技能 id",
            enum: SKILLS.map((skill) => skill.id),
          },
        },
        required: ["skill_id"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const id = typeof args.skill_id === "string" ? args.skill_id : "";
    const skill = SKILLS.find((candidate) => candidate.id === id);
    if (!skill) return fail(`没有叫 ${id} 的技能。可用：${SKILLS.map((s) => s.id).join("、")}`);
    return {
      value: { skill_id: skill.id, body: skill.body, boundary: SKILL_BOUNDARY_NOTE },
      summary: `载入技能 ${skill.title}`,
    };
  },
};
