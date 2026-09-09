/**
 * 逆合成工具。
 *
 * 这里**没有保存路线的工具**，和记录那边同一个道理：保存是用户在 UI 上的动作。
 * 技能文档里写得很直白——采纳路线是正式写入，模型无法自己批准。
 */

import { proposeRoutes, type RetroRoute } from "../retro";
import { validateSmiles } from "../../chem/api";
import type { RegisteredTool, ToolContext, ToolResult } from "./types";
import { fail } from "./types";

const DISCLAIMER =
  "这些路线是模型提出的**假设**，没有经过任何实验或文献验证。回答时必须说明这一点，" +
  "不要写成「文献报道该路线」。usable=false 的路线里有 RDKit 读不出来的结构，不要继续往下用。";

function summarize(routes: RetroRoute[]) {
  return routes.map((route, index) => ({
    index,
    strategy: route.strategy,
    usable: route.usable,
    problems: route.problems.length ? route.problems : undefined,
    step_count: route.steps.length,
    starting_materials: route.startingMaterials,
    steps: route.steps.map((step) => ({
      order: step.order + 1,
      transform: step.transform,
      reaction_smiles: step.reactionSmiles,
      reagents: step.reagents,
      rationale: step.rationale,
    })),
  }));
}

async function run(context: ToolContext, target: string, count: number): Promise<RetroRoute[]> {
  return proposeRoutes(
    {
      baseUrl: context.settings.baseUrl,
      apiKey: context.settings.apiKey,
      model: context.settings.model,
    },
    target,
    { count, validate: validateSmiles },
  );
}

const propose: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "retro_propose_routes",
      description:
        "为目标分子提出若干条断开策略不同的逆合成路线，每条一路拆到目录级起始原料，" +
        "并用 RDKit 校验其中每个结构。返回的路线是**假设**，不是文献路线。" +
        "用户给的是化合物名而不是 SMILES 时，先确认结构再调用——名字容错，SMILES 不容错。",
      parameters: {
        type: "object",
        properties: {
          target_smiles: { type: "string", description: "目标分子的 SMILES" },
          count: { type: "number", description: "要几条路线，默认 3，最多 5" },
        },
        required: ["target_smiles"],
      },
    },
  },
  async run(args, context): Promise<ToolResult> {
    const target = typeof args.target_smiles === "string" ? args.target_smiles.trim() : "";
    if (!target) return fail("没有提供 target_smiles");
    const count = Math.min(typeof args.count === "number" ? args.count : 3, 5);

    try {
      const routes = await run(context, target, count);
      const usable = routes.filter((route) => route.usable === true).length;
      return {
        value: { ok: true, target, routes: summarize(routes), disclaimer: DISCLAIMER },
        summary: `${routes.length} 条路线，${usable} 条结构校验通过`,
      };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
};

const expand: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "retro_expand_step",
      description:
        "把某个中间体再往回拆一层，给出制备它的候选路线。用在用户对某一步不满意、" +
        "或者想看某个中间体还有没有别的做法时。",
      parameters: {
        type: "object",
        properties: {
          smiles: { type: "string", description: "要继续往回拆的结构" },
          count: { type: "number", description: "要几条，默认 2" },
        },
        required: ["smiles"],
      },
    },
  },
  async run(args, context): Promise<ToolResult> {
    const smiles = typeof args.smiles === "string" ? args.smiles.trim() : "";
    if (!smiles) return fail("没有提供 smiles");
    const count = Math.min(typeof args.count === "number" ? args.count : 2, 4);

    try {
      const routes = await run(context, smiles, count);
      return {
        value: { ok: true, target: smiles, routes: summarize(routes), disclaimer: DISCLAIMER },
        summary: `展开出 ${routes.length} 条候选`,
      };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
};

export const RETRO_TOOLS: RegisteredTool[] = [propose, expand];
