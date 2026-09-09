/**
 * 待确认动作。
 *
 * 模型请求入库时只能往这里写一条 pending。真正改 status 的是 commitDraft，
 * 而 commitDraft 只从确认页调用。这一层的意义是让"模型想做但做不了的事"
 * 在 UI 上可见，而不是让模型的请求变成写入。
 */

import { getDatabase, newId, now } from "..";

export type PendingConfirmation = {
  id: string;
  kind: string;
  targetId: string;
  requestedAt: string;
};

export async function requestConfirmation(kind: string, targetId: string, payload?: unknown): Promise<string> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM confirmation_actions WHERE target_id = ? AND kind = ? AND status = 'pending'",
    targetId,
    kind,
  );
  if (existing) return existing.id;

  const id = newId();
  await db.runAsync(
    "INSERT INTO confirmation_actions (id, kind, target_id, payload, status, requested_at, resolved_at) VALUES (?, ?, ?, ?, 'pending', ?, NULL)",
    id,
    kind,
    targetId,
    payload === undefined ? null : JSON.stringify(payload),
    now(),
  );
  return id;
}

export async function listPending(): Promise<PendingConfirmation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; kind: string; target_id: string; requested_at: string }>(
    "SELECT id, kind, target_id, requested_at FROM confirmation_actions WHERE status = 'pending' ORDER BY requested_at DESC",
  );
  return rows.map((row) => ({ id: row.id, kind: row.kind, targetId: row.target_id, requestedAt: row.requested_at }));
}
