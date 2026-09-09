/**
 * 实验记录的读写。
 *
 * 草稿和正式记录同表，用 status 区分。**改成 committed 的代码只有 commitDraft 一处**，
 * 而 commitDraft 只从确认页调用——模型能调的工具里没有它。这是整个 app 最重要的边界，
 * 加工具时先看这里。
 */

import { getDatabase, newId, now } from "..";
import type { ExtractedRecord } from "../../agent/extraction";

export type ExperimentStatus = "draft" | "committed" | "superseded";

export type Material = {
  id: string;
  name: string;
  role: string | null;
  amount: number | null;
  unit: string | null;
  equivalents: number | null;
};

export type Experiment = {
  id: string;
  code: string | null;
  title: string | null;
  purpose: string | null;
  performedOn: string | null;
  status: ExperimentStatus;
  reactionSmiles: string | null;
  solvent: string | null;
  solventVolumeMl: number | null;
  temperatureC: number | null;
  durationHours: number | null;
  atmosphere: string | null;
  lightSource: string | null;
  wavelengthNm: number | null;
  powerW: number | null;
  distanceCm: number | null;
  yieldPercent: number | null;
  productMassMg: number | null;
  notes: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
};

export type ExperimentDetail = Experiment & {
  materials: Material[];
  observations: { id: string; body: string }[];
  attachments: { id: string; uri: string; caption: string | null }[];
};

type Row = Record<string, unknown>;

function toExperiment(row: Row): Experiment {
  return {
    id: row.id as string,
    code: (row.code as string) ?? null,
    title: (row.title as string) ?? null,
    purpose: (row.purpose as string) ?? null,
    performedOn: (row.performed_on as string) ?? null,
    status: row.status as ExperimentStatus,
    reactionSmiles: (row.reaction_smiles as string) ?? null,
    solvent: (row.solvent as string) ?? null,
    solventVolumeMl: (row.solvent_volume_ml as number) ?? null,
    temperatureC: (row.temperature_c as number) ?? null,
    durationHours: (row.duration_hours as number) ?? null,
    atmosphere: (row.atmosphere as string) ?? null,
    lightSource: (row.light_source as string) ?? null,
    wavelengthNm: (row.wavelength_nm as number) ?? null,
    powerW: (row.power_w as number) ?? null,
    distanceCm: (row.distance_cm as number) ?? null,
    yieldPercent: (row.yield_percent as number) ?? null,
    productMassMg: (row.product_mass_mg as number) ?? null,
    notes: (row.notes as string) ?? null,
    source: (row.source as string) ?? "manual",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    committedAt: (row.committed_at as string) ?? null,
  };
}

const SELECT = `SELECT r.*, x.canonical_reaction_smiles AS reaction_smiles
                FROM experiment_runs r LEFT JOIN reactions x ON x.id = r.reaction_id`;

export async function listExperiments(status?: ExperimentStatus): Promise<Experiment[]> {
  const db = await getDatabase();
  const rows = status
    ? await db.getAllAsync<Row>(`${SELECT} WHERE r.status = ? ORDER BY r.updated_at DESC`, status)
    : await db.getAllAsync<Row>(`${SELECT} ORDER BY r.updated_at DESC`);
  return rows.map(toExperiment);
}

export async function getExperiment(id: string): Promise<ExperimentDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(`${SELECT} WHERE r.id = ?`, id);
  if (!row) return null;

  const materials = await db.getAllAsync<Row>(
    "SELECT id, name, role, amount, unit, equivalents FROM material_usages WHERE experiment_id = ? ORDER BY position",
    id,
  );
  const observations = await db.getAllAsync<{ id: string; body: string }>(
    "SELECT id, body FROM observations WHERE experiment_id = ? ORDER BY position",
    id,
  );
  const attachments = await db.getAllAsync<{ id: string; uri: string; caption: string | null }>(
    "SELECT id, uri, caption FROM attachments WHERE experiment_id = ? ORDER BY created_at",
    id,
  );

  return {
    ...toExperiment(row),
    materials: materials.map((material) => ({
      id: material.id as string,
      name: material.name as string,
      role: (material.role as string) ?? null,
      amount: (material.amount as number) ?? null,
      unit: (material.unit as string) ?? null,
      equivalents: (material.equivalents as number) ?? null,
    })),
    observations,
    attachments,
  };
}

