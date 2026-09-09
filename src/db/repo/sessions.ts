/**
 * 会话与轮次的持久化。
 *
 * 服务器版把上下文交给 Hermes 自己管，这里没有那个进程，所以对话历史由我们存、
 * 每轮从库里重建。工具调用和工具结果也一并落库——少存任何一条，
 * 下一轮回放时 tool_call_id 就对不上，模型会直接报错。
 */

import { getDatabase, newId, now } from "..";
import type { ChatMessage, ToolCall } from "../../agent/provider";

export type Session = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type TurnRow = {
  role: string;
  content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
};

export async function createSession(title?: string): Promise<Session> {
  const db = await getDatabase();
  const timestamp = now();
  const session: Session = { id: newId(), title: title ?? null, createdAt: timestamp, updatedAt: timestamp };
  await db.runAsync(
    "INSERT INTO agent_sessions (id, title, project_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)",
    session.id,
    session.title,
    session.createdAt,
    session.updatedAt,
  );
  return session;
}

export async function listSessions(limit = 50): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; title: string | null; created_at: string; updated_at: string }>(
    "SELECT id, title, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC LIMIT ?",
    limit,
  );
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function latestOrNewSession(): Promise<Session> {
  const [existing] = await listSessions(1);
  return existing ?? (await createSession());
}

export async function appendTurn(
  sessionId: string,
  message: ChatMessage,
): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ next: number }>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM conversation_turns WHERE session_id = ?",
    sessionId,
  );
  const position = row?.next ?? 0;
  const toolCalls = message.role === "assistant" && message.tool_calls?.length ? JSON.stringify(message.tool_calls) : null;
  const content = typeof message.content === "string" ? message.content : message.content ? JSON.stringify(message.content) : null;

  await db.runAsync(
    `INSERT INTO conversation_turns (id, session_id, role, content, tool_calls, tool_call_id, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    sessionId,
    message.role,
    content,
    toolCalls,
    message.role === "tool" ? message.tool_call_id : null,
    position,
    now(),
  );
  await db.runAsync("UPDATE agent_sessions SET updated_at = ? WHERE id = ?", now(), sessionId);
}

/** 第一条用户消息作为会话标题，省掉让用户手动命名。 */
export async function ensureTitle(sessionId: string, candidate: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ title: string | null }>(
    "SELECT title FROM agent_sessions WHERE id = ?",
    sessionId,
  );
  if (row && !row.title) {
    const title = candidate.replace(/\s+/g, " ").trim().slice(0, 40);
    if (title) await db.runAsync("UPDATE agent_sessions SET title = ? WHERE id = ?", title, sessionId);
  }
}

function parseContent(raw: string | null): string | ChatMessage["content"] {
  if (raw === null) return null;
  if (raw.startsWith("[")) {
    try {
      return JSON.parse(raw) as ChatMessage["content"];
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function loadHistory(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TurnRow>(
    "SELECT role, content, tool_calls, tool_call_id FROM conversation_turns WHERE session_id = ? ORDER BY position",
    sessionId,
  );

  return rows.map((row): ChatMessage => {
    if (row.role === "tool") {
      return { role: "tool", content: row.content ?? "", tool_call_id: row.tool_call_id ?? "" };
    }
    if (row.role === "assistant") {
      const toolCalls = row.tool_calls ? (JSON.parse(row.tool_calls) as ToolCall[]) : undefined;
      return { role: "assistant", content: row.content, ...(toolCalls ? { tool_calls: toolCalls } : {}) };
    }
    return { role: "user", content: (parseContent(row.content) ?? "") as string };
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM agent_sessions WHERE id = ?", sessionId);
}

/** loop.ts 要的 TurnStore，接到 SQLite 上。 */
export const sqliteTurnStore = {
  append: appendTurn,
  history: loadHistory,
  ensureTitle,
};
