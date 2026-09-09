import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { PHOTOCATALYSTS, screenCatalysts, type Role, type ScreenResult } from "../../src/photo/photocatalysts";
import { Meter } from "../../src/ui/charts";
import { Block, Caution, ModuleShell } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * 光催化剂与波长选择。
 *
 * 输出的不是「最佳催化剂」，而是一张带理由的候选表——热力学、光谱、数据条件
 * 各自摆开，由人来权衡。缺数据时显示「缺数据」而不是把它当成不可行。
 */

const ROLE_LABELS: Record<Role, { title: string; hint: string; field: string }> = {
  oxidation: {
    title: "氧化底物",
    hint: "催化剂激发态要能从底物拿走一个电子",
    field: "底物氧化电位 Eox / V vs SCE",
  },
  reduction: {
    title: "还原底物",
    hint: "催化剂激发态要能给底物一个电子",
    field: "底物还原电位 Ered / V vs SCE",
  },
  energy_transfer: {
    title: "能量转移",
    hint: "敏化剂三重态能量要高于底物",
    field: "底物三重态能量 ET / kcal·mol⁻¹",
  },
};

export default function CatalystScreen() {
  const [role, setRole] = useState<Role>("oxidation");
  const [potential, setPotential] = useState("");
  const [wavelength, setWavelength] = useState("450");
  const [onlyAvailable, setOnlyAvailable] = useState<string[]>([]);

  const results = useMemo(() => {
    const value = Number(potential);
    const hasValue = potential.trim() !== "" && Number.isFinite(value);
    return screenCatalysts({
      role,
      substratePotential: role !== "energy_transfer" && hasValue ? value : null,
      substrateTripletKcal: role === "energy_transfer" && hasValue ? value : null,
      wavelengthNm: Number(wavelength) || null,
      availableIds: onlyAvailable.length ? onlyAvailable : undefined,
    });
  }, [role, potential, wavelength, onlyAvailable]);

  const label = ROLE_LABELS[role];

  return (
    <ModuleShell
      title="光催化剂选择"
      lead="按反应类型筛选候选催化剂。给出的是带理由的候选表，不是单一「最佳」——热力学只说方向对不对，做不做得成要靠实验。"
    >
      <Block title="反应类型">
        <View style={styles.roleRow}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
            <Pressable
              key={key}
              style={[styles.role, role === key && styles.roleActive]}
              onPress={() => setRole(key)}
            >
              <Text style={[styles.roleTitle, role === key && styles.roleTitleActive]}>
                {ROLE_LABELS[key].title}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.roleHint}>{label.hint}</Text>
      </Block>

      <Block title="条件">
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label.field}</Text>
            <TextInput
              style={styles.input}
              value={potential}
              onChangeText={setPotential}
              keyboardType="numbers-and-punctuation"
              placeholder="不填则只看光谱"
              placeholderTextColor={theme.textFaint}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>LED 波长 / nm</Text>
            <TextInput
              style={styles.input}
              value={wavelength}
              onChangeText={setWavelength}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.textFaint}
            />
          </View>
        </View>
      </Block>

      <Block title="只看这些" hint="选中后仅在实验室现有的催化剂里挑">
        <View style={styles.chipRow}>
          {PHOTOCATALYSTS.map((catalyst) => {
            const active = onlyAvailable.includes(catalyst.id);
            return (
              <Pressable
                key={catalyst.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() =>
                  setOnlyAvailable((current) =>
                    active ? current.filter((id) => id !== catalyst.id) : [...current, catalyst.id],
                  )
                }
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{catalyst.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Block>

      <Block title={`候选（${results.length}）`} hint="按热力学与光谱匹配排序">
        {results.map((result) => (
          <CatalystCard key={result.catalyst.id} result={result} />
        ))}
      </Block>

      <Caution
        items={[
          "电位与三重态能量都强烈依赖溶剂和参比电极，卡片上标了测量条件——和你的体系不一致时不能直接比。",
          "热力学有利只说明电子/能量转移方向可行，不代表反应做得成：动力学、副反应、回电子转移都不在这里。",
          "库里的值用于定性筛选，定量判断前请回查原始文献。",
        ]}
      />
    </ModuleShell>
  );
}

function CatalystCard({ result }: { result: ScreenResult }) {
  const [open, setOpen] = useState(false);
  const { catalyst, thermodynamicallyFeasible, drivingForce, spectralMatch } = result;

  const verdict =
    thermodynamicallyFeasible === true
      ? { text: "热力学可行", color: theme.success, bg: theme.successSoft }
      : thermodynamicallyFeasible === false
        ? { text: "热力学不利", color: theme.danger, bg: theme.dangerSoft }
        : { text: "缺数据", color: theme.textDim, bg: theme.surfaceAlt };

  return (
    <Pressable style={styles.card} onPress={() => setOpen((value) => !value)}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName}>{catalyst.name}</Text>
        <View style={[styles.verdict, { backgroundColor: verdict.bg }]}>
          <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.text}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        {drivingForce !== null && (
          <Metric label="驱动力" value={`${drivingForce > 0 ? "+" : ""}${drivingForce.toFixed(2)}`} />
        )}
        {catalyst.lambdaMaxNm !== null && <Metric label="λmax" value={`${catalyst.lambdaMaxNm} nm`} />}
        {catalyst.tripletEnergyKcal !== null && (
          <Metric label="ET" value={`${catalyst.tripletEnergyKcal} kcal/mol`} />
        )}
        {catalyst.lifetimeNs !== null && <Metric label="寿命" value={`${catalyst.lifetimeNs} ns`} />}
      </View>

      {spectralMatch !== null && (
        <Meter
          value={spectralMatch}
          color={spectralMatch >= 0.9 ? theme.success : spectralMatch >= 0.4 ? theme.warning : theme.danger}
          caption={`波长匹配 ${(spectralMatch * 100).toFixed(0)}%`}
        />
      )}

      {open && (
        <View style={styles.reasons}>
          {result.reasons.map((reason, index) => (
            <Text key={index} style={styles.reason}>
              · {reason}
            </Text>
          ))}
          <Text style={styles.notes}>{catalyst.notes}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  roleRow: { flexDirection: "row", gap: theme.space(2) },
  role: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingVertical: theme.space(2.5),
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  roleActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  roleTitle: { color: theme.textDim, fontSize: 13 },
  roleTitleActive: { color: theme.text, fontWeight: "600" },
  roleHint: { color: theme.textFaint, fontSize: 11.5 },
  row: { flexDirection: "row", gap: theme.space(2.5) },
  field: { flex: 1, gap: theme.space(1.5) },
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
    backgroundColor: theme.surface,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  chipText: { color: theme.textDim, fontSize: 12 },
  chipTextActive: { color: theme.text, fontWeight: "600" },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(2) },
  cardName: { color: theme.text, fontSize: 15, fontWeight: "600", flex: 1 },
  verdict: { borderRadius: 999, paddingHorizontal: theme.space(2.5), paddingVertical: 2 },
  verdictText: { fontSize: 11, fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(3) },
  metric: { gap: 1, minWidth: 74 },
  metricLabel: { color: theme.textFaint, fontSize: 10.5 },
  metricValue: { color: theme.text, fontSize: 13, fontWeight: "500" },
  reasons: { gap: theme.space(1), borderTopWidth: 1, borderTopColor: theme.border, paddingTop: theme.space(2.5) },
  reason: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
  notes: { color: theme.text, fontSize: 12.5, lineHeight: 19, marginTop: theme.space(1) },
});
