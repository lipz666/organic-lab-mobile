import { Ionicons } from "@expo/vector-icons";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { extractRecord } from "../../src/agent/extraction";
import { useSettings } from "../../src/config/SettingsContext";
import {
  addAttachment,
  createDraft,
  draftFromExtraction,
  listExperiments,
  searchExperiments,
  type Experiment,
} from "../../src/db/repo/experiments";
import { capturePhoto, pickPhoto, type PreparedPhoto } from "../../src/services/photo";
import { theme } from "../../src/ui/theme";

export default function RecordsScreen() {
  const { settings, configured } = useSettings();
  const [records, setRecords] = useState<Experiment[]>([]);
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async (search: string) => {
    setRecords(search.trim() ? await searchExperiments(search) : await listExperiments());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh(query);
    }, [refresh, query]),
  );

  const ingest = useCallback(
    async (take: () => Promise<PreparedPhoto | null>) => {
      try {
        setWorking("正在读取照片…");
        const photo = await take();
        if (!photo) return;

        setWorking("模型正在识读…");
        const extracted = await extractRecord(
          { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
          photo.base64,
          photo.mimeType,
        );

        const id = await createDraft(draftFromExtraction(extracted), "vision");
        await addAttachment(id, photo.uri, "原始记录照片");
        router.push({ pathname: "/draft/[id]", params: { id } });
      } catch (error) {
        Alert.alert("识读失败", error instanceof Error ? error.message : String(error));
      } finally {
        setWorking(null);
      }
    },
    [settings],
  );

  if (!configured) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>还没填 API 信息</Text>
        <Text style={styles.gateBody}>照片识读要调用你配置的多模态模型，先去设置里填一组接口信息。</Text>
        <Link href="/settings" style={styles.gateLink}>
          去设置 →
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={theme.textDim} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            void refresh(text);
          }}
          placeholder="搜编号、试剂、条件、观察"
          placeholderTextColor={theme.textDim}
        />
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Row record={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            还没有记录。拍一页实验记录本试试——识读出来的一切都是草稿，你核对确认后才会入库。
          </Text>
        }
      />

      {working ? (
        <View style={styles.working}>
          <ActivityIndicator color={theme.accent} />
          <Text style={styles.workingLabel}>{working}</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => ingest(pickPhoto)}>
            <Ionicons name="images-outline" size={18} color={theme.text} />
            <Text style={styles.secondaryLabel}>从相册</Text>
          </Pressable>
          <Pressable style={styles.primary} onPress={() => ingest(capturePhoto)}>
            <Ionicons name="camera" size={18} color={theme.onAccent} />
            <Text style={styles.primaryLabel}>拍记录本</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Row({ record }: { record: Experiment }) {
  const summary = [
    record.solvent,
    record.temperatureC !== null && `${record.temperatureC} °C`,
    record.durationHours !== null && `${record.durationHours} h`,
    record.yieldPercent !== null && `产率 ${record.yieldPercent}%`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      style={styles.row}
      onPress={() =>
        record.status === "draft"
          ? router.push({ pathname: "/draft/[id]", params: { id: record.id } })
          : router.push({ pathname: "/record/[id]", params: { id: record.id } })
      }
    >
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {record.code ?? record.title ?? "未命名记录"}
        </Text>
        {record.status === "draft" && <Text style={styles.draftTag}>草稿</Text>}
      </View>
      {record.title && record.code ? (
        <Text style={styles.rowSub} numberOfLines={1}>
          {record.title}
        </Text>
      ) : null}
      {summary ? <Text style={styles.rowMeta}>{summary}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  gate: { flex: 1, backgroundColor: theme.bg, padding: theme.space(6), justifyContent: "center", gap: theme.space(3) },
  gateTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  gateBody: { color: theme.textDim, fontSize: 14, lineHeight: 21 },
  gateLink: { color: theme.accent, fontSize: 15, marginTop: theme.space(2) },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(2),
    margin: theme.space(3),
    paddingHorizontal: theme.space(3),
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
  },
  search: { flex: 1, color: theme.text, fontSize: 15, paddingVertical: theme.space(2.5) },
  list: { paddingHorizontal: theme.space(3), gap: theme.space(2), paddingBottom: theme.space(4) },
  empty: { color: theme.textDim, fontSize: 13, lineHeight: 20, textAlign: "center", paddingVertical: theme.space(12) },
  row: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    padding: theme.space(3.5),
    gap: theme.space(1),
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: theme.space(2) },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: "600", flex: 1 },
  draftTag: {
    color: theme.accent,
    fontSize: 11,
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: theme.space(2),
    paddingVertical: 1,
    overflow: "hidden",
  },
  rowSub: { color: theme.textDim, fontSize: 13 },
  rowMeta: { color: theme.textDim, fontSize: 12 },
  actions: {
    flexDirection: "row",
    gap: theme.space(3),
    padding: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.bg,
  },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(2),
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingVertical: theme.space(3.5),
  },
  secondaryLabel: { color: theme.text, fontSize: 15 },
  primary: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(2),
    backgroundColor: theme.accent,
    borderRadius: 16,
    paddingVertical: theme.space(3.5),
  },
  primaryLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
  working: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(3),
    padding: theme.space(5),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  workingLabel: { color: theme.textDim, fontSize: 14 },
});
