/**
 * 逆合成路线提议。
 *
 * 模型给策略，RDKit 给判断。技能文档里那句"这是假设，不是文献路线"是这里的前提：
 * 我们不查文献、不查先例，返回的每条路线都只是提案，UI 上必须写明这一点。
 *
 * 每一步的结构都要过 RDKit。读不出结构的路线标成 usable=false——它画不出图、
 * 比不了相似度，往下用只会把错误传下去。校验函数是注入的：app 里走 WebView 桥，
 * 测试里直接接真实的 RDKit，两边跑的是同一套判定。
 */

import { chat, type ProviderConfig } from "./provider";
import { classifyAvailability, type Availability } from "../chem/availability";
import { catalogDigest } from "../chem/buildingBlocks.generated";

export type RetroStep = {
  order: number;
  productSmiles: string;
  precursorSmiles: string[];
  reactionSmiles: string | null;
  transform: string;
  reagents: string | null;
  rationale: string;
  /** 这一步看起来像是把多步压成了一步。空数组表示没发现问题。 */
  multiStepFlags: string[];
};

export type RetroRoute = {
  strategy: string;
  steps: RetroStep[];
  startingMaterials: string[];
  /** 全部结构都被 RDKit 读得出来才为 true。校验没跑成时为 null。 */
  usable: boolean | null;
  problems: string[];
  /** 每个起始原料的可得性。校验没跑成时为空数组。 */
  availability: Availability[];
};

export type Validator = (smiles: string) => Promise<{
  ok: boolean;
  canonical?: string;
  inchiKey?: string;
  heavyAtoms?: number;
  inStock?: boolean | null;
  error?: string;
}>;

/**
 * 合成经验。这一段是课题组给定的，**原封不动**放进提示词。
 * 改动前先确认是否得到授权——它代表的是人的判断，不是可以随手调的参数。
 */
const SYNTHESIS_EXPERIENCE = `合成经验

1. 优先选择能够在单步操作中最大化结构简化的战略性断键，同时在激进的汇聚策略与试剂稳定性、中间体稳健性以及反应表现的可重复性之间取得平衡。
2. 在线性步骤经济性与反应可靠性之间取得平衡，优先采用可靠的经典增碳反应、缩合反应以及可预测的碳–碳键构建，而不是在复杂骨架上依赖推测性的"一锅法"转化。
3. 通过将复杂性分散到平行分支中来最小化最长线性合成序列，确保低收率步骤、劳动密集型纯化以及精细调整都在汇聚偶联之前于早期片段上完成。
4. 将逆合成断键建立在易于获得、预先官能团化的商业砌块和商品化杂环之上，避免不必要的从头核心骨架合成，或从基础化工原料出发、会显著增加步骤数的制备过程。
5. 务实地使用保护基：当多官能团胺、酚和多元醇存在竞争性交叉反应或催化剂中毒风险时，应尽早进行保护，同时避免既冒险地在未保护状态下反应，也避免冗余的保护–脱保护循环。
6. 务实地评估后续步骤中的化学选择性和官能团兼容性，避免因过度保守而推迟杂环基团的引入；如果标准偶联条件本身能够耐受这些基团，就不应因此被迫采用低效、非汇聚式的线性连接方式。
7. 使用手性池前体、生物催化或不对称催化高效建立立体中心；当过早引入手性中心会迫使敏感官能团经历漫长且不必要的合成序列时，可利用可靠的后期催化不对称转化，例如不对称转移氢化或立体选择性酮还原。
8. 充分利用经典极性断键，例如在缺电子或被活化的卤代（杂）芳烃上进行亲核芳香取代反应（SNAr），将其作为直接、温和且无需过渡金属的交叉偶联替代方案，尤其适用于干净地构建芳基–氮键和芳基–氧键。
9. 优先采购已经组装完成且商业化官能团化的杂环和双环核心，而不是进行漫长的从头多步环化级联反应；只有当所需取代模式无法通过商品化前体获得时，才采用从头成环构建。
10. 当直接杂芳基 C–H 官能团化和氧化偶联能够避免制备、纯化和储存不稳定的有机硼酸酯、有机锡或有机锌中间体时，应优先采用这些方法。
11. 对多卤代杂芳烃上的交叉偶联进行顺序设计时，应首先在温和条件下利用其内在的电子效应和位阻差异实现选择性，之后再考虑使用催化剂/配体控制或导向基策略。
12. 对危险、有毒或热不稳定的中间体，应原位生成或直接串联进入后续步骤而不进行分离，并通过受控加料和维持较低的稳态浓度来降低失控反应风险。
13. 通过选择与目标核心所需氧化态相匹配的起始原料来最大化氧化还原经济性，严格避免迂回的多步氧化还原级联过程，例如"羧酸→醇→卤代物"的路线，而应优先采用直接官能团化或具有合适氧化态的商业前体。
14. 只有当单官能团化中间体能够与未反应原料及双取代产物实现干净分离时，才对对称双官能团底物采用动力学或统计控制的单官能团化；否则，应采用去对称化策略或预先差异化的前体。
15. 对彼此兼容的连续步骤进行串联而不进行中间后处理，以最大化整体通量，同时有意识地在可结晶阶段安排独立分离，以清除累积的工艺杂质。
16. 只有在确有证据表明会发生竞争性交叉反应或严重催化剂失活时，才使用适当的非亲核性前体，例如叠氮基、硝基或氨基甲酸酯，对碱性氮和强配位杂原子进行掩蔽，避免制造不必要的后期官能团化瓶颈。`;

