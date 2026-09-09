import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";

import { theme } from "./theme";

/** 功能模块页的统一外壳：标题栏 + 一句话说明 + 内容区。 */
export function ModuleShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {lead ? <Text style={styles.lead}>{lead}</Text> : null}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** 内容分块。模块页普遍很长，靠这个把结构切清楚。 */
export function Block({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      {title ? (
        <View style={styles.blockHead}>
          <Text style={styles.blockTitle}>{title}</Text>
          {hint ? <Text style={styles.blockHint}>{hint}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * 把 **强调** 渲染成粗体。
 *
 * 这些文案来自计算模块的 warnings，那边用 Markdown 强调标记写重点。
 * 不处理的话屏幕上会直接出现字面的星号。
 */
export function Emphasized({ text, style }: { text: string; style?: TextStyle }) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {segments.map((segment, index) =>
        segment.startsWith("**") && segment.endsWith("**") ? (
          <Text key={index} style={styles.strong}>
            {segment.slice(2, -2)}
          </Text>
        ) : (
          segment
        ),
      )}
    </Text>
  );
}

/** 警告条。光化学里很多结论有边界，这些边界必须看得见。 */
export function Caution({ items, tone = "warning" }: { items: string[]; tone?: "warning" | "danger" | "neutral" }) {
  if (items.length === 0) return null;
  const palette =
    tone === "danger"
      ? { bg: theme.dangerSoft, text: theme.danger }
      : tone === "neutral"
        ? { bg: theme.surfaceAlt, text: theme.textDim }
        : { bg: theme.warningSoft, text: theme.warning };

  return (
    <View style={[styles.caution, { backgroundColor: palette.bg }]}>
      {items.map((item, index) => (
        <Emphasized key={index} text={item} style={{ ...styles.cautionText, color: palette.text }} />
      ))}
    </View>
  );
}

/** 一个带单位的读数。用于展示确定性计算的结果。 */
export function Readout({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <View style={styles.readoutValueRow}>
        <Text style={styles.readoutValue}>{value}</Text>
        {unit ? <Text style={styles.readoutUnit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.readoutHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.space(4), paddingBottom: theme.space(10), gap: theme.space(4) },
  lead: { color: theme.textDim, fontSize: 13, lineHeight: 20 },
  block: { gap: theme.space(2.5) },
  blockHead: { flexDirection: "row", alignItems: "baseline", gap: theme.space(2) },
  blockTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
  blockHint: { color: theme.textFaint, fontSize: 11, flex: 1 },
  caution: { borderRadius: theme.radius, padding: theme.space(3), gap: theme.space(1.5) },
  cautionText: { fontSize: 12, lineHeight: 18 },
  readout: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(1),
    flexGrow: 1,
    flexBasis: 150,
  },
  readoutLabel: { color: theme.textDim, fontSize: 11 },
  readoutValueRow: { flexDirection: "row", alignItems: "baseline", gap: theme.space(1) },
  readoutValue: { color: theme.text, fontSize: 19, fontWeight: "600" },
  readoutUnit: { color: theme.textDim, fontSize: 12 },
  readoutHint: { color: theme.textFaint, fontSize: 10.5, lineHeight: 15 },
  strong: { fontWeight: "700" },
});
