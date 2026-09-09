import { StyleSheet, Text, TextInput, View } from "react-native";

import { theme } from "./theme";

/**
 * 确认页的字段控件。
 *
 * 空字段显示成"未填写"而不是留白：**照片上没写就是没写**，这个状态要看得见，
 * 不能让人以为是抽取漏了。
 */

export function TextField({
  label,
  value,
  onChange,
  placeholder = "未填写",
  multiline,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value ?? ""}
        onChangeText={(text) => onChange(text.trim() ? text : null)}
        placeholder={placeholder}
        placeholderTextColor={theme.textDim}
        multiline={multiline}
      />
    </View>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  unit?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value === null ? "" : String(value)}
        onChangeText={(text) => {
          const trimmed = text.trim();
          if (!trimmed) return onChange(null);
          const parsed = Number(trimmed);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
        placeholder="未填写"
        placeholderTextColor={theme.textDim}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  field: { gap: theme.space(1.5), flex: 1, minWidth: 130 },
  label: { color: theme.textDim, fontSize: 12 },
  unit: { color: theme.textDim, fontSize: 11 },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    fontSize: 15,
  },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  section: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: theme.space(3),
    marginBottom: theme.space(1),
  },
});
