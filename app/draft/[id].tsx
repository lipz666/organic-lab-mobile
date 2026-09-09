import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  commitDraft,
  getExperiment,
  updateDraft,
  type DraftInput,
  type ExperimentDetail,
} from "../../src/db/repo/experiments";
import { NumberField, SectionTitle, TextField } from "../../src/ui/fields";
import { theme } from "../../src/ui/theme";

type Editable = DraftInput & { materials: NonNullable<DraftInput["materials"]>; observations: string[] };

function toEditable(detail: ExperimentDetail): Editable {
  return {
    code: detail.code,
    title: detail.title,
    purpose: detail.purpose,
    performedOn: detail.performedOn,
    reactionSmiles: detail.reactionSmiles,
    solvent: detail.solvent,
    solventVolumeMl: detail.solventVolumeMl,
    temperatureC: detail.temperatureC,
    durationHours: detail.durationHours,
    atmosphere: detail.atmosphere,
    lightSource: detail.lightSource,
    wavelengthNm: detail.wavelengthNm,
    powerW: detail.powerW,
    distanceCm: detail.distanceCm,
    yieldPercent: detail.yieldPercent,
    productMassMg: detail.productMassMg,
    notes: detail.notes,
    materials: detail.materials.map(({ id: _id, ...rest }) => rest),
    observations: detail.observations.map((observation) => observation.body),
  };
}

