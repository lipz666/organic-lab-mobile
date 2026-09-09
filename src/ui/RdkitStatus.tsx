import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { rdkitBridge } from "../chem/bridge";
import { theme } from "./theme";

/**
 * 设置页里的 RDKit 状态。
 *
 * 结构工具坏掉时的表现是"降级成语法检查"，从聊天记录里不容易一眼看出根因。
 * 把状态直接摆出来，排查时不用靠猜。
 */
export function RdkitStatus() {
  const [, force] = useState(0);

  useEffect(() => rdkitBridge.subscribe(() => force((n) => n + 1)), []);

  const status = rdkitBridge.status;
  const label =
    status === "ready"
      ? `已就绪 ${rdkitBridge.rdkitVersion ?? ""}`
      : status === "loading"
        ? "加载中…"
        : "不可用";
  const tone = status === "ready" ? theme.success : status === "loading" ? theme.textDim : theme.danger;

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.label}>结构引擎（RDKit）</Text>
        <Text style={[styles.value, { color: tone }]}>{label}</Text>
      </View>
      <Text style={styles.hint}>
        {status === "ready"
          ? "标准化、结构图、相似度都可用。"
          : status === "loading"
            ? "首次启动要解压约 7MB 的模块，稍等。"
            : rdkitBridge.failureReason ??
              "结构相关功能会退回语法检查，画不出结构图。把这行报错发给开发者。"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: theme.space(1.5),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: theme.space(4),
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(3) },
  label: { color: theme.text, fontSize: 14, fontWeight: "600" },
  value: { fontSize: 13 },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
});
