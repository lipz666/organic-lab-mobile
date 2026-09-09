/**
 * 实验记录工具。
 *
 * 注意这里**没有**提交入库的工具，而且不该有。模型能建草稿、能改草稿、能请求确认，
 * 但 status 从 draft 变成 committed 的那一步只在确认页里发生。
 * 加工具的时候如果发现自己想暴露 commitDraft，先回头读一遍这段。
 */

import {
  createDraft,
  getExperiment,
  listExperiments,
  searchExperiments,
  updateDraft,
  type DraftInput,
} from "../../db/repo/experiments";
import { requestConfirmation } from "../../db/repo/confirmations";
import type { RegisteredTool, ToolResult } from "./types";
import { fail } from "./types";

const FIELD_PROPERTIES = {
  code: { type: "string", description: "实验编号" },
  title: { type: "string" },
  purpose: { type: "string" },
  performed_on: { type: "string", description: "YYYY-MM-DD" },
  reaction_smiles: { type: "string", description: "reactants>>products" },
  solvent: { type: "string" },
  solvent_volume_ml: { type: "number" },
  temperature_c: { type: "number" },
  duration_hours: { type: "number" },
  atmosphere: { type: "string" },
  light_source: { type: "string" },
  wavelength_nm: { type: "number" },
  power_w: { type: "number" },
  distance_cm: { type: "number" },
  yield_percent: { type: "number" },
  product_mass_mg: { type: "number" },
  notes: { type: "string" },
  materials: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        role: { type: "string" },
        amount: { type: "number" },
        unit: { type: "string" },
        equivalents: { type: "number" },
      },
      required: ["name"],
    },
  },
  observations: { type: "array", items: { type: "string" } },
} as const;

function toDraftInput(args: Record<string, unknown>): DraftInput {
  const materials = Array.isArray(args.materials) ? args.materials : [];
  const observations = Array.isArray(args.observations) ? args.observations : [];
  const text = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : null);
  const num = (key: string) => (typeof args[key] === "number" ? (args[key] as number) : null);

  return {
    code: text("code"),
    title: text("title"),
    purpose: text("purpose"),
    performedOn: text("performed_on"),
    reactionSmiles: text("reaction_smiles"),
    solvent: text("solvent"),
    solventVolumeMl: num("solvent_volume_ml"),
    temperatureC: num("temperature_c"),
    durationHours: num("duration_hours"),
    atmosphere: text("atmosphere"),
    lightSource: text("light_source"),
    wavelengthNm: num("wavelength_nm"),
    powerW: num("power_w"),
    distanceCm: num("distance_cm"),
    yieldPercent: num("yield_percent"),
    productMassMg: num("product_mass_mg"),
    notes: text("notes"),
    materials: materials.map((entry) => {
      const material = (entry ?? {}) as Record<string, unknown>;
      return {
        name: typeof material.name === "string" ? material.name : "未命名",
        role: typeof material.role === "string" ? material.role : null,
        amount: typeof material.amount === "number" ? material.amount : null,
        unit: typeof material.unit === "string" ? material.unit : null,
        equivalents: typeof material.equivalents === "number" ? material.equivalents : null,
      };
    }),
    observations: observations.filter((entry): entry is string => typeof entry === "string"),
  };
}

const search: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "records_search",
      description:
        "在本机实验记录里检索，命中编号、标题、目的、备注、溶剂、光源、试剂名和观察。" +
        "**失败的实验也会返回**——失败先例说明哪些条件已经被排除，往往比成功的更有用。" +
        "不传 query 就返回最近的记录。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "关键词" },
          limit: { type: "number", description: "最多返回几条，默认 20" },
        },
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const rows = query ? await searchExperiments(query, limit) : (await listExperiments()).slice(0, limit);
    return {
      value: {
        ok: true,
        count: rows.length,
        records: rows.map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          status: row.status,
          performed_on: row.performedOn,
          solvent: row.solvent,
          yield_percent: row.yieldPercent,
        })),
      },
      summary: `找到 ${rows.length} 条记录`,
    };
  },
};

const get: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "records_get",
      description: "取一条实验记录的完整内容，包括投料、条件、观察。",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "记录 id，来自 records_search" } },
        required: ["id"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const id = typeof args.id === "string" ? args.id : "";
    const detail = await getExperiment(id);
    if (!detail) return fail(`没有 id 为 ${id} 的记录`);
    return { value: { ok: true, record: detail }, summary: `读取 ${detail.code ?? detail.id}` };
  },
};

const createDraftTool: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "records_create_draft",
      description:
        "新建一条实验记录**草稿**。这不是入库——草稿要由用户在确认页逐字段核对后才会成为正式记录。" +
        "用户没说的字段一律留空，不要按常规值补。",
      parameters: { type: "object", properties: FIELD_PROPERTIES },
    },
  },
  async run(args): Promise<ToolResult> {
    const id = await createDraft(toDraftInput(args), "agent");
    return {
      value: {
        ok: true,
        id,
        status: "draft",
        note: "已创建草稿。它还不是正式记录——请让用户到实验记录页打开这条草稿逐项核对并确认。",
      },
      summary: "已创建草稿",
    };
  },
};

const updateDraftTool: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "records_update_draft",
      description: "修改一条尚未确认的草稿。已确认的记录改不了——那要走修订版本。",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, ...FIELD_PROPERTIES },
        required: ["id"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const id = typeof args.id === "string" ? args.id : "";
    try {
      await updateDraft(id, toDraftInput(args));
      return { value: { ok: true, id }, summary: "草稿已更新" };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
};

const requestCommit: RegisteredTool = {
  def: {
    type: "function",
    function: {
      name: "records_request_commit",
      description:
        "请求把某条草稿转为正式记录。**这不会写入任何东西**，只会在确认页上挂出一条待确认项。" +
        "只有用户本人在确认页逐字段核对后点击提交才算入库。调用后要如实告诉用户去确认，" +
        "不要说已经入库了。",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "草稿 id" } },
        required: ["id"],
      },
    },
  },
  async run(args): Promise<ToolResult> {
    const id = typeof args.id === "string" ? args.id : "";
    const detail = await getExperiment(id);
    if (!detail) return fail(`没有 id 为 ${id} 的记录`);
    if (detail.status !== "draft") return fail("这条记录已经确认过了");

    await requestConfirmation("experiment.commit", id);
    return {
      value: {
        ok: true,
        id,
        status: "pending_confirmation",
        note: "已挂出待确认项。记录仍是草稿，必须由用户在确认页核对后提交。你无权代替用户确认。",
      },
      summary: "已请求确认，等待用户核对",
    };
  },
};

export const RECORD_TOOLS: RegisteredTool[] = [search, get, createDraftTool, updateDraftTool, requestCommit];