export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [detail, setDetail] = useState<ExperimentDetail | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: "核对草稿" });
  }, [navigation]);

  useEffect(() => {
    getExperiment(id).then((loaded) => {
      setDetail(loaded);
      if (loaded) setDraft(toEditable(loaded));
    });
  }, [id]);

  const patch = useCallback(<K extends keyof Editable>(key: K, value: Editable[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const commit = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateDraft(id, draft);
      await commitDraft(id);
      router.replace({ pathname: "/record/[id]", params: { id } });
    } catch (error) {
      Alert.alert("入库失败", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft, id]);

  const saveOnly = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateDraft(id, draft);
      router.back();
    } catch (error) {
      Alert.alert("保存失败", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft, id]);

  if (!detail || !draft) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const photo = detail.attachments[0];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.notice}>
          下面每一项都来自模型对照片的识读，**都可能读错**。逐项对照原图核对后再入库；
          照片上没写的就让它空着，不要凭常规值补。
        </Text>

        {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="contain" /> : null}

        <SectionTitle>基本信息</SectionTitle>
        <View style={styles.row}>
          <TextField label="实验编号" value={draft.code ?? null} onChange={(next) => patch("code", next)} />
          <TextField label="日期" value={draft.performedOn ?? null} onChange={(next) => patch("performedOn", next)} />
        </View>
        <TextField label="标题" value={draft.title ?? null} onChange={(next) => patch("title", next)} />
        <TextField label="目的" value={draft.purpose ?? null} onChange={(next) => patch("purpose", next)} multiline />
        <TextField
          label="反应 SMILES"
          value={draft.reactionSmiles ?? null}
          onChange={(next) => patch("reactionSmiles", next)}
          placeholder="未从图中读出"
        />

        <SectionTitle>投料</SectionTitle>
        {draft.materials.map((material, index) => (
          <View key={index} style={styles.materialCard}>
            <View style={styles.materialHead}>
              <TextField
                label={`试剂 ${index + 1}`}
                value={material.name}
                onChange={(next) =>
                  patch(
                    "materials",
                    draft.materials.map((entry, i) => (i === index ? { ...entry, name: next ?? "" } : entry)),
                  )
                }
              />
              <Pressable
                onPress={() =>
                  patch(
                    "materials",
                    draft.materials.filter((_, i) => i !== index),
                  )
                }
                hitSlop={10}
                style={styles.remove}
              >
                <Ionicons name="close" size={16} color={theme.textDim} />
              </Pressable>
            </View>
            <View style={styles.row}>
              <NumberField
                label="用量"
                value={material.amount ?? null}
                onChange={(next) =>
                  patch(
                    "materials",
                    draft.materials.map((entry, i) => (i === index ? { ...entry, amount: next } : entry)),
                  )
                }
              />
              <TextField
                label="单位"
                value={material.unit ?? null}
                onChange={(next) =>
                  patch(
                    "materials",
                    draft.materials.map((entry, i) => (i === index ? { ...entry, unit: next } : entry)),
                  )
                }
              />
              <NumberField
                label="当量"
                value={material.equivalents ?? null}
                onChange={(next) =>
                  patch(
                    "materials",
                    draft.materials.map((entry, i) => (i === index ? { ...entry, equivalents: next } : entry)),
                  )
                }
              />
            </View>
          </View>
        ))}
        <Pressable
          style={styles.addRow}
          onPress={() =>
            patch("materials", [
              ...draft.materials,
              { name: "", role: null, amount: null, unit: null, equivalents: null },
            ])
          }
        >
          <Ionicons name="add" size={16} color={theme.accent} />
          <Text style={styles.addLabel}>加一个试剂</Text>
        </Pressable>

        <SectionTitle>条件</SectionTitle>
        <View style={styles.row}>
          <TextField label="溶剂" value={draft.solvent ?? null} onChange={(next) => patch("solvent", next)} />
          <NumberField
            label="体积"
            unit="mL"
            value={draft.solventVolumeMl ?? null}
            onChange={(next) => patch("solventVolumeMl", next)}
          />
        </View>
        <View style={styles.row}>
          <NumberField
            label="温度"
            unit="°C"
            value={draft.temperatureC ?? null}
            onChange={(next) => patch("temperatureC", next)}
          />
          <NumberField
            label="时间"
            unit="h"
            value={draft.durationHours ?? null}
            onChange={(next) => patch("durationHours", next)}
          />
        </View>
        <TextField label="气氛" value={draft.atmosphere ?? null} onChange={(next) => patch("atmosphere", next)} />

        <SectionTitle>光源</SectionTitle>
        <TextField label="型号" value={draft.lightSource ?? null} onChange={(next) => patch("lightSource", next)} />
        <View style={styles.row}>
          <NumberField
            label="波长"
            unit="nm"
            value={draft.wavelengthNm ?? null}
            onChange={(next) => patch("wavelengthNm", next)}
          />
          <NumberField label="功率" unit="W" value={draft.powerW ?? null} onChange={(next) => patch("powerW", next)} />
          <NumberField
            label="距离"
            unit="cm"
            value={draft.distanceCm ?? null}
            onChange={(next) => patch("distanceCm", next)}
          />
        </View>

        <SectionTitle>结果</SectionTitle>
        <View style={styles.row}>
          <NumberField
            label="产率"
            unit="%"
            value={draft.yieldPercent ?? null}
            onChange={(next) => patch("yieldPercent", next)}
          />
          <NumberField
            label="产物质量"
            unit="mg"
            value={draft.productMassMg ?? null}
            onChange={(next) => patch("productMassMg", next)}
          />
        </View>

        <SectionTitle>观察</SectionTitle>
        {draft.observations.map((observation, index) => (
          <TextField
            key={index}
            label={`观察 ${index + 1}`}
            value={observation}
            multiline
            onChange={(next) =>
              patch(
                "observations",
                draft.observations.map((entry, i) => (i === index ? (next ?? "") : entry)).filter((entry, i) => entry || i !== index),
              )
            }
          />
        ))}
        <Pressable style={styles.addRow} onPress={() => patch("observations", [...draft.observations, ""])}>
          <Ionicons name="add" size={16} color={theme.accent} />
          <Text style={styles.addLabel}>加一条观察</Text>
        </Pressable>

        <TextField label="备注" value={draft.notes ?? null} onChange={(next) => patch("notes", next)} multiline />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.secondary} onPress={saveOnly} disabled={saving}>
          <Text style={styles.secondaryLabel}>存为草稿</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={commit} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.onAccent} /> : <Text style={styles.primaryLabel}>确认入库</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  content: { padding: theme.space(4), gap: theme.space(3), paddingBottom: theme.space(10) },
  notice: { color: theme.textDim, fontSize: 12, lineHeight: 19 },
  photo: { width: "100%", height: 220, borderRadius: theme.radius, backgroundColor: theme.surface },
  row: { flexDirection: "row", gap: theme.space(3), flexWrap: "wrap" },
  materialCard: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(3),
  },
  materialHead: { flexDirection: "row", alignItems: "flex-end", gap: theme.space(2) },
  remove: { padding: theme.space(2) },
  addRow: { flexDirection: "row", alignItems: "center", gap: theme.space(1.5), paddingVertical: theme.space(2) },
  addLabel: { color: theme.accent, fontSize: 13 },
  footer: {
    flexDirection: "row",
    gap: theme.space(3),
    padding: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
    alignItems: "center",
  },
  secondaryLabel: { color: theme.text, fontSize: 15 },
  primary: {
    flex: 1.4,
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
    alignItems: "center",
  },
  primaryLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
});
