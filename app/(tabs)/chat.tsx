import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Link } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { extractSmilesCandidates } from "../../src/agent/context";
import { runTurn, type LoopEvent } from "../../src/agent/loop";
import { TOOLS } from "../../src/agent/tools";
import type { ChatMessage, ToolCall } from "../../src/agent/provider";
import { useSettings } from "../../src/config/SettingsContext";
import {
  createSession,
  latestOrNewSession,
  listSessions,
  loadHistory,
  sqliteTurnStore,
  type Session,
} from "../../src/db/repo/sessions";
import { theme } from "../../src/ui/theme";
import { RichText } from "../../src/ui/RichText";
import { Structure } from "../../src/ui/Structure";

type Item =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string }
  | { kind: "tool"; key: string; name: string; status: "running" | "ok" | "failed"; summary: string }
  | { kind: "error"; key: string; text: string }
  | { kind: "notice"; key: string; text: string }
  | { kind: "structures"; key: string; smiles: string[] };

let counter = 0;
const nextKey = () => `item-${(counter += 1)}`;

/** 一条回答里最多画几个结构。超过这个数量屏幕上就全是图，反而看不清。 */
const MAX_STRUCTURES = 4;

/** 从一段回答里取出要画的结构。生成时和重放历史时都走这里。 */
function structuresFrom(text: string): Item | null {
  const smiles = extractSmilesCandidates(text).slice(0, MAX_STRUCTURES);
  return smiles.length > 0 ? { kind: "structures", key: nextKey(), smiles } : null;
}

/** 把落库的历史还原成气泡。工具结果只保留“调用过什么”，正文不回显——太长且对人无用。 */
function historyToItems(history: ChatMessage[]): Item[] {
  const items: Item[] = [];
  for (const message of history) {
    if (message.role === "user") {
      items.push({ kind: "user", key: nextKey(), text: typeof message.content === "string" ? message.content : "" });
    } else if (message.role === "assistant") {
      if (message.content) {
        items.push({ kind: "assistant", key: nextKey(), text: message.content });
        // 结构卡片在回答生成时是即时插入的；重放历史时要重新抽一遍，
        // 否则重开会话结构图就凭空消失了。
        const structures = structuresFrom(message.content);
        if (structures) items.push(structures);
      }
      for (const call of (message.tool_calls ?? []) as ToolCall[]) {
        items.push({ kind: "tool", key: nextKey(), name: call.function.name, status: "ok", summary: "" });
      }
    }
  }
  return items;
}

