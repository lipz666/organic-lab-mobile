import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useSettings } from "../config/SettingsContext";
import { theme } from "./theme";

/** M1–M4 之前的占位屏。同时承担“还没配 API 就先去设置”的引导。 */
export function Placeholder({ title, body, milestone }: { title: string; body: string; milestone: string }) {
  const { configured } = useSettings();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Text style={styles.milestone}>{milestone}</Text>
      {!configured && (
        <Link href="/settings" style={styles.link}>
          还没填 API 信息，先去设置 →
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: theme.space(6), justifyContent: "center", gap: theme.space(3) },
  title: { color: theme.text, fontSize: 18, fontWeight: "700" },
  body: { color: theme.textDim, fontSize: 14, lineHeight: 21 },
  milestone: { color: theme.accent, fontSize: 12, fontFamily: "Menlo" },
  link: { color: theme.accent, fontSize: 14, marginTop: theme.space(2) },
});
