import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getRoute, type SavedRouteDetail } from "../../src/db/repo/routes";
import { Structure } from "../../src/ui/Structure";
import { theme } from "../../src/ui/theme";

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [route, setRoute] = useState<SavedRouteDetail | null>(null);

  useEffect(() => {
    getRoute(id).then(setRoute);
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: "逆合成路线" });
  }, [navigation]);

  if (!route) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SAVED ROUTE · {route.stepCount} STEPS</Text>
        <Text style={styles.heroTitle}>{route.title ?? "逆合成路线"}</Text>
        <Structure smiles={route.targetSmiles} height={160} />
        <Text selectable style={styles.mono}>{route.targetSmiles}</Text>
      </View>

      {route.strategy ? (
        <View style={styles.strategyCard}>
          <Text style={styles.label}>断开策略</Text>
          <Text selectable style={styles.body}>{route.strategy}</Text>
        </View>
      ) : null}

      <View style={styles.disclaimer}><Ionicons name="information-circle-outline" size={16} color={theme.warning} /><Text style={styles.disclaimerText}>模型提出的假设路线。保存只是留档，不代表经过文献或实验验证。</Text></View>

      {route.steps.map((step) => (
        <View key={step.id} style={styles.stepRow}>
          <View style={styles.rail}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step.position + 1}</Text></View>
            {step.position < route.steps.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.step}>
            <Text style={styles.stepHead}>{step.transform ?? "未命名转化"}</Text>
            {step.reactionSmiles ? <Structure smiles={step.reactionSmiles} height={138} /> : null}
            {step.reagents ? <View style={styles.detail}><Text style={styles.detailLabel}>试剂 / 条件</Text><Text selectable style={styles.meta}>{step.reagents}</Text></View> : null}
            {step.rationale ? <View style={styles.detail}><Text style={styles.detailLabel}>断开依据</Text><Text selectable style={styles.body}>{step.rationale}</Text></View> : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  content: { padding: theme.space(4), gap: theme.space(4), paddingBottom: theme.space(12) },
  hero: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 22, padding: theme.space(4), gap: theme.space(2.5) },
  eyebrow: { color: theme.accent, fontSize: 9.5, fontWeight: "700", letterSpacing: 1.2 },
  heroTitle: { color: theme.text, fontSize: 22, fontWeight: "600" },
  label: { color: theme.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  mono: { color: theme.text, fontSize: 11.5, fontFamily: "Menlo" },
  body: { color: theme.text, fontSize: 14, lineHeight: 21 },
  meta: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
  strategyCard: { gap: theme.space(1.5), paddingHorizontal: theme.space(1) },
  disclaimer: { flexDirection: "row", gap: theme.space(2), alignItems: "flex-start", backgroundColor: theme.warningSoft, padding: theme.space(3), borderRadius: 14 },
  disclaimerText: { color: theme.warning, fontSize: 11.5, lineHeight: 17, flex: 1 },
  stepRow: { flexDirection: "row", alignItems: "stretch", gap: theme.space(2.5) },
  rail: { width: 27, alignItems: "center" },
  stepNumber: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentDim },
  stepNumberText: { color: theme.accent, fontSize: 11.5, fontWeight: "800" },
  line: { width: 1, backgroundColor: theme.borderStrong, flex: 1 },
  step: {
    flex: 1,
    gap: theme.space(1.5),
    paddingBottom: theme.space(5),
  },
  stepHead: { color: theme.text, fontSize: 15, fontWeight: "700" },
  detail: { gap: 3, marginTop: theme.space(1) },
  detailLabel: { color: theme.textFaint, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
});