export default function ChatScreen() {
  const { settings, configured } = useSettings();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const listRef = useRef<FlatList<Item>>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 流式增量每帧都 setState 会掉帧，用 ref 攒住文本，只更新最后一条气泡。
  const streamingKey = useRef<string | null>(null);

  const openSession = useCallback(async (target: Session) => {
    setSession(target);
    setItems(historyToItems(await loadHistory(target.id)));
  }, []);

  useEffect(() => {
    latestOrNewSession().then(openSession);
  }, [openSession]);

  useEffect(() => {
    if (items.length) listRef.current?.scrollToEnd({ animated: true });
  }, [items]);

  const handleEvent = useCallback((event: LoopEvent) => {
    setItems((current) => {
      switch (event.type) {
        case "delta": {
          const last = current[current.length - 1];
          if (last?.kind === "assistant" && last.key === streamingKey.current) {
            return [...current.slice(0, -1), { ...last, text: last.text + event.text }];
          }
          const key = nextKey();
          streamingKey.current = key;
          return [...current, { kind: "assistant", key, text: event.text }];
        }
        case "tool_start": {
          streamingKey.current = null;
          return [...current, { kind: "tool", key: `tool-${event.id}`, name: event.name, status: "running", summary: "" }];
        }
        case "tool_end":
          return current.map((item) =>
            item.kind === "tool" && item.key === `tool-${event.id}`
              ? { ...item, status: event.ok ? "ok" : "failed", summary: event.summary }
              : item,
          );
        case "context_trimmed":
          return [
            ...current,
            {
              kind: "notice",
              key: nextKey(),
              text: `更早的 ${event.droppedTurns} 轮对话已超出上下文长度，本轮没有带上。需要的话请重新说明。`,
            },
          ];
        case "assistant_done": {
          streamingKey.current = null;
          const last = current[current.length - 1];
          // 非流式时没有 delta，收尾这一下才是唯一的文本来源。
          const withText =
            event.text && !(last?.kind === "assistant" && last.text === event.text)
              ? last?.kind === "assistant" && last.text.length > 0
                ? current
                : [...current, { kind: "assistant" as const, key: nextKey(), text: event.text }]
              : current;

          // 回答里提到的结构自动画出来。取整段回答而不只是本次增量，
          // 因为 SMILES 常常跨多个流式分片。
          const answer =
            event.text ||
            (withText[withText.length - 1]?.kind === "assistant"
              ? (withText[withText.length - 1] as { text: string }).text
              : "");
          const structures = structuresFrom(answer);
          return structures ? [...withText, structures] : withText;
        }
        case "error":
          streamingKey.current = null;
          return [...current, { kind: "error", key: nextKey(), text: event.message }];
      }
    });
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !session || busy) return;

    setDraft("");
    setItems((current) => [...current, { kind: "user", key: nextKey(), text }]);
    setBusy(true);
    streamingKey.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    await runTurn({
      config: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
      context: { settings },
      tools: TOOLS,
      store: sqliteTurnStore,
      sessionId: session.id,
      userText: text,
      stream: settings.streamingEnabled,
      signal: controller.signal,
      onEvent: handleEvent,
    });

    abortRef.current = null;
    setBusy(false);
  }, [draft, session, busy, settings, handleEvent]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const startNew = useCallback(async () => {
    setHistoryOpen(false);
    await openSession(await createSession());
  }, [openSession]);

  if (!configured) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateTitle}>还没填 API 信息</Text>
        <Text style={styles.gateBody}>
          填一组 OpenAI 兼容的 Base URL 和 Key 就能开始。请求从这台手机直接发出去，不经过任何中间服务器。
        </Text>
        <Link href="/settings" style={styles.gateLink}>
          去设置 →
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <View style={styles.bar}>
        <Text style={styles.barTitle} numberOfLines={1}>
          {session?.title ?? "新会话"}
        </Text>
        <Pressable
          onPress={async () => {
            setSessions(await listSessions());
            setHistoryOpen(true);
          }}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={20} color={theme.textDim} />
        </Pressable>
        <Pressable onPress={startNew} hitSlop={8}>
          <Ionicons name="create-outline" size={20} color={theme.textDim} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Bubble item={item} />}
        ListEmptyComponent={<EmptyChat />}
        keyboardDismissMode="interactive"
      />

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, theme.space(2)) }]}>
        <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="问点什么…"
          placeholderTextColor={theme.textDim}
          multiline
          editable={!busy}
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.send, busy && styles.sendBusy]}
          onPress={busy ? stop : send}
          disabled={!busy && !draft.trim()}
        >
          {busy ? (
            <Ionicons name="stop" size={18} color={theme.text} />
          ) : (
            <Ionicons name="arrow-up" size={20} color={draft.trim() ? theme.onAccent : theme.textDim} />
          )}
        </Pressable>
        </View>
        <Text style={styles.composerHint}>模型可能出错；化学结论与实验条件请独立核对。</Text>
      </View>

      <Modal visible={historyOpen} animationType="slide" transparent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setHistoryOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>会话</Text>
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.sessionRow}
                  onPress={async () => {
                    setHistoryOpen(false);
                    await openSession(item);
                  }}
                >
                  <Text style={styles.sessionTitle} numberOfLines={1}>
                    {item.title ?? "未命名会话"}
                  </Text>
                  <Text style={styles.sessionDate}>{item.updatedAt.slice(0, 16).replace("T", " ")}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>还没有会话</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Bubble({ item }: { item: Item }) {
  const [copied, setCopied] = useState(false);

  if (item.kind === "notice") {
    return (
      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={14} color={theme.textDim} />
        <Text style={styles.noticeText}>{item.text}</Text>
      </View>
    );
  }

  // 回答里提到的分子，直接画出来。RDKit 读不出的会自己退回显示 SMILES 原文，
  // 所以这里不用先过滤——那样反而要多跑一趟 WebView。
  if (item.kind === "structures") {
    return (
      <View style={styles.structures}>
        <Text style={styles.structuresLabel}>回答中提到的结构</Text>
        {item.smiles.map((smiles) => (
          <View key={smiles} style={styles.structureItem}>
            <Structure smiles={smiles} height={140} />
            <Text selectable style={styles.structureSmiles}>
              {smiles}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (item.kind === "user") {
    return (
      <View style={styles.userRow}>
        <Text selectable style={styles.userText}>{item.text}</Text>
      </View>
    );
  }
  if (item.kind === "assistant") {
    return (
      <View style={styles.assistantBlock}>
        <View style={styles.assistantIdentity}>
          <View style={styles.spark}>
            <Ionicons name="sparkles" size={13} color={theme.accent} />
          </View>
          <Text style={styles.assistantName}>Organic Lab</Text>
        </View>
        <RichText text={item.text} />
        <View style={styles.messageActions}>
          <Pressable
            style={styles.messageAction}
            hitSlop={8}
            onPress={async () => {
              await Clipboard.setStringAsync(item.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color={copied ? theme.success : theme.textDim} />
            <Text style={[styles.messageActionLabel, copied && styles.copiedLabel]}>{copied ? "已复制" : "复制"}</Text>
          </Pressable>
          <Text style={styles.selectionHint}>长按正文可框选</Text>
        </View>
      </View>
    );
  }
  if (item.kind === "error") {
    return (
      <View style={styles.errorBox}>
        <Text selectable style={styles.errorText}>{item.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.toolRow}>
      {item.status === "running" ? (
        <ActivityIndicator size="small" color={theme.textDim} />
      ) : (
        <Ionicons
          name={item.status === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
          size={15}
          color={item.status === "ok" ? theme.success : theme.danger}
        />
      )}
      <Text style={styles.toolName}>{item.name}</Text>
      {item.summary ? (
        <Text style={styles.toolSummary} numberOfLines={1}>
          {item.summary}
        </Text>
      ) : null}
    </View>
  );
}

function EmptyChat() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyMark}>
        <Ionicons name="sparkles" size={24} color={theme.accent} />
      </View>
      <Text style={styles.emptyTitle}>今天想研究什么？</Text>
      <Text style={styles.emptyBody}>可以讨论机理、核算投料、检查结构，或从一个目标分子开始规划路线。</Text>
      <View style={styles.suggestions}>
        <Text style={styles.suggestion}>解释这一步反应的可能机理</Text>
        <Text style={styles.suggestion}>帮我检查 SMILES 与分子量</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(1.5),
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
  },
  noticeText: { color: theme.textDim, fontSize: 11.5, flex: 1, lineHeight: 17 },
  structures: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(2.5),
  },
  structuresLabel: { color: theme.textFaint, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3 },
  structureItem: { gap: theme.space(1) },
  structureSmiles: { color: theme.textDim, fontSize: 11, fontFamily: "Menlo" },
  root: { flex: 1, backgroundColor: theme.bg },
  gate: { flex: 1, backgroundColor: theme.bg, padding: theme.space(6), justifyContent: "center", gap: theme.space(3) },
  gateTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  gateBody: { color: theme.textDim, fontSize: 14, lineHeight: 21 },
  gateLink: { color: theme.accent, fontSize: 15, marginTop: theme.space(2) },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(4),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
  },
  barTitle: { flex: 1, color: theme.textDim, fontSize: 13, fontWeight: "500" },
  list: { paddingHorizontal: theme.space(4), paddingTop: theme.space(3), paddingBottom: theme.space(6), gap: theme.space(4.5) },
  empty: { color: theme.textDim, fontSize: 13, lineHeight: 20, textAlign: "center", paddingVertical: theme.space(10) },
  userRow: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: theme.surfaceStrong,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
  },
  userText: { color: theme.text, fontSize: 15.5, lineHeight: 23 },
  assistantBlock: { gap: theme.space(2.5), paddingHorizontal: theme.space(1) },
  assistantIdentity: { flexDirection: "row", alignItems: "center", gap: theme.space(2) },
  spark: { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
  assistantName: { color: theme.text, fontSize: 12.5, fontWeight: "700", letterSpacing: 0.2 },
  messageActions: { flexDirection: "row", alignItems: "center", gap: theme.space(3), paddingTop: theme.space(1) },
  messageAction: { flexDirection: "row", alignItems: "center", gap: theme.space(1.5), paddingVertical: theme.space(1) },
  messageActionLabel: { color: theme.textDim, fontSize: 11.5 },
  copiedLabel: { color: theme.success },
  selectionHint: { color: theme.textFaint, fontSize: 10.5 },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space(2),
    backgroundColor: theme.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
  },
  toolName: { color: theme.textDim, fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  toolSummary: { color: theme.textDim, fontSize: 12, flex: 1 },
  errorBox: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.danger,
    padding: theme.space(3),
  },
  errorText: { color: theme.danger, fontSize: 13, lineHeight: 19 },
  composerWrap: {
    gap: theme.space(1.5),
    paddingHorizontal: theme.space(3),
    paddingTop: theme.space(2),
    backgroundColor: theme.bg,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.space(2),
    padding: theme.space(2),
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: 24,
  },
  input: {
    flex: 1,
    color: theme.text,
    fontSize: 15,
    maxHeight: 140,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    backgroundColor: "transparent",
    borderRadius: 18,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBusy: { backgroundColor: theme.surfaceAlt },
  composerHint: { color: theme.textFaint, fontSize: 9.5, textAlign: "center" },
  emptyState: { alignItems: "center", paddingHorizontal: theme.space(4), paddingTop: theme.space(16), gap: theme.space(3) },
  emptyMark: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: theme.text, fontSize: 23, fontWeight: "600" },
  emptyBody: { color: theme.textDim, fontSize: 13.5, lineHeight: 20, textAlign: "center", maxWidth: 310 },
  suggestions: { width: "100%", gap: theme.space(2), marginTop: theme.space(2) },
  suggestion: { color: theme.textDim, fontSize: 12.5, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 14, padding: theme.space(3), textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.space(4),
    maxHeight: "70%",
  },
  sheetTitle: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: theme.space(3) },
  sessionRow: { paddingVertical: theme.space(3), borderBottomWidth: 1, borderBottomColor: theme.border },
  sessionTitle: { color: theme.text, fontSize: 15 },
  sessionDate: { color: theme.textDim, fontSize: 12, marginTop: theme.space(1) },
});