const PROMPT = (target: string, count: number, hint: string | null) =>
  [
    `为下面这个目标分子提出 ${count} 条**断开策略不同**的逆合成路线。`,
    "",
    `目标：${target}`,
    hint ? `\n研究者的补充要求（请务必纳入考虑）：${hint}` : "",
    "",
    SYNTHESIS_EXPERIENCE,
    "",
    "## 硬性约束",
    "",
    "**一、每一步必须是单步反应。**",
    "一个 step 代表一次实验操作、一套反应条件、一个可分离的产物。不允许把多步压缩进一个 step：",
    "- 不能写「偶联后水解再脱保护」——那是三步，要拆成三个 step；",
    "- 不能用「一锅法」「串联」「级联」「one-pot」把多次转化合并；",
    "- transform 字段只能是一个反应名（如 Suzuki 偶联、还原胺化、SNAr、Boc 脱保护），不能是复合描述。",
    "唯一例外是工业上确实作为单一操作进行、中间体不分离的标准过程（如还原胺化的亚胺原位生成），",
    "这种情况要在 rationale 里说明为什么算一步。",
    "",
    "**二、终点前体必须真的能买到。**",
    "starting_materials 里的每个结构都应该是目录级常备试剂或商品化砌块。",
    "如果拆到某个结构你不确定能否买到，就继续往回拆，或者换一条路线。",
    "宁可多一步用便宜易得的原料，也不要少一步用买不到的中间体。",
    "",
    "下面是本实验室认可的常备砌块清单（名称 + 规范 SMILES）。",
    "**优先把路线拆到这张表里的试剂上**；用表外的原料时，要确保它确实是常见商品，",
    "并在 rationale 里说明为什么选它。",
    "",
    catalogDigest(),
    "",
    "## 输出格式",
    "",
    "输出严格 JSON，不要解释文字：",
    "{",
    '  "routes": [{',
    '    "strategy": "这条路线的断开思路，一两句",',
    '    "steps": [{',
    '      "product_smiles": "这一步做出来的东西",',
    '      "precursor_smiles": ["这一步的原料，可多个"],',
    '      "reaction_smiles": "precursors>>product",',
    '      "transform": "单个反应名",',
    '      "reagents": "关键试剂与条件，没有把握就填 null",',
    '      "rationale": "为什么这样断"',
    "    }],",
    '    "starting_materials": ["叶子节点 SMILES，必须是可买到的"]',
    "  }]",
    "}",
    "",
    "## 其他规则",
    "",
    "- steps 按**正向合成顺序**排列：第一步用起始原料，最后一步得到目标分子。",
    "- 所有结构写成 SMILES。写不出正确 SMILES 的中间体，宁可换一条路线。",
    "- **不要编产率、时间、温度。** reagents 里只写你有把握的试剂名，没把握就填 null。",
    "- 不要声称有文献先例——你没有查过文献。",
    "- 只输出 JSON。",
  ]
    .filter(Boolean)
    .join("\n");

function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 检出被压缩进单个 step 的多步序列。
 *
 * 这类问题模型很容易犯：写一个 step 说"偶联后水解再脱保护"，看起来路线更短，
 * 实际做起来是三次操作三次纯化。纯文本判据抓不全，但常见写法都能拦下来。
 */
const MULTI_STEP_MARKERS: { pattern: RegExp; label: string }[] = [
  { pattern: /一锅|一鍋|one[- ]?pot/i, label: "写成了一锅法" },
  { pattern: /串联|級联|级联|cascade|tandem|domino/i, label: "写成了串联/级联" },
  { pattern: /然后|接着|随后|再(?:进行|经|用|以)|之后再|followed by|then\s/i, label: "描述里出现了先后次序" },
  // "Suzuki 偶联后水解" 这类写法：一个"后"字把两次转化连在一起。
  {
    pattern:
      /后(?:再)?(?:进行|经|用|以)?(?:水解|脱保护|脱除|还原|氧化|环化|缩合|偶联|酯化|酰化|烷基化|脱水|重排|开环|关环|成盐|中和|皂化)/,
    label: "把两次转化用「后」连在了一起",
  },
  { pattern: /[，,、]\s*(?:并|同时)(?:进行|完成)/, label: "一步里并列了多个转化" },
];

