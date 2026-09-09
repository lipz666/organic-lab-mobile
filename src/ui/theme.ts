/**
 * Claude 风格的暖色浅色主题：纸张色背景、低对比边界和赤陶强调色。
 * 化学结构仍绘制在纯白纸面上，避免 RDKit 的黑色键线被染色。
 */
export const theme = {
  bg: "#faf9f5",
  surface: "#fffefa",
  surfaceAlt: "#f1efe8",
  surfaceStrong: "#e9e5dc",
  border: "#dedbd2",
  borderStrong: "#c9c4b8",
  text: "#171716",
  textDim: "#706e67",
  textFaint: "#9a978e",
  accent: "#c96545",
  accentPressed: "#ad5034",
  accentDim: "#f2dfd4",
  onAccent: "#fffaf5",
  danger: "#a84442",
  dangerSoft: "#f8e8e5",
  success: "#3f7555",
  successSoft: "#e4efe7",
  warning: "#9a641f",
  warningSoft: "#f5ead7",
  codeBg: "#242320",
  codeText: "#f5f0e7",
  radius: 16,
  space: (n: number) => n * 4,
} as const;
