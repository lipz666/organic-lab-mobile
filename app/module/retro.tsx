import { Ionicons } from "@expo/vector-icons";
import { Link, router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { proposeRoutes, type RetroRoute, type RetroStep } from "../../src/agent/retro";
import { availabilityLabel } from "../../src/chem/availability";
import { validateSmiles } from "../../src/chem/api";
import { useSettings } from "../../src/config/SettingsContext";
import { listRoutes, saveRoute, type SavedRoute } from "../../src/db/repo/routes";
import { KetcherModal } from "../../src/ui/KetcherModal";
import { Structure } from "../../src/ui/Structure";
import { theme } from "../../src/ui/theme";

export default function RetroScreen() {
  const { settings, configured } = useSettings();
  const [target, setTarget] = useState("");
  const [hint, setHint] = useState("");
  const [routes, setRoutes] = useState<RetroRoute[] | null>(null);
  const [activeRoute, setActiveRoute] = useState(0);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listRoutes().then(setSaved);
    }, []),
  );

  const propose = useCallback(async () => {
    const smiles = target.trim();
    if (!smiles) return;

    try {
      const result = await validateSmiles(smiles);
      if (!result.ok) {
        Alert.alert("目标结构有问题", result.error ?? "RDKit 无法读取这个 SMILES");
        return;
      }
    } catch {
      // RDKit 不可用时仍允许提议，但每条路线会明确标成“未校验”。
    }

    setBusy(true);
    setRoutes(null);
    setActiveRoute(0);
    try {
      const proposed = await proposeRoutes(
        { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
        smiles,
        { count: 3, validate: validateSmiles, hint },
      );
      setRoutes(proposed);
    } catch (error) {
      Alert.alert("提议失败", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [target, hint, settings]);

  const keep = useCallback(
    async (route: RetroRoute) => {
      const id = await saveRoute(target.trim(), route);
      setSaved(await listRoutes());
      router.push({ pathname: "/route/[id]", params: { id } });
    },
    [target],
  );

  const useDrawing = useCallback(async (smiles: string) => {
    setEditorOpen(false);
    if (!smiles) {
      setTarget("");
      return;
    }
    try {
      const result = await validateSmiles(smiles);
      if (!result.ok) {
        Alert.alert("画出的结构无法读取", result.error ?? "请返回画板检查结构");
        return;
      }
      setTarget(result.canonical ?? smiles);
    } catch {
      setTarget(smiles);
    }
  }, []);

  if (!configured) {
    return (
      <View style={styles.gate}>
        <View style={styles.gateMark}><Ionicons name="git-network-outline" size={28} color={theme.accent} /></View>
        <Text style={styles.gateTitle}>先连接模型服务</Text>
        <Text style={styles.gateBody}>逆合成提议会调用你配置的模型；结构绘图与 RDKit 校验仍在本机完成。</Text>
        <Link href="/settings" style={styles.gateLink}>去设置 →</Link>
      </View>
    );
  }

  const selected = routes?.[Math.min(activeRoute, routes.length - 1)];

  return (
    <>
      <Stack.Screen options={{ title: "逆合成" }} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>RETROSYNTHESIS</Text>
          <Text style={styles.introTitle}>从目标结构开始</Text>
          <Text style={styles.introBody}>输入 SMILES，或用画板绘制分子。模型负责提出假设，RDKit 负责逐个检查结构。</Text>
        </View>

        <View style={styles.targetCard}>
          <View style={styles.inputHead}>
            <Text style={styles.inputLabel}>目标分子</Text>
            <Pressable style={styles.drawButton} onPress={() => setEditorOpen(true)}>
              <Ionicons name="pencil-outline" size={15} color={theme.accent} />
              <Text style={styles.drawLabel}>打开分子画板</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={target}
            onChangeText={setTarget}
            placeholder="输入目标分子的 SMILES"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {target.trim() ? (
            <View style={styles.targetPreview}>
              <Structure smiles={target.trim()} height={126} />
            </View>
          ) : (
            <Pressable style={styles.blankCanvas} onPress={() => setEditorOpen(true)}>
              <Ionicons name="add-circle-outline" size={19} color={theme.textDim} />
              <Text style={styles.blankCanvasText}>点这里画一个结构</Text>
            </Pressable>
          )}
          <TextInput
            style={styles.hintInput}
            value={hint}
            onChangeText={setHint}
            placeholder="补充要求（可选）：例如 避免使用有机锡试剂、优先汇聚路线、手性中心用不对称氢化建立"
            placeholderTextColor={theme.textFaint}
            multiline
          />

          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (!target.trim() || busy) && styles.buttonDisabled]} onPress={propose} disabled={busy || !target.trim()}>
            {busy ? (
              <><ActivityIndicator color={theme.onAccent} /><Text style={styles.buttonLabel}>正在构思并校验路线…</Text></>
            ) : (
              <><Ionicons name="sparkles" size={16} color={theme.onAccent} /><Text style={styles.buttonLabel}>生成 3 条路线</Text></>
            )}
          </Pressable>
        </View>

        {routes && selected ? (
          <View style={styles.results}>
            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={17} color={theme.warning} />
              <Text style={styles.noticeText}>以下是模型提出的假设路线，未查文献或组内先例。结构可读不等于反应可行。</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeTabs}>
              {routes.map((route, index) => (
                <Pressable key={index} style={[styles.routeTab, activeRoute === index && styles.routeTabActive]} onPress={() => setActiveRoute(index)}>
                  <View style={styles.routeTabTop}>
                    <Text style={[styles.routeTabNumber, activeRoute === index && styles.routeTabNumberActive]}>路线 {index + 1}</Text>
                    <StatusDot value={route.usable} />
                  </View>
                  <Text style={[styles.routeTabMeta, activeRoute === index && styles.routeTabMetaActive]}>{route.steps.length} 步</Text>
                </Pressable>
              ))}
            </ScrollView>

            <RouteCard route={selected} index={activeRoute} onSave={() => keep(selected)} />
          </View>
        ) : null}

        {saved.length > 0 ? (
          <View style={styles.savedSection}>
            <View style={styles.sectionHead}>
              <Text style={styles.section}>已保存路线</Text>
              <Text style={styles.sectionCount}>{saved.length}</Text>
            </View>
            {saved.map((entry) => (
              <Pressable key={entry.id} style={styles.savedRow} onPress={() => router.push({ pathname: "/route/[id]", params: { id: entry.id } })}>
                <View style={styles.savedIcon}><Ionicons name="bookmark-outline" size={17} color={theme.accent} /></View>
                <View style={styles.savedCopy}>
                  <Text style={styles.savedTitle} numberOfLines={1}>{entry.title ?? entry.targetSmiles}</Text>
                  <Text style={styles.savedMeta}>{entry.stepCount} 步 · {entry.createdAt.slice(0, 10)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={theme.textFaint} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <KetcherModal visible={editorOpen} initialSmiles={target} onClose={() => setEditorOpen(false)} onApply={(smiles) => void useDrawing(smiles)} />
    </>
  );
}

function StatusDot({ value }: { value: boolean | null }) {
  return <View style={[styles.statusDot, value === true ? styles.statusOk : value === false ? styles.statusBad : styles.statusUnknown]} />;
}

function RouteCard({ route, index, onSave }: { route: RetroRoute; index: number; onSave: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardKicker}>路线 {index + 1} · {route.steps.length} 步</Text>
          <Text style={styles.cardTitle}>{route.strategy}</Text>
        </View>
        <View style={[styles.badge, route.usable === true ? styles.badgeOk : route.usable === false ? styles.badgeBad : styles.badgeUnknown]}>
          <Ionicons name={route.usable === true ? "checkmark" : route.usable === false ? "alert" : "help"} size={12} color={route.usable === true ? theme.success : route.usable === false ? theme.danger : theme.textDim} />
          <Text style={[styles.badgeText, route.usable === true ? styles.badgeTextOk : route.usable === false ? styles.badgeTextBad : null]}>
            {route.usable === true ? "结构通过" : route.usable === false ? "结构有问题" : "未校验"}
          </Text>
        </View>
      </View>

      {route.problems.map((problem) => (
        <View key={problem} style={styles.problemRow}><Ionicons name="warning-outline" size={14} color={theme.danger} /><Text style={styles.problem}>{problem}</Text></View>
      ))}

      <View style={styles.timeline}>
        {route.steps.map((step, stepIndex) => (
          <StepCard key={step.order} step={step} last={stepIndex === route.steps.length - 1} />
        ))}
      </View>

      {route.startingMaterials.length > 0 ? (
        <View style={styles.materials}>
          <Text style={styles.materialsLabel}>建议起始原料</Text>
          {route.startingMaterials.map((material, index) => {
            const availability = route.availability[index];
            const status = availability?.status;
            return (
              <View
                key={`${material}-${index}`}
                style={[
                  styles.materialItem,
                  status === "catalog" && styles.materialCatalog,
                  status === "catalog_skeleton" && styles.materialSkeleton,
                  status === "unlisted" && styles.materialUnlisted,
                ]}
              >
                <Text style={styles.materialName}>
                  {availability?.match?.name ?? material}
                </Text>
                {availability?.match ? (
                  <Text selectable style={styles.materialSmiles}>
                    {material}
                  </Text>
                ) : null}
                {availability ? (
                  <Text style={styles.materialNote}>
                    {availabilityLabel(availability.status)} · {availability.note}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Pressable style={styles.save} onPress={onSave}>
        <Ionicons name="bookmark-outline" size={17} color={theme.onAccent} />
        <Text style={styles.saveLabel}>保存这条路线</Text>
      </Pressable>
    </View>
  );
}

function StepCard({ step, last }: { step: RetroStep; last: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step.order + 1}</Text></View>
        {!last ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>{step.transform}</Text>
        {step.reactionSmiles ? <Structure smiles={step.reactionSmiles} height={142} /> : null}
        <View style={styles.equation}>
          <Text selectable style={styles.equationText}>{step.precursorSmiles.join(" + ") || "前体未给出"}</Text>
          <Ionicons name="arrow-forward" size={15} color={theme.accent} />
          <Text selectable style={styles.equationText}>{step.productSmiles || "产物未给出"}</Text>
        </View>
        {step.reagents ? <View style={styles.detailRow}><Text style={styles.detailLabel}>试剂 / 条件</Text><Text selectable style={styles.detailText}>{step.reagents}</Text></View> : null}
        {step.rationale ? <View style={styles.detailRow}><Text style={styles.detailLabel}>断开依据</Text><Text selectable style={styles.detailText}>{step.rationale}</Text></View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hintInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    fontSize: 13.5,
    minHeight: 62,
    textAlignVertical: "top",
  },
  materialItem: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    gap: 2,
    backgroundColor: theme.surface,
  },
  materialCatalog: { borderColor: theme.success, backgroundColor: theme.successSoft },
  materialSkeleton: { borderColor: theme.warning, backgroundColor: theme.warningSoft },
  materialUnlisted: { borderColor: theme.borderStrong, backgroundColor: theme.surfaceAlt },
  materialName: { color: theme.text, fontSize: 13, fontWeight: "600" },
  materialSmiles: { color: theme.textDim, fontSize: 11, fontFamily: "Menlo" },
  materialNote: { color: theme.textDim, fontSize: 11, lineHeight: 16 },
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.space(4), gap: theme.space(5), paddingBottom: theme.space(14) },
  gate: { flex: 1, backgroundColor: theme.bg, padding: theme.space(7), justifyContent: "center", alignItems: "center", gap: theme.space(3) },
  gateMark: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
  gateTitle: { color: theme.text, fontSize: 22, fontWeight: "600" },
  gateBody: { color: theme.textDim, fontSize: 14, lineHeight: 21, textAlign: "center" },
  gateLink: { color: theme.accent, fontSize: 15, marginTop: theme.space(2), fontWeight: "600" },
  intro: { gap: theme.space(1.5) },
  eyebrow: { color: theme.accent, fontSize: 10, letterSpacing: 1.8, fontWeight: "700" },
  introTitle: { color: theme.text, fontSize: 24, fontWeight: "600" },
  introBody: { color: theme.textDim, fontSize: 13.5, lineHeight: 20 },
  targetCard: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 22, padding: theme.space(4), gap: theme.space(3) },
  inputHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inputLabel: { color: theme.text, fontSize: 13, fontWeight: "700" },
  drawButton: { flexDirection: "row", alignItems: "center", gap: theme.space(1.5), paddingVertical: theme.space(1) },
  drawLabel: { color: theme.accent, fontSize: 12.5, fontWeight: "600" },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 13, color: theme.text, paddingHorizontal: theme.space(3), paddingVertical: theme.space(2.5), fontSize: 14, minHeight: 44, maxHeight: 88 },
  targetPreview: { borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
  blankCanvas: { height: 84, borderRadius: 15, borderWidth: 1, borderStyle: "dashed", borderColor: theme.borderStrong, alignItems: "center", justifyContent: "center", gap: theme.space(1.5) },
  blankCanvasText: { color: theme.textDim, fontSize: 12.5 },
  button: { minHeight: 48, backgroundColor: theme.accent, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: theme.space(2) },
  buttonPressed: { backgroundColor: theme.accentPressed },
  buttonDisabled: { opacity: 0.48 },
  buttonLabel: { color: theme.onAccent, fontSize: 14.5, fontWeight: "700" },
  results: { gap: theme.space(3) },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: theme.space(2), backgroundColor: theme.warningSoft, borderRadius: 14, padding: theme.space(3) },
  noticeText: { color: theme.warning, fontSize: 11.5, lineHeight: 17, flex: 1 },
  routeTabs: { gap: theme.space(2), paddingRight: theme.space(4) },
  routeTab: { minWidth: 104, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: theme.space(3), paddingVertical: theme.space(2.5), gap: 2 },
  routeTabActive: { backgroundColor: theme.text, borderColor: theme.text },
  routeTabTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space(2) },
  routeTabNumber: { color: theme.text, fontSize: 12.5, fontWeight: "700" },
  routeTabNumberActive: { color: theme.surface },
  routeTabMeta: { color: theme.textDim, fontSize: 10.5 },
  routeTabMetaActive: { color: theme.border },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusOk: { backgroundColor: theme.success }, statusBad: { backgroundColor: theme.danger }, statusUnknown: { backgroundColor: theme.textFaint },
  card: { backgroundColor: theme.surface, borderRadius: 22, borderWidth: 1, borderColor: theme.border, padding: theme.space(4), gap: theme.space(4) },
  cardHead: { gap: theme.space(2) },
  cardHeading: { gap: theme.space(1) },
  cardKicker: { color: theme.accent, fontSize: 10.5, letterSpacing: 0.7, fontWeight: "700", textTransform: "uppercase" },
  cardTitle: { color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "600" },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: theme.space(2), paddingVertical: theme.space(1) },
  badgeOk: { backgroundColor: theme.successSoft }, badgeBad: { backgroundColor: theme.dangerSoft }, badgeUnknown: { backgroundColor: theme.surfaceAlt },
  badgeText: { color: theme.textDim, fontSize: 10.5, fontWeight: "600" }, badgeTextOk: { color: theme.success }, badgeTextBad: { color: theme.danger },
  problemRow: { flexDirection: "row", gap: theme.space(1.5), alignItems: "flex-start" },
  problem: { color: theme.danger, fontSize: 11.5, lineHeight: 17, flex: 1 },
  timeline: { gap: 0 },
  stepRow: { flexDirection: "row", alignItems: "stretch", gap: theme.space(2.5) },
  stepRail: { width: 26, alignItems: "center" },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: theme.accent, fontSize: 11.5, fontWeight: "800" },
  stepLine: { flex: 1, width: 1, backgroundColor: theme.borderStrong, minHeight: 18 },
  stepCard: { flex: 1, gap: theme.space(2), paddingBottom: theme.space(5) },
  stepTitle: { color: theme.text, fontSize: 14.5, fontWeight: "700", lineHeight: 20 },
  equation: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space(1.5), backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: theme.space(2) },
  equationText: { color: theme.textDim, fontSize: 10.5, fontFamily: "monospace", flexShrink: 1 },
  detailRow: { gap: 3 }, detailLabel: { color: theme.textFaint, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.6 }, detailText: { color: theme.text, fontSize: 12.5, lineHeight: 18 },
  materials: { gap: theme.space(2) }, materialsLabel: { color: theme.textDim, fontSize: 11, fontWeight: "700" },
  materialChip: { color: theme.text, backgroundColor: theme.surfaceAlt, borderRadius: 10, paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(2), fontSize: 10.5, fontFamily: "monospace" },
  save: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space(2), borderRadius: 15, backgroundColor: theme.accent },
  saveLabel: { color: theme.onAccent, fontSize: 14, fontWeight: "700" },
  savedSection: { gap: theme.space(2) }, sectionHead: { flexDirection: "row", alignItems: "center", gap: theme.space(2) },
  section: { color: theme.text, fontSize: 17, fontWeight: "700" }, sectionCount: { color: theme.textDim, fontSize: 11, backgroundColor: theme.surfaceAlt, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: theme.space(3), backgroundColor: theme.surface, borderRadius: 15, borderWidth: 1, borderColor: theme.border, padding: theme.space(3) },
  savedIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
  savedCopy: { flex: 1, gap: 3 }, savedTitle: { color: theme.text, fontSize: 12.5, fontFamily: "monospace" }, savedMeta: { color: theme.textDim, fontSize: 10.5 },
});
