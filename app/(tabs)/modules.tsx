import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { rdkitBridge } from "../../src/chem/bridge";
import { useSettings } from "../../src/config/SettingsContext";
import { countLightSources } from "../../src/db/repo/equipment";
import { listExperiments } from "../../src/db/repo/experiments";
import { clearDemoData, hasDemoData, loadDemoData } from "../../src/photo/demoSeed";
import { theme } from "../../src/ui/theme";

/**
 * 功能模块中心。
 *
 * 光化学课题组的入口按「解决什么问题」组织，而不是按技术分类：
 * 反应做不出来 → Rescue；数据要处理 → 确定性工具；设备要记住 → 实验室记忆。
 * Rescue 排第一且卡片最大，因为它是这个模块存在的理由。
 */

type ModuleCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  tone: "primary" | "normal";
  badge?: string;
};

export default function ModulesScreen() {
  const { configured } = useSettings();
  const [experimentCount, setExperimentCount] = useState(0);
  const [lightCount, setLightCount] = useState(0);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listExperiments().then((rows) => setExperimentCount(rows.length));
      countLightSources().then(setLightCount);
      hasDemoData().then(setDemoLoaded);
    }, []),
  );

  const solver: ModuleCard[] = [
    {
      key: "rescue",
      title: "反应诊断",
      subtitle: "反应不工作时，排出最可能的失败假设，并设计能区分它们的下一组实验",
      icon: "pulse-outline",
      href: "/module/rescue",
      tone: "primary",
      badge: experimentCount > 0 ? `可参考 ${experimentCount} 条本组记录` : "先记几条实验效果更好",
    },
  ];

  const tools: ModuleCard[] = [
    {
      key: "photon",
      title: "光子预算",
      subtitle: "光子能量、通量、剂量、当量。电功率不会被当成光功率",
      icon: "flash-outline",
      href: "/module/photon",
      tone: "normal",
    },
    {
      key: "spectra",
      title: "光谱与重叠",
      subtitle: "UV–Vis 分析，LED 发射与吸收谱叠图，光子加权重叠度",
      icon: "analytics-outline",
      href: "/module/spectra",
      tone: "normal",
    },
    {
      key: "catalyst",
      title: "光催化剂选择",
      subtitle: "按氧化/还原/能量转移筛选候选，给出热力学驱动力与波长匹配",
      icon: "color-filter-outline",
      href: "/module/catalyst",
      tone: "normal",
    },
    {
      key: "stern-volmer",
      title: "Stern–Volmer",
      subtitle: "猝灭数据线性拟合，给出 KSV、R²、离群点",
      icon: "trending-up-outline",
      href: "/module/stern-volmer",
      tone: "normal",
    },
  ];

  const solverMore: ModuleCard[] = [
    {
      key: "optimize",
      title: "条件优化",
      subtitle: "录入已做过的条件与结果，给出下一批最值得做的实验",
      icon: "options-outline",
      href: "/module/optimize",
      tone: "normal",
    },
  ];

  const memory: ModuleCard[] = [
    {
      key: "equipment",
      title: "设备记忆",
      subtitle: "光源与反应器登记，校准留版本。以后只需引用编号",
      icon: "bulb-outline",
      href: "/module/equipment",
      tone: "normal",
      badge: lightCount > 0 ? `${lightCount} 台光源` : "还没登记光源",
    },
  ];

  const synthesis: ModuleCard[] = [
    {
      key: "retro",
      title: "逆合成",
      subtitle: "给目标分子提议断开策略不同的路线，每个结构过 RDKit 校验",
      icon: "git-network-outline",
      href: "/module/retro",
      tone: "normal",
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        光化学研究模块。目标不是回答光化学问题，而是帮你把反应做出来——
        诊断失败、算清光子、读懂光谱、记住设备。
      </Text>

      <Section title="解决问题" hint="从这里开始">
        {solver.map((card) => (
          <Card key={card.key} card={card} disabled={!configured} />
        ))}
      </Section>

      <Section title="继续推进">
        {solverMore.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </Section>

      <Section title="确定性工具" hint="由代码计算，结果可复现">
        {tools.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </Section>

      <Section title="实验室记忆" hint="越用越准">
        {memory.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </Section>

      <Section title="合成设计">
        {synthesis.map((card) => (
          <Card key={card.key} card={card} disabled={!configured} />
        ))}
      </Section>

      <Section title="演示数据" hint="录 demo 或试用时可复现">
        <View style={styles.demoCard}>
          <Text style={styles.demoText}>
            载入一组光化学场景：同一个反应，用校准过的灯得到 82% 与 78%，
            换成没校准的灯并把体积从 2 mL 放大到 8 mL 后只剩 12% 与 9%——化学条件完全一致。
            这正是反应诊断该抓住的差异。
          </Text>
          <View style={styles.demoActions}>
            {demoLoaded && (
              <Pressable
                style={styles.demoSecondary}
                onPress={async () => {
                  setDemoBusy(true);
                  await clearDemoData();
                  setDemoLoaded(false);
                  setExperimentCount((await listExperiments()).length);
                  setLightCount(await countLightSources());
                  setDemoBusy(false);
                }}
                disabled={demoBusy}
              >
                <Text style={styles.demoSecondaryLabel}>清除</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.demoPrimary}
              disabled={demoBusy}
              onPress={async () => {
                setDemoBusy(true);
                try {
                  const summary = await loadDemoData();
                  setDemoLoaded(true);
                  setExperimentCount((await listExperiments()).length);
                  setLightCount(await countLightSources());
                  Alert.alert("已载入", `${summary.experiments} 条实验记录、${summary.lightSources} 台光源。现在可以打开反应诊断。`);
                } catch (error) {
                  Alert.alert("载入失败", error instanceof Error ? error.message : String(error));
                } finally {
                  setDemoBusy(false);
                }
              }}
            >
              {demoBusy ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Text style={styles.demoPrimaryLabel}>{demoLoaded ? "重新载入" : "载入演示数据"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Section>

      {!configured && (
        <Pressable style={styles.gate} onPress={() => router.push("/settings")}>
          <Ionicons name="key-outline" size={16} color={theme.accent} />
          <Text style={styles.gateText}>需要模型的功能还没配好 API 信息，点这里去设置</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Card({ card, disabled }: { card: ModuleCard; disabled?: boolean }) {
  const primary = card.tone === "primary";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        primary && styles.cardPrimary,
        pressed && styles.cardPressed,
        disabled && styles.cardDisabled,
      ]}
      onPress={() => router.push(card.href as never)}
    >
      <View style={[styles.iconWrap, primary && styles.iconWrapPrimary]}>
        <Ionicons name={card.icon} size={primary ? 24 : 20} color={primary ? theme.onAccent : theme.accent} />
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, primary && styles.cardTitlePrimary]}>{card.title}</Text>
        <Text style={[styles.cardSubtitle, primary && styles.cardSubtitlePrimary]}>{card.subtitle}</Text>
        {card.badge ? (
          <Text style={[styles.cardBadge, primary && styles.cardBadgePrimary]}>{card.badge}</Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={primary ? theme.onAccent : theme.textFaint}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.space(4), paddingBottom: theme.space(10), gap: theme.space(5) },
  lead: { color: theme.textDim, fontSize: 13, lineHeight: 20 },
  section: { gap: theme.space(2.5) },
  sectionHead: { flexDirection: "row", alignItems: "baseline", gap: theme.space(2) },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
  sectionHint: { color: theme.textFaint, fontSize: 11 },
  sectionBody: { gap: theme.space(2.5) },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(3),
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(4),
  },
  cardPrimary: { backgroundColor: theme.accent, borderColor: theme.accent },
  cardPressed: { opacity: 0.75 },
  cardDisabled: { opacity: 0.55 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accentDim,
  },
  iconWrapPrimary: { backgroundColor: "rgba(255,255,255,0.18)" },
  cardBody: { flex: 1, gap: theme.space(1) },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  cardTitlePrimary: { color: theme.onAccent, fontSize: 17 },
  cardSubtitle: { color: theme.textDim, fontSize: 12.5, lineHeight: 18 },
  cardSubtitlePrimary: { color: "rgba(255,250,245,0.9)" },
  cardBadge: { color: theme.textFaint, fontSize: 11, marginTop: theme.space(0.5) },
  cardBadgePrimary: { color: "rgba(255,250,245,0.75)" },
  chevron: { marginLeft: theme.space(1) },
  gate: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(2),
    backgroundColor: theme.accentDim,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
  },
  gateText: { color: theme.text, fontSize: 13, flex: 1 },
  demoCard: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(3),
  },
  demoText: { color: theme.textDim, fontSize: 12.5, lineHeight: 19 },
  demoActions: { flexDirection: "row", gap: theme.space(2.5), justifyContent: "flex-end" },
  demoSecondary: { paddingHorizontal: theme.space(3.5), paddingVertical: theme.space(2), justifyContent: "center" },
  demoSecondaryLabel: { color: theme.textDim, fontSize: 13 },
  demoPrimary: {
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2.5),
    minWidth: 120,
    alignItems: "center",
  },
  demoPrimaryLabel: { color: theme.accent, fontSize: 13, fontWeight: "600" },
});
