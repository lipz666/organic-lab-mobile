import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addObservation,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  type Campaign,
} from "../../src/db/repo/campaigns";
import {
  analyzeCampaign,
  recommendNext,
  type CampaignVariable,
  type Suggestion,
} from "../../src/photo/campaign";
import { Block, Caution, ModuleShell } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * 条件优化。
 *
 * 用规则策略而不是贝叶斯优化——一个 campaign 通常只有十几个点、七八个变量，
 * 高斯过程在这个规模上的后验几乎全由先验决定，看着精密实则是包装过的猜测。
 * 规则策略至少每条建议都说得出理由。
 */

const STRATEGY_META: Record<Suggestion["strategy"], { label: string; color: string; bg: string }> = {
  discriminate: { label: "归因", color: theme.accent, bg: theme.accentDim },
  exploit: { label: "精调", color: theme.success, bg: theme.successSoft },
  explore: { label: "探索", color: theme.warning, bg: theme.warningSoft },
};

export default function OptimizeScreen() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listCampaigns();
    setCampaigns(rows);
    setActiveId((current) => current ?? rows[0]?.id ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const active = campaigns.find((campaign) => campaign.id === activeId) ?? null;

  const analysis = useMemo(
    () => (active ? analyzeCampaign(active.observations, active.variables) : null),
    [active],
  );
  const suggestions = useMemo(
    () => (active ? recommendNext(active.observations, active.variables, active.budget) : []),
    [active],
  );

  return (
    <ModuleShell
      title="条件优化"
      lead="记下已经做过的条件与结果，系统给出下一批最值得做的实验。每条建议只改一个变量，并说明为什么值得做。"
      footer={
        <View style={styles.footer}>
          <Pressable style={styles.primary} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={18} color={theme.onAccent} />
            <Text style={styles.primaryLabel}>新建优化</Text>
          </Pressable>
        </View>
      }
    >
      {campaigns.length === 0 ? (
        <Caution
          items={["还没有优化任务。新建一个，填上要筛的变量和目标，再把已经做过的条件录进去。"]}
          tone="neutral"
        />
      ) : (
        <Block title="优化任务">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {campaigns.map((campaign) => (
              <Pressable
                key={campaign.id}
                style={[styles.chip, campaign.id === activeId && styles.chipActive]}
                onPress={() => setActiveId(campaign.id)}
                onLongPress={() =>
                  Alert.alert("删除这个优化任务？", campaign.name, [
                    { text: "取消", style: "cancel" },
                    {
                      text: "删除",
                      style: "destructive",
                      onPress: async () => {
                        await deleteCampaign(campaign.id);
                        setActiveId(null);
                        await refresh();
                      },
                    },
                  ])
                }
              >
                <Text style={[styles.chipTitle, campaign.id === activeId && styles.chipTitleActive]}>
                  {campaign.name}
                </Text>
                <Text style={styles.chipMeta}>{campaign.observations.length} 组数据</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Block>
      )}

      {active && analysis && (
        <>
          <Block title="目标" hint={active.objective}>
            <View style={styles.statusRow}>
              <Stat
                label="当前最好"
                value={analysis.best ? `${analysis.best.outcome}` : "—"}
                sub={analysis.best?.label ?? "还没有数据"}
              />
              <Stat label="已做" value={String(active.observations.length)} sub="组条件" />
              <Stat label="单变量对照" value={String(analysis.pairs.length)} sub="可归因的对子" />
            </View>
          </Block>

          {analysis.best && (
            <Block title="最好的一组">
              <View style={styles.conditionCard}>
                {Object.entries(analysis.best.conditions).map(([name, value]) => (
                  <View key={name} style={styles.conditionRow}>
                    <Text style={styles.conditionName}>{name}</Text>
                    <Text style={styles.conditionValue}>{String(value)}</Text>
                  </View>
                ))}
              </View>
            </Block>
          )}

          {analysis.pairs.length > 0 && (
            <Block title="单变量对照的效应" hint="只差一个变量的实验对，是唯一能干净归因的比较">
              {analysis.pairs.slice(0, 4).map((pair, index) => (
                <View key={index} style={styles.pairRow}>
                  <Text style={styles.pairVariable}>{pair.variable}</Text>
                  <Text style={styles.pairChange}>
                    {String(pair.a.conditions[pair.variable])} → {String(pair.b.conditions[pair.variable])}
                  </Text>
                  <Text
                    style={[
                      styles.pairDelta,
                      { color: pair.delta > 0 ? theme.success : pair.delta < 0 ? theme.danger : theme.textDim },
                    ]}
                  >
                    {pair.delta > 0 ? "+" : ""}
                    {pair.delta}
                  </Text>
                </View>
              ))}
            </Block>
          )}

          <Block title={`下一批（${suggestions.length}）`} hint={`预算 ${active.budget} 组`}>
            {suggestions.map((suggestion, index) => (
              <View key={index} style={styles.suggestion}>
                <View style={styles.suggestionHead}>
                  <View style={[styles.badge, { backgroundColor: STRATEGY_META[suggestion.strategy].bg }]}>
                    <Text style={[styles.badgeText, { color: STRATEGY_META[suggestion.strategy].color }]}>
                      {STRATEGY_META[suggestion.strategy].label}
                    </Text>
                  </View>
                  {suggestion.changedFrom ? (
                    <Text style={styles.changed}>{suggestion.changedFrom}</Text>
                  ) : null}
                </View>
                <Text style={styles.purpose}>{suggestion.purpose}</Text>
                <View style={styles.conditionCard}>
                  {Object.entries(suggestion.conditions).map(([name, value]) => (
                    <View key={name} style={styles.conditionRow}>
                      <Text style={styles.conditionName}>{name}</Text>
                      <Text style={styles.conditionValue}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Block>

          {analysis.warnings.length > 0 && <Caution items={analysis.warnings} />}

          <Pressable style={styles.secondary} onPress={() => setRecording(true)}>
            <Ionicons name="add-circle-outline" size={16} color={theme.accent} />
            <Text style={styles.secondaryLabel}>录入一组结果</Text>
          </Pressable>

          <Caution
            items={[
              "这些建议来自规则策略（归因 / 精调 / 探索），不是模型预测，也不保证下一组一定更好。",
              "数据量到几十组之后，贝叶斯优化才会比规则更有优势——那是后续版本的事。",
            ]}
            tone="neutral"
          />
        </>
      )}

      <CreateModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={async (id) => {
          setCreating(false);
          setActiveId(id);
          await refresh();
        }}
      />

      {active && (
        <RecordModal
          visible={recording}
          campaign={active}
          onClose={() => setRecording(false)}
          onSaved={async () => {
            setRecording(false);
            await refresh();
          }}
        />
      )}
    </ModuleShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

function CreateModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("提高分离产率");
  const [budget, setBudget] = useState("4");
  const [raw, setRaw] = useState("波长, 380, 520, nm\n催化剂负载, 0.5, 5, mol%\n溶剂, MeCN | DMF | DMSO");

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("需要一个名字", "例如「烯酮 [2+2] 条件筛选」");
      return;
    }
    const variables: CampaignVariable[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cells = trimmed.split(",").map((cell) => cell.trim());
      if (cells.length >= 3 && Number.isFinite(Number(cells[1])) && Number.isFinite(Number(cells[2]))) {
        variables.push({
          name: cells[0],
          kind: "continuous",
          min: Number(cells[1]),
          max: Number(cells[2]),
          unit: cells[3],
        });
      } else if (cells.length >= 2) {
        variables.push({
          name: cells[0],
          kind: "categorical",
          options: cells.slice(1).join(",").split("|").map((option) => option.trim()).filter(Boolean),
        });
      }
    }
    if (variables.length === 0) {
      Alert.alert("至少要一个变量", "每行一个：连续变量写「名称, 最小, 最大, 单位」；分类变量写「名称, A | B | C」");
      return;
    }
    const id = await createCampaign({
      name: name.trim(),
      objective: objective.trim(),
      variables,
      budget: Number(budget) || 4,
    });
    setName("");
    onCreated(id);
  };

  return (
    <Sheet visible={visible} title="新建优化" onClose={onClose} onSubmit={submit} submitLabel="创建">
      <Field label="名称" value={name} onChange={setName} placeholder="烯酮 [2+2] 条件筛选" autoFocus />
      <Field label="目标" value={objective} onChange={setObjective} placeholder="提高分离产率" />
      <Field label="每轮预算 / 组" value={budget} onChange={setBudget} numeric />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>变量（每行一个）</Text>
        <TextInput
          style={styles.textarea}
          value={raw}
          onChangeText={setRaw}
          multiline
          autoCapitalize="none"
          placeholderTextColor={theme.textFaint}
        />
        <Text style={styles.hint}>
          连续变量：名称, 最小, 最大, 单位{"\n"}分类变量：名称, 选项A | 选项B | 选项C
        </Text>
      </View>
    </Sheet>
  );
}

function RecordModal({
  visible,
  campaign,
  onClose,
  onSaved,
}: {
  visible: boolean;
  campaign: Campaign;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState("");
  const [label, setLabel] = useState("");

  const submit = async () => {
    const conditions: Record<string, string | number> = {};
    for (const variable of campaign.variables) {
      const raw = values[variable.name]?.trim();
      if (!raw) {
        Alert.alert("条件不完整", `${variable.name} 还没填。缺一个变量就无法和别的实验比较。`);
        return;
      }
      conditions[variable.name] = variable.kind === "continuous" ? Number(raw) : raw;
    }
    const value = Number(outcome);
    if (!Number.isFinite(value)) {
      Alert.alert("需要结果数值", "例如产率 62");
      return;
    }
    await addObservation(campaign.id, { conditions, outcome: value, label: label.trim() || undefined });
    setValues({});
    setOutcome("");
    setLabel("");
    onSaved();
  };

  return (
    <Sheet visible={visible} title="录入一组结果" onClose={onClose} onSubmit={submit} submitLabel="保存">
      {campaign.variables.map((variable) => (
        <Field
          key={variable.name}
          label={`${variable.name}${variable.unit ? ` / ${variable.unit}` : ""}`}
          value={values[variable.name] ?? ""}
          onChange={(next) => setValues((current) => ({ ...current, [variable.name]: next }))}
          placeholder={
            variable.kind === "continuous"
              ? `${variable.min} – ${variable.max}`
              : (variable.options ?? []).join(" / ")
          }
          numeric={variable.kind === "continuous"}
        />
      ))}
      <Field label="结果（越大越好）" value={outcome} onChange={setOutcome} numeric placeholder="产率 62" />
      <Field label="实验编号（可选）" value={label} onChange={setLabel} placeholder="PZ-120" />
    </Sheet>
  );
}

function Sheet({
  visible,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* 键盘弹出时把底部抬起来：不这样处理，下面几个字段和提交按钮会被键盘盖住够不到。 */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.textDim} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <Pressable style={styles.sheetSubmit} onPress={onSubmit}>
            <Text style={styles.sheetSubmitLabel}>{submitLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoFocus={autoFocus}
        autoCapitalize="none"
      />
    </View>
  );
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
    gap: 2,
    minWidth: 130,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  chipTitle: { color: theme.text, fontSize: 13.5, fontWeight: "600" },
  chipTitleActive: { color: theme.text },
  chipMeta: { color: theme.textFaint, fontSize: 11 },
  statusRow: { flexDirection: "row", gap: theme.space(2.5) },
  stat: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: 1,
  },
  statLabel: { color: theme.textFaint, fontSize: 10.5 },
  statValue: { color: theme.text, fontSize: 20, fontWeight: "600" },
  statSub: { color: theme.textDim, fontSize: 10.5 },
  conditionCard: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    padding: theme.space(3),
    gap: theme.space(1),
  },
  conditionRow: { flexDirection: "row", justifyContent: "space-between", gap: theme.space(3) },
  conditionName: { color: theme.textDim, fontSize: 12.5 },
  conditionValue: { color: theme.text, fontSize: 12.5, fontWeight: "600" },
  pairRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(2),
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
  },
  pairVariable: { color: theme.text, fontSize: 12.5, fontWeight: "600", minWidth: 68 },
  pairChange: { color: theme.textDim, fontSize: 12, flex: 1 },
  pairDelta: { fontSize: 13, fontWeight: "700" },
  suggestion: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2),
  },
  suggestionHead: { flexDirection: "row", alignItems: "center", gap: theme.space(2) },
  badge: { borderRadius: 999, paddingHorizontal: theme.space(2.5), paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  changed: { color: theme.textDim, fontSize: 11.5, flex: 1 },
  purpose: { color: theme.text, fontSize: 13, lineHeight: 20 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(1.5),
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3),
  },
  secondaryLabel: { color: theme.accent, fontSize: 13.5, fontWeight: "600" },
  footer: {
    padding: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(1.5),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
  },
  primaryLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(23,23,22,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.space(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: "600" },
  sheetBody: { padding: theme.space(4), gap: theme.space(3) },
  sheetSubmit: {
    margin: theme.space(4),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
    alignItems: "center",
  },
  sheetSubmitLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
  field: { gap: theme.space(1.5) },
  fieldLabel: { color: theme.textDim, fontSize: 11 },
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
  textarea: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    padding: theme.space(3),
    fontSize: 13,
    minHeight: 96,
    textAlignVertical: "top",
    fontFamily: "Menlo",
  },
  hint: { color: theme.textFaint, fontSize: 11, lineHeight: 17 },
});