async function upsertReaction(reactionSmiles: string | null): Promise<string | null> {
  if (!reactionSmiles) return null;
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM reactions WHERE reaction_smiles = ?",
    reactionSmiles,
  );
  if (existing) return existing.id;
  const id = newId();
  await db.runAsync(
    "INSERT INTO reactions (id, reaction_smiles, canonical_reaction_smiles, name, created_at) VALUES (?, ?, ?, NULL, ?)",
    id,
    reactionSmiles,
    reactionSmiles,
    now(),
  );
  return id;
}

export type DraftInput = Partial<Omit<Experiment, "id" | "status" | "createdAt" | "updatedAt" | "committedAt">> & {
  materials?: Omit<Material, "id">[];
  observations?: string[];
};

export async function createDraft(input: DraftInput, source = "manual"): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  const timestamp = now();
  const reactionId = await upsertReaction(input.reactionSmiles ?? null);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO experiment_runs
         (id, project_id, reaction_id, code, title, purpose, performed_on, status,
          solvent, solvent_volume_ml, temperature_c, duration_hours, atmosphere,
          light_source, wavelength_nm, power_w, distance_cm,
          yield_percent, product_mass_mg, notes, source, created_at, updated_at, committed_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      id,
      reactionId,
      input.code ?? null,
      input.title ?? null,
      input.purpose ?? null,
      input.performedOn ?? null,
      input.solvent ?? null,
      input.solventVolumeMl ?? null,
      input.temperatureC ?? null,
      input.durationHours ?? null,
      input.atmosphere ?? null,
      input.lightSource ?? null,
      input.wavelengthNm ?? null,
      input.powerW ?? null,
      input.distanceCm ?? null,
      input.yieldPercent ?? null,
      input.productMassMg ?? null,
      input.notes ?? null,
      source,
      timestamp,
      timestamp,
    );
    await writeChildren(id, input);
  });

  return id;
}

