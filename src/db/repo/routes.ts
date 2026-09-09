/**
 * 逆合成路线的保存与读取。
 *
 * 和实验记录一样，**写入是用户的动作**：模型能提议、能展开，但把一条路线存下来
 * 要由用户在 UI 上点保存。模型的工具里没有保存。
 */

import { getDatabase, newId, now } from "..";
import type { RetroRoute } from "../../agent/retro";

export type SavedRoute = {
  id: string;
  targetSmiles: string;
  title: string | null;
  strategy: string | null;
  createdAt: string;
  stepCount: number;
};

export type SavedRouteDetail = SavedRoute & {
  steps: {
    id: string;
    position: number;
    reactionSmiles: string | null;
    transform: string | null;
    reagents: string | null;
    rationale: string | null;
  }[];
};

export async function saveRoute(targetSmiles: string, route: RetroRoute, title?: string): Promise<string> {
  const db = await getDatabase();
  const id = newId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO routes (id, project_id, target_smiles, title, strategy, created_at) VALUES (?, NULL, ?, ?, ?, ?)",
      id,
      targetSmiles,
      title ?? null,
      route.strategy,
      now(),
    );
    for (const step of route.steps) {
      await db.runAsync(
        `INSERT INTO route_steps (id, route_id, parent_step_id, depth, position, reaction_smiles, transform, reagents, rationale, confidence)
         VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, NULL)`,
        newId(),
        id,
        step.order,
        step.reactionSmiles ?? (step.precursorSmiles.length ? `${step.precursorSmiles.join(".")}>>${step.productSmiles}` : null),
        step.transform,
        step.reagents,
        step.rationale,
      );
    }
  });

  return id;
}

export async function listRoutes(): Promise<SavedRoute[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    target_smiles: string;
    title: string | null;
    strategy: string | null;
    created_at: string;
    step_count: number;
  }>(
    `SELECT r.id, r.target_smiles, r.title, r.strategy, r.created_at,
            (SELECT COUNT(*) FROM route_steps s WHERE s.route_id = r.id) AS step_count
     FROM routes r ORDER BY r.created_at DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    targetSmiles: row.target_smiles,
    title: row.title,
    strategy: row.strategy,
    createdAt: row.created_at,
    stepCount: row.step_count,
  }));
}

export async function getRoute(id: string): Promise<SavedRouteDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    target_smiles: string;
    title: string | null;
    strategy: string | null;
    created_at: string;
  }>("SELECT id, target_smiles, title, strategy, created_at FROM routes WHERE id = ?", id);
  if (!row) return null;

  const steps = await db.getAllAsync<{
    id: string;
    position: number;
    reaction_smiles: string | null;
    transform: string | null;
    reagents: string | null;
    rationale: string | null;
  }>(
    "SELECT id, position, reaction_smiles, transform, reagents, rationale FROM route_steps WHERE route_id = ? ORDER BY position",
    id,
  );

  return {
    id: row.id,
    targetSmiles: row.target_smiles,
    title: row.title,
    strategy: row.strategy,
    createdAt: row.created_at,
    stepCount: steps.length,
    steps: steps.map((step) => ({
      id: step.id,
      position: step.position,
      reactionSmiles: step.reaction_smiles,
      transform: step.transform,
      reagents: step.reagents,
      rationale: step.rationale,
    })),
  };
}

export async function deleteRoute(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM routes WHERE id = ?", id);
}
