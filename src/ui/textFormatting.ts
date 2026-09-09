const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
};

function scripted(value: string, alphabet: Record<string, string>): string {
  return [...value].map((character) => alphabet[character] ?? character).join("");
}

/** 把模型最常写的化学/计量 LaTeX 确定性地转成可读 Unicode。 */
export function readableMath(source: string): string {
  let value = source
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|ce)\{([^{}]*)\}/g, "$1")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1⁄$2")
    .replace(/\\(?:longrightarrow|rightarrow|to)\b/g, "→")
    .replace(/\\(?:longleftarrow|leftarrow)\b/g, "←")
    .replace(/\\(?:rightleftharpoons|leftrightharpoons)\b/g, "⇌")
    .replace(/\\times\b/g, "×")
    .replace(/\\cdot\b/g, "·")
    .replace(/\\pm\b/g, "±")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\leq\b/g, "≤")
    .replace(/\\geq\b/g, "≥")
    .replace(/\\neq\b/g, "≠")
    .replace(/\\degree\b|\^\{\\circ\}/g, "°")
    .replace(/\\Delta\b/g, "Δ")
    .replace(/\\alpha\b/g, "α")
    .replace(/\\beta\b/g, "β")
    .replace(/\\gamma\b/g, "γ")
    .replace(/\\lambda\b/g, "λ")
    .replace(/\\mu\b/g, "μ");

  value = value
    .replace(/_\{([^{}]+)\}/g, (_, body: string) => scripted(body, SUBSCRIPT))
    .replace(/\^\{([^{}]+)\}/g, (_, body: string) => scripted(body, SUPERSCRIPT))
    .replace(/_([0-9+-])/g, (_, body: string) => scripted(body, SUBSCRIPT))
    .replace(/\^([0-9+-])/g, (_, body: string) => scripted(body, SUPERSCRIPT))
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\%/g, "%");

  return value;
}
