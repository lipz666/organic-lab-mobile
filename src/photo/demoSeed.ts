/**
 * 一键载入光化学演示场景。
 *
 * 录 demo 和给别人看的时候需要一组有诊断价值的数据：同一个反应，用校准过的
 * LED-450-01 时 82%/78%，换成没校准的 LED-450-03 且体积 2→8 mL 后只剩 12%/9%，
 * 化学条件完全一致。正确的诊断应该指向光子传递而不是继续换碱。
 *
 * 写进去的实验都带 source='demo'，可以整组清掉，不会和真实记录混在一起。
 */

import { getDatabase } from "../db";
import { createDraft, commitDraft, deleteExperiment, listExperiments } from "../db/repo/experiments";
import { addCalibration, createLightSource, listLightSources } from "../db/repo/equipment";
import { upsertPhotoConditions } from "../db/repo/photoConditions";

const REACTION = "CC(=O)c1ccccc1.COC(=O)C=C>>COC(=O)C(CC)C(C)=O";
const DEMO_SOURCE = "demo";

type DemoRun = {
  code: string;
  performedOn: string;
  yieldPercent: number;
  light: "LED-450-01" | "LED-450-03";
  distanceCm: number;
  volumeMl: number;
  loading: number;
  observation: string;
};

const RUNS: DemoRun[] = [
  {
    code: "PZ-101",
    performedOn: "2026-06-02",
    yieldPercent: 82,
    light: "LED-450-01",
    distanceCm: 3,
    volumeMl: 2,
    loading: 2,
    observation: "4 h 后原料基本消耗",
  },
  {
    code: "PZ-109",
    performedOn: "2026-07-11",
    yieldPercent: 78,
    light: "LED-450-01",
    distanceCm: 3,
    volumeMl: 2,
    loading: 1,
    observation: "降到 1 mol% 仍可重复",
  },
  {
    code: "PZ-114",
    performedOn: "2026-08-02",
    yieldPercent: 9,
    light: "LED-450-03",
    distanceCm: 5,
    volumeMl: 8,
    loading: 2,
    observation: "转化率很低，原料大量剩余",
  },
  {
    code: "PZ-118",
    performedOn: "2026-08-20",
    yieldPercent: 12,
    light: "LED-450-03",
    distanceCm: 5,
    volumeMl: 8,
    loading: 2,
    observation: "TLC 12 h 后仍有大量原料；反应液颜色比前几次浅",
  },
];

export async function hasDemoData(): Promise<boolean> {
  const rows = await listExperiments();
  return rows.some((row) => row.source === DEMO_SOURCE);
}

export async function clearDemoData(): Promise<void> {
  const rows = await listExperiments();
  for (const row of rows.filter((entry) => entry.source === DEMO_SOURCE)) {
    await deleteExperiment(row.id);
  }
  const db = await getDatabase();
  await db.runAsync("DELETE FROM light_sources WHERE name IN ('LED-450-01', 'LED-450-03')");
}

export async function loadDemoData(): Promise<{ experiments: number; lightSources: number }> {
  await clearDemoData();

  const calibratedId = await createLightSource({
    name: "LED-450-01",
    manufacturer: "Kessil",
    model: "PR160L",
    sourceType: "LED",
    nominalWavelengthNm: 450,
    nominalPowerW: 40,
  });
  await addCalibration(calibratedId, {
    peakWavelengthNm: 447,
    fwhmNm: 18,
    opticalPowerMw: 118,
    irradianceMwCm2: 34.5,
    measurementDistanceCm: 3,
    calibrationMethod: "热堆功率计",
    calibrationDate: "2026-05-18",
  });

  // 第二盏灯刻意不给校准记录——这正是诊断要抓住的那个差异。
  const uncalibratedId = await createLightSource({
    name: "LED-450-03",
    manufacturer: "自组装",
    model: "LED strip",
    sourceType: "LED strip",
    nominalWavelengthNm: 450,
    nominalPowerW: 30,
  });

  for (const run of RUNS) {
    const id = await createDraft(
      {
        code: run.code,
        title: "烯酮 [2+2] 环加成",
        purpose: "photochemical [2+2] on enone 1a",
        performedOn: run.performedOn,
        reactionSmiles: REACTION,
        solvent: "MeCN",
        solventVolumeMl: run.volumeMl,
        temperatureC: 25,
        durationHours: 12,
        atmosphere: "N₂",
        lightSource: run.light,
        wavelengthNm: 450,
        distanceCm: run.distanceCm,
        yieldPercent: run.yieldPercent,
        materials: [
          { name: "底物 1a", role: "reactant", amount: 0.2, unit: "mmol", equivalents: 1 },
          { name: "丙烯酸甲酯", role: "reactant", amount: 0.4, unit: "mmol", equivalents: 2 },
          { name: "Ir(ppy)₃", role: "photocatalyst", amount: run.loading, unit: "mol%", equivalents: null },
        ],
        observations: [run.observation],
      },
      DEMO_SOURCE,
    );

    // 演示数据代表已经做完的实验，所以直接确认入库；真实记录仍然必须由人确认。
    await commitDraft(id);

    await upsertPhotoConditions(id, {
      lightSourceId: run.light === "LED-450-01" ? calibratedId : uncalibratedId,
      distanceCm: run.distanceCm,
      irradiationMode: "side",
      reactionVolumeMl: run.volumeMl,
      wavelengthNm: 450,
      // 只有校准过的那盏灯有实测光功率，另一盏是 null——不能编。
      opticalPowerMw: run.light === "LED-450-01" ? 118 : null,
      irradianceMwCm2: run.light === "LED-450-01" ? 34.5 : null,
      photocatalyst: "Ir(ppy)₃",
      photocatalystLoadingMolPercent: run.loading,
      irradiationTimeH: 12,
      degassingMethod: "freeze-pump-thaw ×3",
      coolingMethod: "风扇",
    });
  }

  return { experiments: RUNS.length, lightSources: 2 };
}