async function writeChildren(experimentId: string, input: DraftInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM material_usages WHERE experiment_id = ?", experimentId);
  await db.runAsync("DELETE FROM observations WHERE experiment_id = ?", experimentId);

  let position = 0;
  for (const material of input.materials ?? []) {
    await db.runAsync(
      `INSERT INTO material_usages (id, experiment_id, compound_id, name, role, amount, unit, equivalents, position)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      newId(),
      experimentId,
      material.name,
      material.role ?? null,
      material.amount ?? null,
      material.unit ?? null,
      material.equivalents ?? null,
      position++,
    );
  }

  position = 0;
  for (const body of input.observations ?? []) {
    await db.runAsync(
      "INSERT INTO observations (id, experiment_id, body, observed_at, position) VALUES (?, ?, ?, NULL, ?)",
      newId(),
      experimentId,
      body,
      position++,
    );
  }
}

export async function updateDraft(id: string, input: DraftInput): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ status: string }>("SELECT status FROM experiment_runs WHERE id = ?", id);
  if (!row) throw new Error("记录不存在");
  // 已确认的记录不允许静默覆盖。要改就走修订版本，原记录留痕。
  if (row.status !== "draft") throw new Error("已确认的记录不能直接修改，请创建修订版本");

  const reactionId = await upsertReaction(input.reactionSmiles ?? null);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE experiment_runs SET
         reaction_id = COALESCE(?, reaction_id), code = ?, title = ?, purpose = ?, performed_on = ?,
         solvent = ?, solvent_volume_ml = ?, temperature_c = ?, duration_hours = ?, atmosphere = ?,
         light_source = ?, wavelength_nm = ?, power_w = ?, distance_cm = ?,
         yield_percent = ?, product_mass_mg = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      reactionId,
      input.code ?? null,
      input.title ?? null,
      input.purpose ?? null,
      input.performedOn ?? null,
      input.solvent ?? null,
      input.solventVolumeMl ?? null,
      input.temperatureC ?? null,
      input.durationHours ?? null,
      input.atmosphere ?? null,
      input.lightSource ?? null,
      input.wavelengthNm ?? null,
      input.powerW ?? null,
      input.distanceCm ?? null,
      input.yieldPercent ?? null,
      input.productMassMg ?? null,
      input.notes ?? null,
      now(),
      id,
    );
    await writeChildren(id, input);
  });
}

/**
 * 把草稿转为正式记录。
 *
 * **只有确认页调用这个函数。** 模型的工具里没有它，也不该有。
 * 同时落一份快照进 experiment_versions，确认那一刻的内容永远可回溯。
 */
export async function commitDraft(id: string): Promise<void> {
  const db = await getDatabase();
  const detail = await getExperiment(id);
  if (!detail) throw new Error("记录不存在");
  if (detail.status !== "draft") throw new Error("这条记录已经确认过了");

  const timestamp = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE experiment_runs SET status = 'committed', committed_at = ?, updated_at = ? WHERE id = ?",
      timestamp,
      timestamp,
      id,
    );
    const version = await db.getFirstAsync<{ next: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next FROM experiment_versions WHERE experiment_id = ?",
      id,
    );
    await db.runAsync(
      "INSERT INTO experiment_versions (id, experiment_id, version, snapshot, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      newId(),
      id,
      version?.next ?? 1,
      JSON.stringify({ ...detail, status: "committed", committedAt: timestamp }),
      "人工确认入库",
      timestamp,
    );
    await db.runAsync(
      "UPDATE confirmation_actions SET status = 'approved', resolved_at = ? WHERE target_id = ? AND status = 'pending'",
      timestamp,
      id,
    );
  });
}

export async function deleteExperiment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM experiment_runs WHERE id = ?", id);
}

export async function addAttachment(experimentId: string, uri: string, caption?: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO attachments (id, experiment_id, uri, kind, caption, created_at) VALUES (?, ?, ?, 'image', ?, ?)",
    newId(),
    experimentId,
    uri,
    caption ?? null,
    now(),
  );
}

export function draftFromExtraction(record: ExtractedRecord): DraftInput {
  return {
    code: record.code,
    title: record.title,
    purpose: record.purpose,
    performedOn: record.performedOn,
    reactionSmiles: record.reactionSmiles,
    solvent: record.solvent,
    solventVolumeMl: record.solventVolumeMl,
    temperatureC: record.temperatureC,
    durationHours: record.durationHours,
    atmosphere: record.atmosphere,
    lightSource: record.lightSource,
    wavelengthNm: record.wavelengthNm,
    powerW: record.powerW,
    distanceCm: record.distanceCm,
    yieldPercent: record.yieldPercent,
    productMassMg: record.productMassMg,
    notes: record.notes,
    materials: record.materials.map((material) => ({
      name: material.name,
      role: material.role,
      amount: material.amount,
      unit: material.unit,
      equivalents: material.equivalents,
    })),
    observations: record.observations,
  };
}

/** 全文检索。语义检索要到设置里开启后才走 API，这里是永远离线的那条路。 */
export async function searchExperiments(query: string, limit = 20): Promise<Experiment[]> {
  const db = await getDatabase();
  const like = `%${query.trim()}%`;
  const rows = await db.getAllAsync<Row>(
    `${SELECT}
     WHERE r.code LIKE ? OR r.title LIKE ? OR r.purpose LIKE ? OR r.notes LIKE ?
        OR r.solvent LIKE ? OR r.light_source LIKE ?
        OR r.id IN (SELECT experiment_id FROM material_usages WHERE name LIKE ?)
        OR r.id IN (SELECT experiment_id FROM observations WHERE body LIKE ?)
     ORDER BY r.status = 'committed' DESC, r.updated_at DESC
     LIMIT ?`,
    like, like, like, like, like, like, like, like, limit,
  );
  return rows.map(toExperiment);
}
