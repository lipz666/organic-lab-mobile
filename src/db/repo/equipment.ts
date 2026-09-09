/**
 * 设备记忆：光源与反应器。
 *
 * 光源分两层：`light_sources` 记这盏灯是什么（标称值，终身不变），
 * `light_source_versions` 记某次校准测到什么（会随时间漂移）。
 * 正式实验引用的是**版本**，所以半年后回看「都是 450 nm 为什么结果不同」
 * 还能查得出当时用的是哪一版校准。
 */

import { getDatabase, newId, now } from "..";

export type LightSource = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  sourceType: string | null;
  nominalWavelengthNm: number | null;
  nominalPowerW: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LightSourceVersion = {
  id: string;
  lightSourceId: string;
  version: number;
  peakWavelengthNm: number | null;
  fwhmNm: number | null;
  opticalPowerMw: number | null;
  irradianceMwCm2: number | null;
  measurementDistanceCm: number | null;
  calibrationMethod: string | null;
  calibrationDate: string | null;
  notes: string | null;
  createdAt: string;
};

export type LightSourceDetail = LightSource & {
  versions: LightSourceVersion[];
  latest: LightSourceVersion | null;
};

type Row = Record<string, unknown>;

function toLightSource(row: Row): LightSource {
  return {
    id: row.id as string,
    name: row.name as string,
    manufacturer: (row.manufacturer as string) ?? null,
    model: (row.model as string) ?? null,
    sourceType: (row.source_type as string) ?? null,
    nominalWavelengthNm: (row.nominal_wavelength_nm as number) ?? null,
    nominalPowerW: (row.nominal_power_w as number) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toVersion(row: Row): LightSourceVersion {
  return {
    id: row.id as string,
    lightSourceId: row.light_source_id as string,
    version: row.version as number,
    peakWavelengthNm: (row.peak_wavelength_nm as number) ?? null,
    fwhmNm: (row.fwhm_nm as number) ?? null,
    opticalPowerMw: (row.optical_power_mw as number) ?? null,
    irradianceMwCm2: (row.irradiance_mw_cm2 as number) ?? null,
    measurementDistanceCm: (row.measurement_distance_cm as number) ?? null,
    calibrationMethod: (row.calibration_method as string) ?? null,
    calibrationDate: (row.calibration_date as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listLightSources(): Promise<LightSourceDetail[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>("SELECT * FROM light_sources ORDER BY name");
  const versions = await db.getAllAsync<Row>(
    "SELECT * FROM light_source_versions ORDER BY light_source_id, version DESC",
  );

  return rows.map((row) => {
    const source = toLightSource(row);
    const own = versions.filter((entry) => entry.light_source_id === source.id).map(toVersion);
    return { ...source, versions: own, latest: own[0] ?? null };
  });
}

export async function countLightSources(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM light_sources");
  return row?.total ?? 0;
}

export async function getLightSource(id: string): Promise<LightSourceDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>("SELECT * FROM light_sources WHERE id = ?", id);
  if (!row) return null;
  const versions = (
    await db.getAllAsync<Row>(
      "SELECT * FROM light_source_versions WHERE light_source_id = ? ORDER BY version DESC",
      id,
    )
  ).map(toVersion);
  return { ...toLightSource(row), versions, latest: versions[0] ?? null };
}

export type LightSourceInput = {
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  sourceType?: string | null;
  nominalWavelengthNm?: number | null;
  nominalPowerW?: number | null;
  notes?: string | null;
};

export async function createLightSource(input: LightSourceInput): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  const timestamp = now();
  await db.runAsync(
    `INSERT INTO light_sources
       (id, name, manufacturer, model, source_type, nominal_wavelength_nm, nominal_power_w, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.manufacturer ?? null,
    input.model ?? null,
    input.sourceType ?? null,
    input.nominalWavelengthNm ?? null,
    input.nominalPowerW ?? null,
    input.notes ?? null,
    timestamp,
    timestamp,
  );
  return id;
}

export type CalibrationInput = {
  peakWavelengthNm?: number | null;
  fwhmNm?: number | null;
  opticalPowerMw?: number | null;
  irradianceMwCm2?: number | null;
  measurementDistanceCm?: number | null;
  calibrationMethod?: string | null;
  calibrationDate?: string | null;
  notes?: string | null;
};

/** 新增一次校准记录。**永远是追加，不覆盖**——旧实验引用的那一版必须留着。 */
export async function addCalibration(lightSourceId: string, input: CalibrationInput): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ next: number }>(
    "SELECT COALESCE(MAX(version), 0) + 1 AS next FROM light_source_versions WHERE light_source_id = ?",
    lightSourceId,
  );
  const id = newId();
  await db.runAsync(
    `INSERT INTO light_source_versions
       (id, light_source_id, version, peak_wavelength_nm, fwhm_nm, optical_power_mw, irradiance_mw_cm2,
        measurement_distance_cm, calibration_method, calibration_date, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    lightSourceId,
    row?.next ?? 1,
    input.peakWavelengthNm ?? null,
    input.fwhmNm ?? null,
    input.opticalPowerMw ?? null,
    input.irradianceMwCm2 ?? null,
    input.measurementDistanceCm ?? null,
    input.calibrationMethod ?? null,
    input.calibrationDate ?? null,
    input.notes ?? null,
    now(),
  );
  await db.runAsync("UPDATE light_sources SET updated_at = ? WHERE id = ?", now(), lightSourceId);
  return id;
}

export async function deleteLightSource(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM light_sources WHERE id = ?", id);
}

export type Photoreactor = {
  id: string;
  name: string;
  reactorType: string | null;
  material: string | null;
  volumeMl: number | null;
  opticalPathCm: number | null;
  notes: string | null;
};

export async function listReactors(): Promise<Photoreactor[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>("SELECT * FROM photoreactors ORDER BY name");
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    reactorType: (row.reactor_type as string) ?? null,
    material: (row.material as string) ?? null,
    volumeMl: (row.volume_ml as number) ?? null,
    opticalPathCm: (row.optical_path_cm as number) ?? null,
    notes: (row.notes as string) ?? null,
  }));
}

export async function createReactor(input: {
  name: string;
  reactorType?: string | null;
  material?: string | null;
  volumeMl?: number | null;
  opticalPathCm?: number | null;
  notes?: string | null;
}): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  const timestamp = now();
  await db.runAsync(
    `INSERT INTO photoreactors (id, name, reactor_type, material, geometry, volume_ml, optical_path_cm, illuminated_area_cm2, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?)`,
    id,
    input.name,
    input.reactorType ?? null,
    input.material ?? null,
    input.volumeMl ?? null,
    input.opticalPathCm ?? null,
    input.notes ?? null,
    timestamp,
    timestamp,
  );
  return id;
}
