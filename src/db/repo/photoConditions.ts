/**
 * 实验的光化学条件。
 *
 * 和 experiment_runs 一对一。把「光」从备注里的一句自由文本升级成结构化变量，
 * 是整个光化学模块的数据基础——没有这一层，诊断只能靠猜。
 */

import { getDatabase, newId, now } from "..";

export type PhotoConditions = {
  id: string;
  experimentId: string;
  lightSourceId: string | null;
  lightSourceVersionId: string | null;
  lightSourceName: string | null;
  reactorId: string | null;
  distanceCm: number | null;
  irradiationMode: string | null;
  reactionVolumeMl: number | null;
  wavelengthNm: number | null;
  irradianceMwCm2: number | null;
  opticalPowerMw: number | null;
  photonFluxMolS: number | null;
  photonDoseMol: number | null;
  photonEquivalents: number | null;
  photocatalyst: string | null;
  photocatalystSmiles: string | null;
  photocatalystLoadingMolPercent: number | null;
  irradiationTimeH: number | null;
  degassingMethod: string | null;
  coolingMethod: string | null;
};

type Row = Record<string, unknown>;

function toConditions(row: Row): PhotoConditions {
  return {
    id: row.id as string,
    experimentId: row.experiment_id as string,
    lightSourceId: (row.light_source_id as string) ?? null,
    lightSourceVersionId: (row.light_source_version_id as string) ?? null,
    lightSourceName: (row.light_source_name as string) ?? null,
    reactorId: (row.reactor_id as string) ?? null,
    distanceCm: (row.distance_cm as number) ?? null,
    irradiationMode: (row.irradiation_mode as string) ?? null,
    reactionVolumeMl: (row.reaction_volume_ml as number) ?? null,
    wavelengthNm: (row.wavelength_nm as number) ?? null,
    irradianceMwCm2: (row.irradiance_mw_cm2 as number) ?? null,
    opticalPowerMw: (row.optical_power_mw as number) ?? null,
    photonFluxMolS: (row.photon_flux_mol_s as number) ?? null,
    photonDoseMol: (row.photon_dose_mol as number) ?? null,
    photonEquivalents: (row.photon_equivalents as number) ?? null,
    photocatalyst: (row.photocatalyst as string) ?? null,
    photocatalystSmiles: (row.photocatalyst_smiles as string) ?? null,
    photocatalystLoadingMolPercent: (row.photocatalyst_loading_mol_percent as number) ?? null,
    irradiationTimeH: (row.irradiation_time_h as number) ?? null,
    degassingMethod: (row.degassing_method as string) ?? null,
    coolingMethod: (row.cooling_method as string) ?? null,
  };
}

/** 带上光源名字一起取回，诊断时要显示「用的是哪盏灯」。 */
export async function getPhotoConditions(experimentId: string): Promise<PhotoConditions | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(
    `SELECT c.*, s.name AS light_source_name
     FROM photochemical_conditions c
     LEFT JOIN light_sources s ON s.id = c.light_source_id
     WHERE c.experiment_id = ?`,
    experimentId,
  );
  return row ? toConditions(row) : null;
}

export type PhotoConditionsInput = Partial<Omit<PhotoConditions, "id" | "experimentId" | "lightSourceName">>;

export async function upsertPhotoConditions(
  experimentId: string,
  input: PhotoConditionsInput,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM photochemical_conditions WHERE experiment_id = ?",
    experimentId,
  );
  const timestamp = now();

  const values = [
    input.lightSourceId ?? null,
    input.lightSourceVersionId ?? null,
    input.reactorId ?? null,
    input.distanceCm ?? null,
    input.irradiationMode ?? null,
    input.reactionVolumeMl ?? null,
    input.wavelengthNm ?? null,
    input.irradianceMwCm2 ?? null,
    input.opticalPowerMw ?? null,
    input.photonFluxMolS ?? null,
    input.photonDoseMol ?? null,
    input.photonEquivalents ?? null,
    input.photocatalyst ?? null,
    input.photocatalystSmiles ?? null,
    input.photocatalystLoadingMolPercent ?? null,
    input.irradiationTimeH ?? null,
    input.degassingMethod ?? null,
    input.coolingMethod ?? null,
  ];

  if (existing) {
    await db.runAsync(
      `UPDATE photochemical_conditions SET
         light_source_id = ?, light_source_version_id = ?, reactor_id = ?, distance_cm = ?,
         irradiation_mode = ?, reaction_volume_ml = ?, wavelength_nm = ?, irradiance_mw_cm2 = ?,
         optical_power_mw = ?, photon_flux_mol_s = ?, photon_dose_mol = ?, photon_equivalents = ?,
         photocatalyst = ?, photocatalyst_smiles = ?, photocatalyst_loading_mol_percent = ?,
         irradiation_time_h = ?, degassing_method = ?, cooling_method = ?, updated_at = ?
       WHERE experiment_id = ?`,
      ...values,
      timestamp,
      experimentId,
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO photochemical_conditions
       (id, experiment_id, light_source_id, light_source_version_id, reactor_id, distance_cm,
        irradiation_mode, reaction_volume_ml, wavelength_nm, irradiance_mw_cm2, optical_power_mw,
        photon_flux_mol_s, photon_dose_mol, photon_equivalents, photocatalyst, photocatalyst_smiles,
        photocatalyst_loading_mol_percent, irradiation_time_h, degassing_method, cooling_method,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    experimentId,
    ...values,
    timestamp,
    timestamp,
  );
}
