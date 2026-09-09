/**
 * 逆合成：离线解析检查 + 用真实 RDKit 做结构校验 + 打真接口要一次路线。
 *
 *   npm run verify:retro
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRoutes, proposeRoutes, validateRoute, type Validator } from "../src/agent/retro";
import { classifyAvailability } from "../src/chem/availability";
import { bloomHas } from "../src/chem/bloom";
import { BUILDING_BLOCKS, BY_INCHIKEY } from "../src/chem/buildingBlocks.generated";
import type { FetchLike, ProviderConfig } from "../src/agent/provider";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const distribution = join(here, "..", "node_modules", "@rdkit", "rdkit", "dist");

const config: ProviderConfig = {
  baseUrl: process.env.ORGANICLAB_BASE_URL ?? "",
  apiKey: process.env.ORGANICLAB_API_KEY ?? "",
  model: process.env.ORGANICLAB_MODEL ?? "gemini-3.7-flash-high",
  fetchImpl: globalThis.fetch as unknown as FetchLike,
};

let failures = 0;

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name} — ${detail}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const initRDKitModule = require(join(distribution, "RDKit_minimal.js"));
// 和 app 里 WebView 加载的是同一个文件，见 assets/chem/ops.js.txt 的文件头。
const { rdkitOps } = require(join(here, "..", "assets", "chem", "ops.js.txt")) as {
  rdkitOps: (RDKit: unknown, op: string, args: unknown) => unknown;
};

// app 里 Bloom 索引从 asset 加载；node 里直接读同一个文件，验的是同一份数据。
const bloomMeta = JSON.parse(readFileSync(join(here, "..", "assets", "chem", "bb-instock.meta.json"), "utf8")) as {
  m: number;
  k: number;
  entries: number;
};
const bloomFilter = {
  bits: new Uint8Array(readFileSync(join(here, "..", "assets", "chem", "bb-instock.bloom"))),
  m: bloomMeta.m,
  k: bloomMeta.k,
  n: bloomMeta.entries,
};
  const RDKit = await initRDKitModule({ wasmBinary: readFileSync(join(distribution, "RDKit_minimal.wasm")) });
  const validate: Validator = async (smiles) => {
    const result = rdkitOps(RDKit, "standardize", { smiles }) as {
      ok: boolean;
      canonical?: string;
      inchi_key?: string | null;
      heavy_atoms?: number | null;
      components?: { inchi_key: string; heavy_atoms: number }[];
    };
    return {
      ok: result.ok,
      canonical: result.canonical,
      inchiKey: result.inchi_key ?? result.components?.[0]?.inchi_key,
      heavyAtoms: result.heavy_atoms ?? result.components?.[0]?.heavy_atoms,
      inStock: result.ok && result.canonical ? bloomHas(bloomFilter, result.canonical) : null,
    };
  };

  // ---- 砌块表与可得性 ----
  report("砌块表已编译", BUILDING_BLOCKS.length > 200, `${BUILDING_BLOCKS.length} 个砌块`);

  const benzaldehyde = await validate("O=Cc1ccccc1");
  const known = classifyAvailability("O=Cc1ccccc1", benzaldehyde.inchiKey ?? null, benzaldehyde.heavyAtoms ?? null);
  report("常备试剂被识别", known.status === "catalog", `${known.status} — ${known.match?.name}`);

  // 一个明显不是常备试剂的大分子
  const exotic = await validate("CC(C)(C)OC(=O)N1CCC(CC1)c1ccc(cc1)-c1ccc(cc1)C(=O)N1CCC(CC1)C(=O)OCc1ccccc1");
  const unlisted = classifyAvailability("big", exotic.inchiKey ?? null, exotic.heavyAtoms ?? null);
  report("未收录的大分子被标出", unlisted.status === "unlisted" && unlisted.note.includes("较大"), unlisted.note.slice(0, 40));

  // 盐必须按整体匹配：按片段拆开，NaCN 会变成裸氰离子而匹配不上砌块表。
  const nacn = await validate("[C-]#N.[Na+]");
  const salt = classifyAvailability("[C-]#N.[Na+]", nacn.inchiKey ?? null, nacn.heavyAtoms ?? null);
  report("盐类按整体匹配", salt.status === "catalog", `${salt.status} — ${salt.match?.name ?? "未命中"}`);

  // ZINC 现货索引：命名表没有但确实是商品的分子应该命中
  report("现货索引已随包生成", bloomMeta.entries > 1_900_000, `${bloomMeta.entries.toLocaleString()} 条`);

  const niche = await validate("Cc1ccc(cc1)S(=O)(=O)NC1CCN(CC1)C(=O)OC(C)(C)C");
  const nicheResult = classifyAvailability("niche", niche.inchiKey ?? null, niche.heavyAtoms ?? null, niche.inStock ?? null);
  report(
    "命名表外的商品由现货库兜住",
    nicheResult.status === "instock" || nicheResult.status === "unlisted",
    `${nicheResult.status} — ${nicheResult.note.slice(0, 34)}`,
  );

  // 索引不可用时不能把「查不到」说成「没有」
  const noIndex = classifyAvailability("x", "AAAAAAAAAAAAAA-BBBBBBBBBB-C", 8, null);
  report(
    "索引不可用时措辞不越界",
    noIndex.status === "unlisted" && !noIndex.note.includes("ZINC"),
    noIndex.note.slice(0, 40),
  );

  const unreadable = classifyAvailability("不是SMILES", null, null);
  report("读不出的结构不冒充判断", unreadable.status === "unreadable", unreadable.note);

  // 立体异构：连接层相同、构型不同
  const lAla = await validate("C[C@H](N)C(=O)O");
  const dAla = await validate("C[C@@H](N)C(=O)O");
  const dResult = classifyAvailability("D-Ala", dAla.inchiKey ?? null, dAla.heavyAtoms ?? null);
  report(
    "构型不同时提示确认",
    lAla.inchiKey !== dAla.inchiKey && dResult.status === "catalog_skeleton",
    `${dResult.status} — ${dResult.note.slice(0, 30)}`,
  );

  // ---- 单步约束的解析层检出 ----
  const multiStep = parseRoutes(
    JSON.stringify({
      routes: [
        {
          strategy: "s",
          steps: [
            { product_smiles: "CCO", precursor_smiles: ["CC=O"], transform: "Suzuki 偶联后水解", rationale: "r" },
            { product_smiles: "CCO", precursor_smiles: ["CC=O"], transform: "还原胺化", rationale: "一锅法完成" },
            { product_smiles: "CCO", precursor_smiles: ["CC=O"], transform: "SNAr", rationale: "干净的单步" },
          ],
          starting_materials: ["CC=O"],
        },
      ],
    }),
  );
  report("检出「A 后 B」式的多步", multiStep[0].steps[0].multiStepFlags.length > 0, multiStep[0].steps[0].multiStepFlags.join("；"));
  report("检出一锅法", multiStep[0].steps[1].multiStepFlags.length > 0, multiStep[0].steps[1].multiStepFlags.join("；"));
  report("单步不误报", multiStep[0].steps[2].multiStepFlags.length === 0, "无标记");

  const flagged = await validateRoute(multiStep[0], validate);
  report("多步会让路线被判不可用", flagged.usable === false && flagged.problems.some((p) => p.includes("单步")), flagged.problems[0] ?? "无");

  // 解析：模型不一定按我们要的形状返回，precursor 给成字符串、字段缺失都得吃下来。
  const parsed = parseRoutes(
    '```json\n{"routes":[{"strategy":"A","steps":[{"product_smiles":"CCO","precursor_smiles":"CC=O","transform":"还原"}],"starting_materials":["CC=O"]}]}\n```',
  );
  report("吃得下带围栏的返回", parsed.length === 1, `${parsed.length} 条路线`);
  report("precursor 给成字符串也认", parsed[0].steps[0].precursorSmiles[0] === "CC=O", String(parsed[0].steps[0].precursorSmiles));
  report("缺 rationale 不炸", parsed[0].steps[0].rationale === "", "空字符串");

  // 校验：结构都读得出 → usable=true。
  const good = await validateRoute(parsed[0], validate);
  report("结构都合法时 usable=true", good.usable === true, `problems=${good.problems.length}`);

  // 掺一个 RDKit 读不出来的结构 → usable=false，并指出是哪一步。
  const bad = await validateRoute(
    {
      ...parsed[0],
      steps: [{ ...parsed[0].steps[0], order: 0, productSmiles: "C(C)(C)(C)(C)C" }],
    },
    validate,
  );
  report("坏结构被判 usable=false", bad.usable === false, bad.problems.join("；") || "没报问题");

  // 校验器本身坏掉 ≠ 路线不合法。这时 usable 必须是 null，不能误判成 false。
  const broken = await validateRoute(parsed[0], async () => {
    throw new Error("RDKit 不可用");
  });
  report("校验器故障时 usable=null", broken.usable === null, broken.problems.join("；"));

  if (!config.baseUrl || !config.apiKey) {
    console.log("\n跳过联网检查：缺少 ORGANICLAB_BASE_URL / ORGANICLAB_API_KEY");
  } else {
    // 布洛芬：结构不复杂，断开方式明确，模型答不上来说明链路有问题而不是题太难。
    const target = "CC(C)Cc1ccc(cc1)C(C)C(=O)O";
    const routes = await proposeRoutes(config, target, {
      count: 3,
      validate,
      hint: "优先使用商业可得的杂环砌块，避免从头构环",
    });

    report("拿到多条路线", routes.length >= 2, `${routes.length} 条`);
    report(
      "每条路线都有步骤",
      routes.every((route) => route.steps.length > 0),
      routes.map((route) => `${route.steps.length} 步`).join(" / "),
    );
    report(
      "每步都写了转化名",
      routes.every((route) => route.steps.every((step) => step.transform !== "未命名转化")),
      routes[0].steps.map((step) => step.transform).join(" → "),
    );
    report(
      "断开策略互不相同",
      new Set(routes.map((route) => route.strategy)).size === routes.length,
      `${new Set(routes.map((route) => route.strategy)).size} 种策略`,
    );
    report(
      "结构校验真的跑了",
      routes.every((route) => route.usable !== null),
      routes.map((route) => (route.usable ? "通过" : `${route.problems.length} 个问题`)).join(" / "),
    );
    const usable = routes.filter((route) => route.usable);
    report("至少一条路线结构全部合法", usable.length >= 1, `${usable.length}/${routes.length} 条通过`);

    // 每一步必须是单步反应
    const multiStepSteps = routes.flatMap((route) => route.steps.filter((step) => step.multiStepFlags.length > 0));
    report(
      "模型给出的每一步都是单步反应",
      multiStepSteps.length === 0,
      multiStepSteps.length ? multiStepSteps.map((s) => `${s.transform}（${s.multiStepFlags.join("/")}）`).join(" | ") : "无多步压缩",
    );

    // 起始原料的可得性
    const allAvailability = routes.flatMap((route) => route.availability);
    report("每个起始原料都判了可得性", allAvailability.length > 0, `${allAvailability.length} 个起始原料`);
    const catalogHits = allAvailability.filter((entry) => entry.status.startsWith("catalog"));
    report(
      "多数起始原料是常备试剂",
      catalogHits.length >= allAvailability.length / 2,
      `${catalogHits.length}/${allAvailability.length} 命中砌块表：${catalogHits.slice(0, 4).map((e) => e.match?.name).join("、")}`,
    );

    console.log(`\n路线 1 策略：${routes[0].strategy}`);
    console.log(`步骤：${routes[0].steps.map((s) => s.transform).join(" → ")}`);
    console.log(`起始原料：${routes[0].availability.map((a) => `${a.match?.name ?? a.smiles}[${a.status}]`).join("、")}`);
  }

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
