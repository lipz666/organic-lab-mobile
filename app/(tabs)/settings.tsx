import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSettings } from "../../src/config/SettingsContext";
import { DEFAULT_MODEL } from "../../src/config/settings";
import { listModels, normalizeBaseUrl } from "../../src/agent/provider";
import { RdkitStatus } from "../../src/ui/RdkitStatus";
import { theme } from "../../src/ui/theme";

type Probe =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; models: string[] }
  | { state: "failed"; message: string };

export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model || DEFAULT_MODEL);
  const [streaming, setStreaming] = useState(settings.streamingEnabled);
  const [semantic, setSemantic] = useState(settings.semanticSearchEnabled);
  const [probe, setProbe] = useState<Probe>({ state: "idle" });
  const [saved, setSaved] = useState(false);

  const persist = async (overrides: Partial<typeof settings> = {}) => {
    await update({
      baseUrl,
      apiKey,
      model,
      streamingEnabled: streaming,
      semanticSearchEnabled: semantic,
      ...overrides,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const test = async () => {
    setProbe({ state: "testing" });
    try {
      const models = await listModels({ baseUrl, apiKey });
      setProbe({ state: "ok", models });
      // 连通即保存，省掉用户测完还要再点一次保存。
      await persist();
    } catch (error) {
      setProbe({ state: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          填入任意 OpenAI 兼容的接口。请求从这台手机直接发到你填的地址，不经过我们的服务器；
          Key 存在系统钥匙串里，实验数据只存在本机。
        </Text>

        <Field label="Base URL" hint="例如 https://api.example.com，末尾的 /v1 可不填">
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://api.example.com"
            placeholderTextColor={theme.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        <Field label="API Key">
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-..."
            placeholderTextColor={theme.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </Field>

        <Field label="模型" hint="点下方“测试连接”后可从可用列表里选">
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholder={DEFAULT_MODEL}
            placeholderTextColor={theme.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={test}
          disabled={probe.state === "testing" || !baseUrl.trim() || !apiKey.trim()}
        >
          {probe.state === "testing" ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <Text style={styles.buttonLabel}>测试连接并保存</Text>
          )}
        </Pressable>

        {probe.state === "failed" && <Text style={styles.error}>{probe.message}</Text>}
        {probe.state === "ok" && (
          <View style={styles.modelBox}>
            <Text style={styles.ok}>连接正常，{probe.models.length} 个可用模型</Text>
            <Text style={styles.hint}>{normalizeBaseUrl(baseUrl)}/v1</Text>
            <View style={styles.chips}>
              {probe.models.map((candidate) => (
                <Pressable
                  key={candidate}
                  onPress={() => {
                    setModel(candidate);
                    void persist({ model: candidate });
                  }}
                  style={[styles.chip, candidate === model && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, candidate === model && styles.chipLabelActive]}>{candidate}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Toggle
          label="流式输出"
          hint="关闭后等模型答完一次性显示。个别端点不支持流式，回答不出来时可以关掉试试。"
          value={streaming}
          onChange={(next) => {
            setStreaming(next);
            void persist({ streamingEnabled: next });
          }}
        />

        <Toggle
          label="语义检索"
          hint="开启后检索实验记录时会把记录文本发到你配置的 API 生成向量。关闭则只用本机全文检索，完全离线。"
          value={semantic}
          onChange={(next) => {
            setSemantic(next);
            void persist({ semanticSearchEnabled: next });
          }}
        />

        <RdkitStatus />

        {saved && <Text style={styles.ok}>已保存</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accentDim, false: theme.border }}
        thumbColor={value ? theme.accent : theme.textDim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  content: { padding: theme.space(4), gap: theme.space(5), paddingBottom: theme.space(12) },
  lead: { color: theme.textDim, fontSize: 13, lineHeight: 20, backgroundColor: theme.accentDim, borderRadius: 16, padding: theme.space(4) },
  field: { gap: theme.space(2) },
  label: { color: theme.text, fontSize: 14, fontWeight: "600" },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    color: theme.text,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(3),
    fontSize: 15,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 16,
    paddingVertical: theme.space(3.5),
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.75 },
  buttonLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
  error: { color: theme.danger, fontSize: 13, lineHeight: 19 },
  ok: { color: theme.success, fontSize: 13 },
  modelBox: { gap: theme.space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  chipLabel: { color: theme.textDim, fontSize: 12 },
  chipLabelActive: { color: theme.text, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: theme.space(4),
  },
});
