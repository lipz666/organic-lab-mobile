/**
 * API 配置的读写。
 *
 * Key 走系统钥匙串（见 secureStorage），其余非敏感项走 SQLite 的 app_settings 表。
 * 两者都不会离开这台手机。
 */

import { getDatabase } from "../db";
import { readApiKey, writeApiKey } from "./secureStorage";

export const DEFAULT_MODEL = "gemini-3.7-flash-high";
export const DEFAULT_BASE_URL = "";

export type Settings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 语义检索会把记录文本发给用户配置的 API，所以默认关闭，由用户显式开启。 */
  semanticSearchEnabled: boolean;
  streamingEnabled: boolean;
};

export const EMPTY_SETTINGS: Settings = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: "",
  model: DEFAULT_MODEL,
  semanticSearchEnabled: false,
  streamingEnabled: true,
};

async function readAll(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM app_settings");
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function write(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export async function loadSettings(): Promise<Settings> {
  const stored = await readAll();
  const apiKey = await readApiKey();
  return {
    baseUrl: stored.base_url ?? DEFAULT_BASE_URL,
    apiKey,
    model: stored.model ?? DEFAULT_MODEL,
    semanticSearchEnabled: stored.semantic_search === "1",
    streamingEnabled: (stored.streaming ?? "1") === "1",
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await write("base_url", settings.baseUrl.trim());
  await write("model", settings.model.trim());
  await write("semantic_search", settings.semanticSearchEnabled ? "1" : "0");
  await write("streaming", settings.streamingEnabled ? "1" : "0");
  await writeApiKey(settings.apiKey.trim());
}

export function isConfigured(settings: Settings): boolean {
  return Boolean(settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim());
}