function detectMultiStep(transform: string, rationale: string): string[] {
  const flags: string[] = [];
  // transform 里出现连接词几乎肯定是多步；rationale 里可能只是在解释，判据放宽一点。
  for (const marker of MULTI_STEP_MARKERS) {
    if (marker.pattern.test(transform)) flags.push(`转化名${marker.label}`);
  }
  if (/一锅|one[- ]?pot|串联|级联|cascade/i.test(rationale) && flags.length === 0) {
    flags.push("说明里提到一锅/串联");
  }
  // "A 偶联 + B 脱保护" 这种并列写法
  if (/[+＋]|\/|、/.test(transform) && transform.length > 8) {
    flags.push("转化名像是并列了多个反应");
  }
  return flags;
}

function asSmilesList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter((entry): entry is string => Boolean(entry));
  const single = asText(value);
  return single ? [single] : [];
}

export function parseRoutes(raw: string): RetroRoute[] {
  const parsed = JSON.parse(stripFence(raw)) as { routes?: unknown };
  const routes = Array.isArray(parsed.routes) ? parsed.routes : [];

  return routes.map((entry): RetroRoute => {
    const route = (entry ?? {}) as Record<string, unknown>;
    const steps = Array.isArray(route.steps) ? route.steps : [];
    return {
      strategy: asText(route.strategy) ?? "未说明策略",
      steps: steps.map((rawStep, index): RetroStep => {
        const step = (rawStep ?? {}) as Record<string, unknown>;
        return {
          order: index,
          productSmiles: asText(step.product_smiles) ?? "",
          precursorSmiles: asSmilesList(step.precursor_smiles),
          reactionSmiles: asText(step.reaction_smiles),
          transform: asText(step.transform) ?? "未命名转化",
          reagents: asText(step.reagents),
          rationale: asText(step.rationale) ?? "",
          multiStepFlags: detectMultiStep(asText(step.transform) ?? "", asText(step.rationale) ?? ""),
        };
      }),
      startingMaterials: asSmilesList(route.starting_materials),
      usable: null,
      problems: [],
      availability: [],
    };
  });
}

/** 用 RDKit 逐个结构校验，填上 usable 与 problems。校验器本身跑不了时 usable 保持 null。 */
export async function validateRoute(route: RetroRoute, validate: Validator): Promise<RetroRoute> {
  const problems: string[] = [];
  const seen = new Set<string>();
  const availability: Availability[] = [];

  for (const step of route.steps) {
    const candidates = [step.productSmiles, ...step.precursorSmiles].filter(Boolean);
    if (candidates.length === 0) {
      problems.push(`第 ${step.order + 1} 步没有给出结构`);
      continue;
    }
    for (const smiles of candidates) {
      if (seen.has(smiles)) continue;
      seen.add(smiles);
      try {
        const result = await validate(smiles);
        if (!result.ok) problems.push(`第 ${step.order + 1} 步的 ${smiles} 读不出来`);
      } catch (error) {
        // 校验器坏了和"结构不合法"是两回事，别把路线判死。
        return {
          ...route,
          usable: null,
          problems: [`结构校验没能运行：${error instanceof Error ? error.message : String(error)}`],
        };
      }
    }
  }

  // 起始原料的可得性：拆到买不到的东西上，路线再漂亮也做不了。
  for (const smiles of route.startingMaterials) {
    try {
      const result = await validate(smiles);
      availability.push(
        classifyAvailability(
          smiles,
          result.ok ? (result.inchiKey ?? null) : null,
          result.heavyAtoms ?? null,
          result.inStock ?? null,
        ),
      );
    } catch (error) {
      return {
        ...route,
        usable: null,
        problems: [`结构校验没能运行：${error instanceof Error ? error.message : String(error)}`],
        availability: [],
      };
    }
  }

  for (const step of route.steps) {
    for (const flag of step.multiStepFlags) {
      problems.push(`第 ${step.order + 1} 步可能不是单步反应：${flag}`);
    }
  }

  if (route.steps.length === 0) problems.push("这条路线没有任何步骤");
  return { ...route, usable: problems.length === 0, problems, availability };
}

export async function proposeRoutes(
  config: ProviderConfig,
  target: string,
  options: { count?: number; validate?: Validator; hint?: string | null } = {},
): Promise<RetroRoute[]> {
  const count = options.count ?? 3;
  const hint = options.hint?.trim() || null;
  const completion = await chat(config, {
    messages: [{ role: "user", content: PROMPT(target, count, hint) }],
  });

  if (!completion.content.trim()) throw new Error("模型没有返回内容");
  let routes: RetroRoute[];
  try {
    routes = parseRoutes(completion.content);
  } catch {
    throw new Error(`模型返回的不是合法 JSON：${completion.content.slice(0, 120)}`);
  }
  if (routes.length === 0) throw new Error("模型没有给出任何路线");

  if (!options.validate) return routes;
  const validator = options.validate;
  return Promise.all(routes.map((route) => validateRoute(route, validator)));
}
