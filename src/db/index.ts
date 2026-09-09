/**
 * SQLite 连接与迁移。
 *
 * 数据库文件在 app 的私有目录里，只有本机、本 app 能读。没有服务器，没有同步，
 * 所以 M2 之后必须补导出功能——这是无服务器设计欠下的债。
 */

import * as SQLite from "expo-sqlite";

import { MIGRATIONS } from "./schema";

const DATABASE_NAME = "organic-lab.db";

let handle: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    await db.withTransactionAsync(async () => {
      for (const statement of MIGRATIONS[version]) {
        await db.execAsync(statement);
      }
    });
    // PRAGMA 不接受参数绑定，而 version 来自我们自己的数组下标，不是外部输入。
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;
  // 并发调用（多个组件同时挂载）只能开一次库，否则迁移会跑两遍。
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL");
      await db.execAsync("PRAGMA foreign_keys = ON");
      await migrate(db);
      handle = db;
      return db;
    })();
  }
  return opening;
}

export function newId(): string {
  // RN 的 Hermes 有 crypto.randomUUID（expo-crypto 会补齐），够用且不引额外依赖。
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function now(): string {
  return new Date().toISOString();
}
