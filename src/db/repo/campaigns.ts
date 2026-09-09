/**
 * 优化 campaign 的持久化。
 *
 * campaign 是「一次有目标、有预算的条件筛选」。观测点从已确认的实验记录里来——
 * 草稿不算数，和整个 app 的确认边界一致。
 */

import { getDatabase, newId, now } from "..";
import type { CampaignObservation, CampaignVariable } from "../../photo/campaign";

export type Campaign = {
  id: string;
  name: string;
  objective: string;
  variables: CampaignVariable[];
  observations: CampaignObservation[];
  budget: number;
  status: "active" | "done";
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function toCampaign(row: Row): Campaign {
  return {
    id: row.id as string,
    name: row.name as string,
    objective: (row.objective as string) ?? "",
    variables: JSON.parse((row.variables as string) || "[]") as CampaignVariable[],
    observations: JSON.parse((row.observations as string) || "[]") as CampaignObservation[],
    budget: (row.budget as number) ?? 4,
    status: (row.status as Campaign["status"]) ?? "active",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listCampaigns(): Promise<Campaign[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>("SELECT * FROM optimization_campaigns ORDER BY updated_at DESC");
  return rows.map(toCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>("SELECT * FROM optimization_campaigns WHERE id = ?", id);
  return row ? toCampaign(row) : null;
}

export async function createCampaign(input: {
  name: string;
  objective: string;
  variables: CampaignVariable[];
  budget: number;
}): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  const timestamp = now();
  await db.runAsync(
    `INSERT INTO optimization_campaigns (id, name, objective, variables, observations, budget, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, '[]', ?, 'active', ?, ?)`,
    id,
    input.name,
    input.objective,
    JSON.stringify(input.variables),
    input.budget,
    timestamp,
    timestamp,
  );
  return id;
}

export async function addObservation(id: string, observation: CampaignObservation): Promise<void> {
  const campaign = await getCampaign(id);
  if (!campaign) throw new Error("campaign 不存在");
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE optimization_campaigns SET observations = ?, updated_at = ? WHERE id = ?",
    JSON.stringify([...campaign.observations, observation]),
    now(),
    id,
  );
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM optimization_campaigns WHERE id = ?", id);
}
