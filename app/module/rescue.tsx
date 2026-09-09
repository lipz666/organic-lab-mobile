import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useSettings } from "../../src/config/SettingsContext";
import { listLightSources } from "../../src/db/repo/equipment";
import { createDraft, getExperiment, listExperiments, type Experiment } from "../../src/db/repo/experiments";
import { getPhotoConditions } from "../../src/db/repo/photoConditions";
import {
  CATEGORY_LABELS,
  runRescue,
  tryPhotonBudget,
  type ExperimentSummary,
  type Hypothesis,
  type NextExperiment,
  type RescueContext,
  type RescueResult,
} from "../../src/photo/rescue";
import { Meter } from "../../src/ui/charts";
import { Block, Caution, ModuleShell } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * 反应诊断（Photo Reaction Rescue）。
 *
 * 这一页是整个光化学模块的理由：反应做不出来时，给出最可能的失败假设，
 * 并设计能区分它们的下一组实验。
 *
 * 两条必须守住的边界：
 *   1. 假设就是假设，UI 上不能显示成结论；
 *   2. 建议实验存下来只能是**草稿**，和照片识读走同一条确认链路。
 */

export default function RescueScreen() {
  const { settings, configured } = useSettings();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RescueResult | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    listExperiments().then((rows) => {
      setExperiments(rows);
      // 默认选中最近一条产率偏低的记录——多半就是用户想问的那条。
      const lowYield = rows.find((row) => row.yieldPercent !== null && row.yieldPercent < 40);
      setSelectedId(lowYield?.id ?? rows[0]?.id ?? null);
    });
  }, []);

  const selected = useMemo(
    () => experiments.find((experiment) => experiment.id === selectedId) ?? null,
    [experiments, selectedId],
  );

  const diagnose = useCallback(async () => {
    if (!selectedId) return;
    setBusy(true);
    setResult(null);
    setSavedIds(new Set());
    try {
      const context = await buildContext(selectedId, note);
      const budget = tryPhotonBudget(context.rescue.target, context.opticalPowerMw, context.substrateMmol);
      const diagnosis = await runRescue(
        { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
        context.rescue,
        budget,
      );
      setResult(diagnosis);
    } catch (error) {
      Alert.alert("诊断失败", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [selectedId, note, settings]);

  const saveAsDraft = useCallback(
    async (experiment: NextExperiment, key: string) => {
      if (!selected) return;
      const id = await createDraft(
        {
          title: experiment.title,
          purpose: `${experiment.purpose}\n\n改变：${experiment.change}\n保持不变：${experiment.holdConstant.join("、") || "（未指定）"}\n\n若假设成立：${experiment.predictedIfTrue}\n若不成立：${experiment.predictedIfFalse}`,
          reactionSmiles: selected.reactionSmiles,
          solvent: selected.solvent,
          notes: "由反应诊断生成的建议实验。这是模型的推断，尚未执行。",
        },
        "rescue",
      );
      setSavedIds((current) => new Set(current).add(key));
      Alert.alert("已存为草稿", "在实验记录里可以继续编辑。它还不是正式记录，需要你确认后才入库。", [
        { text: "留在这里" },
        { text: "去看看", onPress: () => router.push({ pathname: "/draft/[id]", params: { id } }) },
      ]);
    },
    [selected],
  );

  if (!configured) {
    return (
      <ModuleShell title="反应诊断">
        <Caution items={["诊断需要调用模型，先到设置里填一组 API 信息。"]} tone="neutral" />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="反应诊断"
      lead="选一条结果不理想的实验。系统会带上本组相似记录和设备信息，排出最可能的失败假设，并设计能区分它们的下一组实验。"
      footer={
        <View style={styles.footer}>
          <Pressable
            style={[styles.runButton, (!selectedId || busy) && styles.runButtonDisabled]}
            onPress={diagnose}
            disabled={!selectedId || busy}
          >
            {busy ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <>
                <Ionicons name="pulse" size={18} color={theme.onAccent} />
                <Text style={styles.runLabel}>{result ? "重新诊断" : "开始诊断"}</Text>
              </>
            )}
          </Pressable>
        </View>
      }
    >
      <Block title="要诊断哪条实验">
        {experiments.length === 0 ? (
          <Caution items={["还没有实验记录。先去实验记录页拍一页记录本，诊断才有依据。"]} tone="neutral" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {experiments.slice(0, 20).map((experiment) => {
              const active = experiment.id === selectedId;
              return (
                <Pressable
                  key={experiment.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedId(experiment.id)}
                >
                  <Text style={[styles.chipTitle, active && styles.chipTitleActive]} numberOfLines={1}>
                    {experiment.code ?? experiment.title ?? "未命名"}
                  </Text>
                  <Text style={[styles.chipMeta, active && styles.chipMetaActive]}>
                    {experiment.yieldPercent !== null ? `产率 ${experiment.yieldPercent}%` : "无产率"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Block>

      <Block title="补充说明" hint="可选，但很有用">
        <TextInput
          style={styles.textarea}
          value={note}
          onChangeText={setNote}
          placeholder="例如：化学条件和上次完全一样，只有灯和体积不同"
          placeholderTextColor={theme.textFaint}
          multiline
        />
      </Block>

      {result && (
        <>
          {result.headline ? (
            <View style={styles.headline}>
              <Text style={styles.headlineLabel}>当前最该排查</Text>
              <Text style={styles.headlineText}>{result.headline}</Text>
            </View>
          ) : null}

          {result.missingCritical.length > 0 && (
            <Block title="记录缺失的关键变量" hint="这些缺失会直接限制判断">
              <Caution items={result.missingCritical} />
            </Block>
          )}

          <Block title="失败假设" hint="按可能性排序 · 这些是推断，不是结论">
            {result.hypotheses.map((hypothesis, index) => (
              <HypothesisCard key={index} hypothesis={hypothesis} rank={index + 1} />
            ))}
          </Block>

          <Block title="下一步实验" hint="每个只改一个主要变量">
            {result.experiments.map((experiment, index) => (
              <ExperimentCard
                key={index}
                experiment={experiment}
                index={index}
                saved={savedIds.has(String(index))}
                onSave={() => saveAsDraft(experiment, String(index))}
              />
            ))}
          </Block>

          <Caution
            items={[
              "以上全部是基于现有记录的推断，没有检索文献，也没有做过实验验证。",
              "存为草稿的建议实验不是正式记录，需要你在确认页核对后才会入库。",
            ]}
            tone="neutral"
          />
        </>
      )}
    </ModuleShell>
  );
}

function HypothesisCard({ hypothesis, rank }: { hypothesis: Hypothesis; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  const confidenceColor =
    hypothesis.confidence >= 0.5 ? theme.accent : hypothesis.confidence >= 0.25 ? theme.warning : theme.textDim;

  return (
    <Pressable style={styles.hypothesis} onPress={() => setOpen((value) => !value)}>
      <View style={styles.hypothesisHead}>
        <View style={[styles.rank, rank === 1 && styles.rankTop]}>
          <Text style={[styles.rankText, rank === 1 && styles.rankTextTop]}>{rank}</Text>
        </View>
        <View style={styles.hypothesisTitleWrap}>
          <Text style={styles.categoryTag}>{CATEGORY_LABELS[hypothesis.category]}</Text>
          <Text style={styles.hypothesisText}>{hypothesis.statement}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={theme.textFaint} />
      </View>

      <View style={styles.confidenceRow}>
        <Meter value={hypothesis.confidence} color={confidenceColor} />
        <Text style={styles.confidenceText}>模型自评 {(hypothesis.confidence * 100).toFixed(0)}%</Text>
      </View>

      {open && (
        <View style={styles.evidence}>
          <EvidenceList label="支持" items={hypothesis.evidenceFor} color={theme.success} />
          <EvidenceList label="反对" items={hypothesis.evidenceAgainst} color={theme.danger} />
          <EvidenceList label="还缺" items={hypothesis.missingInformation} color={theme.textDim} />
        </View>
      )}
    </Pressable>
  );
}

function EvidenceList({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.evidenceGroup}>
      <Text style={[styles.evidenceLabel, { color }]}>{label}</Text>
      {items.map((item, index) => (
        <Text key={index} style={styles.evidenceItem}>
          · {item}
        </Text>
      ))}
    </View>
  );
}

function ExperimentCard({
  experiment,
  index,
  saved,
  onSave,
}: {
  experiment: NextExperiment;
  index: number;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.experiment}>
      <View style={styles.experimentHead}>
        <Text style={styles.experimentIndex}>实验 {index + 1}</Text>
        <View style={styles.tagRow}>
          <Tag text={`信息量 ${gainLabel(experiment.informationGain)}`} tone={experiment.informationGain} />
          <Tag text={`成本 ${costLabel(experiment.practicalCost)}`} tone={inverseCost(experiment.practicalCost)} />
        </View>
      </View>
      <Text style={styles.experimentTitle}>{experiment.title}</Text>

      <View style={styles.changeRow}>
        <View style={styles.changeCell}>
          <Text style={styles.changeLabel}>改变</Text>
          <Text style={styles.changeValue}>{experiment.change}</Text>
        </View>
        {experiment.holdConstant.length > 0 && (
          <View style={styles.changeCell}>
            <Text style={styles.changeLabel}>保持不变</Text>
            <Text style={styles.changeValue}>{experiment.holdConstant.join("、")}</Text>
          </View>
        )}
      </View>

      {experiment.purpose ? <Text style={styles.purpose}>{experiment.purpose}</Text> : null}

      <View style={styles.predictions}>
        <Prediction label="假设成立" text={experiment.predictedIfTrue} color={theme.success} />
        <Prediction label="假设不成立" text={experiment.predictedIfFalse} color={theme.textDim} />
      </View>

      <Pressable style={[styles.saveButton, saved && styles.saveButtonDone]} onPress={onSave} disabled={saved}>
        <Ionicons
          name={saved ? "checkmark-circle" : "add-circle-outline"}
          size={16}
          color={saved ? theme.success : theme.accent}
        />
        <Text style={[styles.saveLabel, saved && styles.saveLabelDone]}>
          {saved ? "已存为草稿" : "存为草稿实验"}
        </Text>
      </Pressable>
    </View>
  );
}

function Prediction({ label, text, color }: { label: string; text: string; color: string }) {
  if (!text) return null;
  return (
    <View style={styles.prediction}>
      <View style={[styles.predictionDot, { backgroundColor: color }]} />
      <View style={styles.predictionBody}>
        <Text style={styles.predictionLabel}>{label}</Text>
        <Text style={styles.predictionText}>{text}</Text>
      </View>
    </View>
  );
}

function Tag({ text, tone }: { text: string; tone: "high" | "medium" | "low" }) {
  const palette =
    tone === "high"
      ? { bg: theme.successSoft, fg: theme.success }
      : tone === "medium"
        ? { bg: theme.surfaceAlt, fg: theme.textDim }
        : { bg: theme.surfaceAlt, fg: theme.textFaint };
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[styles.tagText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

const gainLabel = (gain: string) => (gain === "high" ? "高" : gain === "medium" ? "中" : "低");
const costLabel = (cost: string) => (cost === "high" ? "高" : cost === "medium" ? "中" : "低");
const inverseCost = (cost: "high" | "medium" | "low") => (cost === "low" ? "high" : cost === "medium" ? "medium" : "low");

/** 把一条实验及其上下文组装成 Rescue 的输入。 */
async function buildContext(
  experimentId: string,
  note: string,
): Promise<{ rescue: RescueContext; opticalPowerMw: number | null; substrateMmol: number | null }> {
  const detail = await getExperiment(experimentId);
  if (!detail) throw new Error("找不到这条实验");

  const conditions = await getPhotoConditions(experimentId);
  const sources = await listLightSources();
  const all = await listExperiments();

  const toSummary = async (experiment: Experiment): Promise<ExperimentSummary> => {
    const photo = await getPhotoConditions(experiment.id);
    const full = experiment.id === experimentId ? detail : await getExperiment(experiment.id);
    return {
      id: experiment.id,
      code: experiment.code,
      title: experiment.title,
      performedOn: experiment.performedOn,
      yieldPercent: experiment.yieldPercent,
      solvent: experiment.solvent,
      temperatureC: experiment.temperatureC,
      durationHours: experiment.durationHours,
      reactionSmiles: experiment.reactionSmiles,
      photocatalyst: photo?.photocatalyst ?? null,
      photocatalystLoading: photo?.photocatalystLoadingMolPercent ?? null,
      wavelengthNm: photo?.wavelengthNm ?? experiment.wavelengthNm,
      lightSourceName: photo?.lightSourceName ?? experiment.lightSource,
      distanceCm: photo?.distanceCm ?? experiment.distanceCm,
      reactionVolumeMl: photo?.reactionVolumeMl ?? experiment.solventVolumeMl,
      degassingMethod: photo?.degassingMethod ?? null,
      atmosphere: experiment.atmosphere,
      observations: full?.observations.map((observation) => observation.body) ?? [],
    };
  };

  const target = await toSummary(detail);
  // 相似记录：同一个反应优先，其次按时间取最近的几条。数量刻意控制在 6 条以内，
  // 上下文太长会让模型抓不住重点。
  const candidates = all.filter((experiment) => experiment.id !== experimentId);
  const sameReaction = candidates.filter(
    (experiment) => experiment.reactionSmiles && experiment.reactionSmiles === detail.reactionSmiles,
  );
  const others = candidates.filter((experiment) => !sameReaction.includes(experiment));
  const chosen = [...sameReaction, ...others].slice(0, 6);
  const neighbours = await Promise.all(chosen.map(toSummary));

  return {
    rescue: {
      target,
      neighbours,
      equipment: sources.map((source) => ({
        name: source.name,
        nominalWavelengthNm: source.nominalWavelengthNm,
        latestCalibration: source.latest?.calibrationDate ?? null,
      })),
      note: note.trim() || undefined,
    },
    opticalPowerMw: conditions?.opticalPowerMw ?? null,
    substrateMmol: detail.materials[0]?.amount ?? null,
  };
}

const styles = StyleSheet.create({
  chipRow: { gap: theme.space(2), paddingRight: theme.space(4) },
  chip: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(2.5),
    gap: theme.space(0.5),
    minWidth: 116,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  chipTitle: { color: theme.text, fontSize: 13.5, fontWeight: "600" },
  chipTitleActive: { color: theme.text },
  chipMeta: { color: theme.textFaint, fontSize: 11 },
  chipMetaActive: { color: theme.textDim },
  textarea: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    padding: theme.space(3),
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
  },
  headline: {
    backgroundColor: theme.accentDim,
    borderRadius: theme.radius,
    padding: theme.space(4),
    gap: theme.space(1.5),
  },
  headlineLabel: { color: theme.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  headlineText: { color: theme.text, fontSize: 15, lineHeight: 23 },
  hypothesis: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  hypothesisHead: { flexDirection: "row", gap: theme.space(2.5), alignItems: "flex-start" },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  rankTop: { backgroundColor: theme.accent },
  rankText: { color: theme.textDim, fontSize: 12, fontWeight: "700" },
  rankTextTop: { color: theme.onAccent },
  hypothesisTitleWrap: { flex: 1, gap: theme.space(1) },
  categoryTag: { color: theme.accent, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3 },
  hypothesisText: { color: theme.text, fontSize: 14, lineHeight: 21 },
  confidenceRow: { gap: theme.space(1) },
  confidenceText: { color: theme.textFaint, fontSize: 10.5 },
  evidence: { gap: theme.space(2), borderTopWidth: 1, borderTopColor: theme.border, paddingTop: theme.space(2.5) },
  evidenceGroup: { gap: theme.space(0.5) },
  evidenceLabel: { fontSize: 11, fontWeight: "700" },
  evidenceItem: { color: theme.textDim, fontSize: 12.5, lineHeight: 19 },
  experiment: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  experimentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  experimentIndex: { color: theme.textFaint, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  tagRow: { flexDirection: "row", gap: theme.space(1.5) },
  tag: { borderRadius: 999, paddingHorizontal: theme.space(2), paddingVertical: 2 },
  tagText: { fontSize: 10.5, fontWeight: "600" },
  experimentTitle: { color: theme.text, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  changeRow: { gap: theme.space(2) },
  changeCell: { gap: theme.space(0.5) },
  changeLabel: { color: theme.textFaint, fontSize: 10.5, fontWeight: "700" },
  changeValue: { color: theme.text, fontSize: 13, lineHeight: 20 },
  purpose: { color: theme.textDim, fontSize: 12.5, lineHeight: 19 },
  predictions: { gap: theme.space(2), backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: theme.space(3) },
  prediction: { flexDirection: "row", gap: theme.space(2), alignItems: "flex-start" },
  predictionDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  predictionBody: { flex: 1, gap: 1 },
  predictionLabel: { color: theme.textFaint, fontSize: 10.5, fontWeight: "700" },
  predictionText: { color: theme.textDim, fontSize: 12.5, lineHeight: 19 },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(1.5),
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingVertical: theme.space(2.5),
  },
  saveButtonDone: { borderColor: theme.success, backgroundColor: theme.successSoft },
  saveLabel: { color: theme.accent, fontSize: 13, fontWeight: "600" },
  saveLabelDone: { color: theme.success },
  footer: {
    padding: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  runButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(2),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
  },
  runButtonDisabled: { opacity: 0.5 },
  runLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
});
