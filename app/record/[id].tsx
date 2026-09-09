import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { getExperiment, type ExperimentDetail } from "../../src/db/repo/experiments";
import { theme } from "../../src/ui/theme";

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);

  useEffect(() => {
    getExperiment(id).then(setDetail);
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: detail?.code ?? "实验记录" });
  }, [navigation, detail]);

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const conditions = [
    detail.solvent && `溶剂 ${detail.solvent}${detail.solventVolumeMl ? ` ${detail.solventVolumeMl} mL` : ""}`,
    detail.temperatureC !== null && `${detail.temperatureC} °C`,
    detail.durationHours !== null && `${detail.durationHours} h`,
    detail.atmosphere,
    detail.lightSource &&
      [detail.lightSource, detail.wavelengthNm && `${detail.wavelengthNm} nm`, detail.powerW && `${detail.powerW} W`, detail.distanceCm && `${detail.distanceCm} cm`]
        .filter(Boolean)
        .join(" · "),
  ].filter(Boolean) as string[];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.badgeRow}>
        <Text style={[styles.badge, detail.status === "committed" ? styles.badgeOk : styles.badgeDraft]}>
          {detail.status === "committed" ? "已确认入库" : detail.status === "draft" ? "草稿" : "已被取代"}
        </Text>
        {detail.source === "vision" && <Text style={styles.badge}>由照片识读</Text>}
      </View>

      {detail.title ? <Text style={styles.title}>{detail.title}</Text> : null}
      {detail.purpose ? <Text style={styles.purpose}>{detail.purpose}</Text> : null}
      {detail.performedOn ? <Text style={styles.meta}>{detail.performedOn}</Text> : null}

      {detail.reactionSmiles ? (
        <>
          <Text style={styles.section}>反应</Text>
          <Text style={styles.mono}>{detail.reactionSmiles}</Text>
        </>
      ) : null}

      {detail.materials.length > 0 && (
        <>
          <Text style={styles.section}>投料</Text>
          {detail.materials.map((material) => (
            <View key={material.id} style={styles.line}>
              <Text style={styles.lineName}>{material.name}</Text>
              <Text style={styles.lineValue}>
                {[
                  material.amount !== null && `${material.amount}${material.unit ? ` ${material.unit}` : ""}`,
                  material.equivalents !== null && `${material.equivalents} equiv`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "未填写"}
              </Text>
            </View>
          ))}
        </>
      )}

      {conditions.length > 0 && (
        <>
          <Text style={styles.section}>条件</Text>
          {conditions.map((entry) => (
            <Text key={entry} style={styles.body}>
              {entry}
            </Text>
          ))}
        </>
      )}

      {(detail.yieldPercent !== null || detail.productMassMg !== null) && (
        <>
          <Text style={styles.section}>结果</Text>
          <Text style={styles.body}>
            {[
              detail.yieldPercent !== null && `产率 ${detail.yieldPercent}%`,
              detail.productMassMg !== null && `产物 ${detail.productMassMg} mg`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </>
      )}

      {detail.observations.length > 0 && (
        <>
          <Text style={styles.section}>观察</Text>
          {detail.observations.map((observation) => (
            <Text key={observation.id} style={styles.body}>
              · {observation.body}
            </Text>
          ))}
        </>
      )}

      {detail.notes ? (
        <>
          <Text style={styles.section}>备注</Text>
          <Text style={styles.body}>{detail.notes}</Text>
        </>
      ) : null}

      {detail.attachments.map((attachment) => (
        <Image key={attachment.id} source={{ uri: attachment.uri }} style={styles.photo} contentFit="contain" />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  content: { padding: theme.space(4), gap: theme.space(2), paddingBottom: theme.space(10) },
  badgeRow: { flexDirection: "row", gap: theme.space(2) },
  badge: {
    color: theme.textDim,
    fontSize: 11,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: theme.space(2.5),
    paddingVertical: theme.space(1),
    overflow: "hidden",
  },
  badgeOk: { color: theme.success, borderColor: theme.success },
  badgeDraft: { color: theme.accent, borderColor: theme.accent },
  title: { color: theme.text, fontSize: 19, fontWeight: "700", marginTop: theme.space(1) },
  purpose: { color: theme.text, fontSize: 15, lineHeight: 22 },
  meta: { color: theme.textDim, fontSize: 13 },
  section: { color: theme.text, fontSize: 14, fontWeight: "700", marginTop: theme.space(3) },
  body: { color: theme.text, fontSize: 14, lineHeight: 21 },
  mono: { color: theme.text, fontSize: 13, fontFamily: "Menlo" },
  line: { flexDirection: "row", justifyContent: "space-between", gap: theme.space(3) },
  lineName: { color: theme.text, fontSize: 14, flex: 1 },
  lineValue: { color: theme.textDim, fontSize: 14 },
  photo: { width: "100%", height: 240, borderRadius: theme.radius, marginTop: theme.space(3), backgroundColor: theme.surface },
});
