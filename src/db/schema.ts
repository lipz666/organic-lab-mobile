/**
 * 本地 SQLite schema。
 *
 * 从 services/api 的 33 张表里挑出核心闭环那一组，砍掉了渠道（无服务器则无飞书/微信入口）、
 * 用户（不登录）和优化/文献（第一版不做）。字段命名沿用服务端，将来要把手机数据导回
 * 实验室数据库时才不用做名字映射。
 *
 * 草稿和正式记录同表，用 status 区分：模型只能写出 status='draft' 的行，
 * 改成 'committed' 的那一步只有确认页能做。
 */

export const SCHEMA_VERSION = 3;

export const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS projects (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS compounds (
       id TEXT PRIMARY KEY,
       name TEXT,
       smiles TEXT,
       canonical_smiles TEXT,
       inchi_key TEXT,
       molecular_formula TEXT,
       molecular_weight REAL,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_compounds_inchi ON compounds (inchi_key)`,

    `CREATE TABLE IF NOT EXISTS reactions (
       id TEXT PRIMARY KEY,
       reaction_smiles TEXT,
       canonical_reaction_smiles TEXT,
       name TEXT,
       created_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS experiment_runs (
       id TEXT PRIMARY KEY,
       project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
       reaction_id TEXT REFERENCES reactions (id) ON DELETE SET NULL,
       code TEXT,
       title TEXT,
       purpose TEXT,
       performed_on TEXT,
       status TEXT NOT NULL DEFAULT 'draft',
       solvent TEXT,
       solvent_volume_ml REAL,
       temperature_c REAL,
       duration_hours REAL,
       atmosphere TEXT,
       light_source TEXT,
       wavelength_nm REAL,
       power_w REAL,
       distance_cm REAL,
       yield_percent REAL,
       product_mass_mg REAL,
       notes TEXT,
       source TEXT NOT NULL DEFAULT 'manual',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       committed_at TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_runs_status ON experiment_runs (status, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_runs_project ON experiment_runs (project_id)`,

    `CREATE TABLE IF NOT EXISTS experiment_versions (
       id TEXT PRIMARY KEY,
       experiment_id TEXT NOT NULL REFERENCES experiment_runs (id) ON DELETE CASCADE,
       version INTEGER NOT NULL,
       snapshot TEXT NOT NULL,
       reason TEXT,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_versions_experiment ON experiment_versions (experiment_id, version DESC)`,

    `CREATE TABLE IF NOT EXISTS material_usages (
       id TEXT PRIMARY KEY,
       experiment_id TEXT NOT NULL REFERENCES experiment_runs (id) ON DELETE CASCADE,
       compound_id TEXT REFERENCES compounds (id) ON DELETE SET NULL,
       name TEXT NOT NULL,
       role TEXT,
       amount REAL,
       unit TEXT,
       equivalents REAL,
       position INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE INDEX IF NOT EXISTS idx_materials_experiment ON material_usages (experiment_id, position)`,

    `CREATE TABLE IF NOT EXISTS observations (
       id TEXT PRIMARY KEY,
       experiment_id TEXT NOT NULL REFERENCES experiment_runs (id) ON DELETE CASCADE,
       body TEXT NOT NULL,
       observed_at TEXT,
       position INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE INDEX IF NOT EXISTS idx_observations_experiment ON observations (experiment_id, position)`,

    `CREATE TABLE IF NOT EXISTS attachments (
       id TEXT PRIMARY KEY,
       experiment_id TEXT REFERENCES experiment_runs (id) ON DELETE CASCADE,
       uri TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'image',
       caption TEXT,
       created_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS hypotheses (
       id TEXT PRIMARY KEY,
       project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
       statement TEXT NOT NULL,
       rationale TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       created_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS decision_records (
       id TEXT PRIMARY KEY,
       project_id TEXT REFERENCES projects (id) ON DELETE CASCADE,
       experiment_id TEXT REFERENCES experiment_runs (id) ON DELETE SET NULL,
       decision TEXT NOT NULL,
       rationale TEXT,
       next_action TEXT,
       created_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS agent_sessions (
       id TEXT PRIMARY KEY,
       title TEXT,
       project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS conversation_turns (
       id TEXT PRIMARY KEY,
       session_id TEXT NOT NULL REFERENCES agent_sessions (id) ON DELETE CASCADE,
       role TEXT NOT NULL,
       content TEXT,
       tool_calls TEXT,
       tool_call_id TEXT,
       position INTEGER NOT NULL,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_turns_session ON conversation_turns (session_id, position)`,

    `CREATE TABLE IF NOT EXISTS routes (
       id TEXT PRIMARY KEY,
       project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
       target_smiles TEXT NOT NULL,
       title TEXT,
       strategy TEXT,
       created_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS route_steps (
       id TEXT PRIMARY KEY,
       route_id TEXT NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
       parent_step_id TEXT REFERENCES route_steps (id) ON DELETE CASCADE,
       depth INTEGER NOT NULL DEFAULT 0,
       position INTEGER NOT NULL DEFAULT 0,
       reaction_smiles TEXT,
       transform TEXT,
       reagents TEXT,
       rationale TEXT,
       confidence REAL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_steps_route ON route_steps (route_id, depth, position)`,

    // 模型请求入库时落在这里，UI 读它弹确认页。模型没有任何路径能把它标成 approved。
    `CREATE TABLE IF NOT EXISTS confirmation_actions (
       id TEXT PRIMARY KEY,
       kind TEXT NOT NULL,
       target_id TEXT NOT NULL,
       payload TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       requested_at TEXT NOT NULL,
       resolved_at TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_confirmations_status ON confirmation_actions (status, requested_at DESC)`,
  ],

  // v2 — 光化学模块
  //
  // 光源分成 light_sources（这盏灯是什么）和 light_source_versions（某次校准测到什么）。
  // 分开是因为标称值终身不变而校准值会随时间漂移，正式实验必须留住"当时用的是哪一版校准"，
  // 否则半年后回头看"都是 450 nm 为什么结果不同"就永远查不出来。
  [
    `CREATE TABLE IF NOT EXISTS light_sources (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       manufacturer TEXT,
       model TEXT,
       source_type TEXT,
       nominal_wavelength_nm REAL,
       nominal_power_w REAL,
       notes TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS light_source_versions (
       id TEXT PRIMARY KEY,
       light_source_id TEXT NOT NULL REFERENCES light_sources (id) ON DELETE CASCADE,
       version INTEGER NOT NULL,
       peak_wavelength_nm REAL,
       fwhm_nm REAL,
       optical_power_mw REAL,
       irradiance_mw_cm2 REAL,
       measurement_distance_cm REAL,
       calibration_method TEXT,
       calibration_date TEXT,
       notes TEXT,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_light_versions ON light_source_versions (light_source_id, version DESC)`,

    `CREATE TABLE IF NOT EXISTS photoreactors (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       reactor_type TEXT,
       material TEXT,
       geometry TEXT,
       volume_ml REAL,
       optical_path_cm REAL,
       illuminated_area_cm2 REAL,
       notes TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,

    // 一条实验对应一份光化学条件。experiment_id 唯一，改条件是覆盖而不是追加。
    `CREATE TABLE IF NOT EXISTS photochemical_conditions (
       id TEXT PRIMARY KEY,
       experiment_id TEXT NOT NULL UNIQUE REFERENCES experiment_runs (id) ON DELETE CASCADE,
       light_source_id TEXT REFERENCES light_sources (id) ON DELETE SET NULL,
       light_source_version_id TEXT REFERENCES light_source_versions (id) ON DELETE SET NULL,
       reactor_id TEXT REFERENCES photoreactors (id) ON DELETE SET NULL,
       distance_cm REAL,
       irradiation_mode TEXT,
       reaction_volume_ml REAL,
       wavelength_nm REAL,
       irradiance_mw_cm2 REAL,
       optical_power_mw REAL,
       photon_flux_mol_s REAL,
       photon_dose_mol REAL,
       photon_equivalents REAL,
       photocatalyst TEXT,
       photocatalyst_smiles TEXT,
       photocatalyst_loading_mol_percent REAL,
       irradiation_time_h REAL,
       degassing_method TEXT,
       cooling_method TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,

    `CREATE TABLE IF NOT EXISTS spectral_datasets (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       kind TEXT NOT NULL,
       sample_label TEXT,
       solvent TEXT,
       concentration TEXT,
       points TEXT NOT NULL,
       notes TEXT,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_spectra_kind ON spectral_datasets (kind, created_at DESC)`,

    // Rescue 的产出：假设与建议实验。建议实验落成草稿前先存在这里，
    // 它们是模型的推断，不是实验事实。
    `CREATE TABLE IF NOT EXISTS rescue_sessions (
       id TEXT PRIMARY KEY,
       experiment_id TEXT REFERENCES experiment_runs (id) ON DELETE SET NULL,
       question TEXT,
       context_snapshot TEXT,
       result TEXT,
       created_at TEXT NOT NULL
     )`,
  ],

  // v3 — 条件优化 campaign
  //
  // 变量与观测点用 JSON 存：它们的形状随 campaign 而变（这次筛三个变量、
  // 下次筛五个），拆成表反而要为每次查询做动态拼接。数据量也小，一个 campaign
  // 几十个点顶天了。
  [
    `CREATE TABLE IF NOT EXISTS optimization_campaigns (
       id TEXT PRIMARY KEY,
       project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
       reaction_id TEXT REFERENCES reactions (id) ON DELETE SET NULL,
       name TEXT NOT NULL,
       objective TEXT,
       variables TEXT NOT NULL,
       observations TEXT NOT NULL,
       budget INTEGER NOT NULL DEFAULT 4,
       status TEXT NOT NULL DEFAULT 'active',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_campaigns_status ON optimization_campaigns (status, updated_at DESC)`,
  ],
];
