#!/usr/bin/env node
/**
 * 把仓库根的 skills/ 编译进 app。
 *
 * 生成 TS 常量而不是把 .md 当 metro asset：省掉 metro 的 assetExts 配置，
 * 而且技能内容能被 tsc 检查到、打包后必定存在。技能改了就重跑 npm run sync-skills。
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = join(here, "..", "skills");
const outFile = join(here, "..", "src", "agent", "skills.generated.ts");

function parse(body, fallbackId) {
  // SKILL.md 带 YAML frontmatter，description 就是给模型看的技能摘要，
  // 直接拿来做工具/技能选择的依据，比从正文猜第一行准。
  const fence = body.match(/^---\n([\s\S]*?)\n---\n?/);
  const front = fence ? fence[1] : "";
  const field = (key) => {
    const hit = front.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return hit ? hit[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  const heading = body.match(/^#\s+(.+)$/m);
  return {
    title: heading ? heading[1].trim() : field("name") || fallbackId,
    summary: field("description"),
  };
}

const skills = [];
for (const entry of readdirSync(skillsRoot).sort()) {
  const file = join(skillsRoot, entry, "SKILL.md");
  try {
    if (!statSync(file).isFile()) continue;
  } catch {
    continue;
  }
  const body = readFileSync(file, "utf8");
  const { title, summary } = parse(body, entry);
  skills.push({ id: entry, title, summary, body });
}

if (skills.length === 0) {
  console.error(`没有在 ${skillsRoot} 找到任何 SKILL.md`);
  process.exit(1);
}

const lines = [
  "// 由 scripts/sync-skills.mjs 从仓库根的 skills/ 生成，不要手改。",
  "// 重新生成：npm run sync-skills",
  "",
  "export type Skill = {",
  "  id: string;",
  "  title: string;",
  "  summary: string;",
  "  body: string;",
  "};",
  "",
  "export const SKILLS: Skill[] = [",
];
for (const skill of skills) {
  lines.push("  {");
  lines.push(`    id: ${JSON.stringify(skill.id)},`);
  lines.push(`    title: ${JSON.stringify(skill.title)},`);
  lines.push(`    summary: ${JSON.stringify(skill.summary)},`);
  lines.push(`    body: ${JSON.stringify(skill.body)},`);
  lines.push("  },");
}
lines.push("];", "");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`已写入 ${skills.length} 个技能 → src/agent/skills.generated.ts`);
