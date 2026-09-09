import { Fragment, type ReactNode } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { theme } from "./theme";
import { readableMath } from "./textFormatting";

type Block =
  | { kind: "paragraph"; value: string }
  | { kind: "heading"; level: number; value: string }
  | { kind: "quote"; value: string }
  | { kind: "list"; ordered: boolean; values: string[] }
  | { kind: "code"; language: string; value: string }
  | { kind: "rule" }
  | { kind: "table"; rows: string[][] };

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function blocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const result: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) content.push(lines[index++]);
      index += 1;
      result.push({ kind: "code", language, value: content.join("\n") });
      continue;
    }
    if (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1])) {
      const rows = [tableCells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index++]));
      }
      result.push({ kind: "table", rows });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      result.push({ kind: "heading", level: heading[1].length, value: heading[2] });
      index += 1;
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      result.push({ kind: "rule" });
      index += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const values: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        values.push(lines[index++].replace(/^\s*>\s?/, ""));
      }
      result.push({ kind: "quote", value: values.join("\n") });
      continue;
    }
    const list = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[2]);
      const values: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
        if (!match || Boolean(match[2]) !== ordered) break;
        values.push(match[3]);
        index += 1;
      }
      result.push({ kind: "list", ordered, values });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```|^(#{1,4})\s+|^\s*>\s?|^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index]) &&
      !(index + 1 < lines.length && lines[index].includes("|") && isTableSeparator(lines[index + 1]))
    ) {
      paragraph.push(lines[index++]);
    }
    result.push({ kind: "paragraph", value: paragraph.join("\n") });
  }
  return result;
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

function Inline({ value }: { value: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(value))) {
    if (match.index > cursor) nodes.push(readableMath(value.slice(cursor, match.index)));
    const token = match[0];
    const key = `${match.index}-${token.slice(0, 8)}`;
    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<Text key={key} style={styles.bold}>{readableMath(token.slice(2, -2))}</Text>);
    } else if (token.startsWith("`")) {
      nodes.push(<Text key={key} style={styles.inlineCode}>{token.slice(1, -1)}</Text>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <Text key={key} style={styles.link} onPress={() => link && void Linking.openURL(link[2])}>
          {link?.[1] ?? token}
        </Text>,
      );
    } else {
      nodes.push(<Text key={key} style={styles.italic}>{readableMath(token.slice(1, -1))}</Text>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < value.length) nodes.push(readableMath(value.slice(cursor)));
  return <>{nodes}</>;
}

export function RichText({ text }: { text: string }) {
  return (
    <View style={styles.root}>
      {blocks(text).map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "code") {
          return (
            <View key={key} style={styles.codeBox}>
              {block.language ? <Text style={styles.codeLanguage}>{block.language}</Text> : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text selectable style={styles.code}>{block.value}</Text>
              </ScrollView>
            </View>
          );
        }
        if (block.kind === "heading") {
          return <Text selectable key={key} style={[styles.text, styles.heading, block.level > 2 && styles.smallHeading]}><Inline value={block.value} /></Text>;
        }
        if (block.kind === "quote") {
          return <View key={key} style={styles.quote}><Text selectable style={[styles.text, styles.quoteText]}><Inline value={block.value} /></Text></View>;
        }
        if (block.kind === "list") {
          return (
            <View key={key} style={styles.list}>
              {block.values.map((value, itemIndex) => (
                <View key={itemIndex} style={styles.listRow}>
                  <Text style={styles.marker}>{block.ordered ? `${itemIndex + 1}.` : "•"}</Text>
                  <Text selectable style={[styles.text, styles.listText]}><Inline value={value} /></Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.kind === "rule") return <View key={key} style={styles.rule} />;
        if (block.kind === "table") {
          return (
            <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={styles.table}>
                {block.rows.map((row, rowIndex) => (
                  <View key={rowIndex} style={[styles.tableRow, rowIndex === 0 && styles.tableHead]}>
                    {row.map((cell, cellIndex) => (
                      <Text selectable key={cellIndex} style={[styles.tableCell, rowIndex === 0 && styles.bold]}>
                        <Inline value={cell} />
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        return <Text selectable key={key} style={styles.text}><Inline value={block.value} /></Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: theme.space(2.5) },
  text: { color: theme.text, fontSize: 15.5, lineHeight: 24 },
  bold: { fontWeight: "700", color: theme.text },
  italic: { fontStyle: "italic" },
  link: { color: theme.accent, textDecorationLine: "underline" },
  inlineCode: {
    color: theme.codeText,
    backgroundColor: theme.codeBg,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13.5,
  },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: "700", marginTop: theme.space(1) },
  smallHeading: { fontSize: 16.5, lineHeight: 23 },
  quote: { borderLeftWidth: 3, borderLeftColor: theme.accent, paddingLeft: theme.space(3) },
  quoteText: { color: theme.textDim, fontStyle: "italic" },
  list: { gap: theme.space(1.25) },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.space(2) },
  marker: { width: 20, color: theme.accent, fontSize: 15, lineHeight: 24, textAlign: "right" },
  listText: { flex: 1 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: theme.space(1) },
  codeBox: { backgroundColor: theme.codeBg, borderRadius: 12, padding: theme.space(3), gap: theme.space(1) },
  codeLanguage: { color: theme.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 },
  code: { color: theme.codeText, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12.5, lineHeight: 19 },
  tableScroll: { borderWidth: 1, borderColor: theme.border, borderRadius: 12 },
  table: { minWidth: 300 },
  tableRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
  tableHead: { backgroundColor: theme.surfaceAlt, borderTopWidth: 0 },
  tableCell: { minWidth: 120, maxWidth: 220, color: theme.text, fontSize: 13, lineHeight: 19, padding: theme.space(2.5) },
});
