import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import type {
  AppSettings,
  CollectionRow,
  EnvironmentRow,
  HistoryRow,
  SavedRequestRow,
  SaveHistoryInput,
  SaveRequestInput,
  UpsertEnvironmentInput,
  VariableItem,
} from "../shared/types";
import { DEFAULT_SETTINGS, defaultAuth } from "../shared/types";

const require = createRequire(import.meta.url);

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let dbPath = "";

function getDb(): Database {
  if (!db) throw new Error("数据库未初始化");
  return db;
}

function persist(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export async function initDb(userDataPath: string): Promise<void> {
  fs.mkdirSync(userDataPath, { recursive: true });
  dbPath = path.join(userDataPath, "tinypost.db");

  // sql.js >=1.13 的 exports 不包含 package.json，改从主入口解析到 dist/
  const sqlJsDist = path.dirname(require.resolve("sql.js"));
  SQL = await initSqlJs({
    locateFile: (file) => {
      const packaged = path.join(process.resourcesPath || "", file);
      if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
      return path.join(sqlJsDist, file);
    },
  });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  migrate();
  persist();
}

function migrate(): void {
  const database = getDb();
  database.run(`
CREATE TABLE IF NOT EXISTS request_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  request_headers TEXT NOT NULL DEFAULT '[]',
  request_body TEXT NOT NULL DEFAULT '',
  status INTEGER,
  response_headers TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  variables TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS saved_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '{"type":"none"}',
  query TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

  ensureColumn("saved_requests", "auth", `TEXT NOT NULL DEFAULT '{"type":"none"}'`);
  ensureColumn("saved_requests", "query", `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn("saved_requests", "meta", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("request_history", "auth", `TEXT NOT NULL DEFAULT '{"type":"none"}'`);
  ensureColumn("request_history", "query", `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn("request_history", "meta", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("environments", "tls", `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn("environments", "cookies", `TEXT NOT NULL DEFAULT '{"enabled":true,"items":[]}'`);
}

function tableColumns(table: string): string[] {
  const cols = getDb().exec(`PRAGMA table_info(${table})`);
  return cols[0]?.values.map((row) => String(row[1])) || [];
}

function ensureColumn(table: string, name: string, definition: string): void {
  if (!tableColumns(table).includes(name)) {
    getDb().run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as never[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function run(sql: string, params: unknown[] = []): number {
  getDb().run(sql, params as never[]);
  const id = Number(
    getDb().exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0,
  );
  persist();
  return id;
}

export function saveHistory(input: SaveHistoryInput): void {
  run(
    `INSERT INTO request_history
      (method, url, request_headers, request_body, status, response_headers,
       response_body, duration_ms, auth, query, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.method,
      input.url,
      JSON.stringify(input.headers),
      input.body,
      input.response.status,
      JSON.stringify(input.response.headers),
      input.response.body,
      input.response.durationMs,
      JSON.stringify(input.auth || defaultAuth()),
      input.query || "[]",
      input.meta || "{}",
    ],
  );
}

export function listHistory(limit = 50): HistoryRow[] {
  return queryAll<HistoryRow>(
    `SELECT id, method, url, request_headers, request_body, status,
            response_headers, response_body, duration_ms, created_at, auth, query, meta
     FROM request_history
     ORDER BY id DESC
     LIMIT ?`,
    [limit],
  );
}

export function clearHistory(): void {
  run("DELETE FROM request_history");
}

export function listEnvironments(): EnvironmentRow[] {
  return queryAll<EnvironmentRow>(
    `SELECT id, name, variables, is_active, created_at, tls, cookies
     FROM environments
     ORDER BY id ASC`,
  );
}

export function ensureDefaultEnvironment(): EnvironmentRow[] {
  let envs = listEnvironments();
  if (envs.length === 0) {
    run(
      `INSERT INTO environments (name, variables, is_active)
       VALUES (?, ?, 1)`,
      [
        "本地",
        JSON.stringify([
          { key: "baseUrl", value: "http://127.0.0.1:8080" },
          { key: "token", value: "" },
        ] satisfies VariableItem[]),
      ],
    );
    envs = listEnvironments();
  }
  return envs;
}

export function setActiveEnvironment(id: number): void {
  run("UPDATE environments SET is_active = 0");
  run("UPDATE environments SET is_active = 1 WHERE id = ?", [id]);
}

export function upsertEnvironment(input: UpsertEnvironmentInput): number {
  const variables = JSON.stringify(input.variables);
  const tls = JSON.stringify(input.tls ?? { certPath: "", keyPath: "", caPath: "" });
  const cookies = input.cookies ? JSON.stringify(input.cookies) : null;
  if (input.id) {
    if (cookies == null) {
      run(`UPDATE environments SET name = ?, variables = ?, tls = ? WHERE id = ?`, [
        input.name,
        variables,
        tls,
        input.id,
      ]);
    } else {
      run(`UPDATE environments SET name = ?, variables = ?, tls = ?, cookies = ? WHERE id = ?`, [
        input.name,
        variables,
        tls,
        cookies,
        input.id,
      ]);
    }
    if (input.makeActive) setActiveEnvironment(input.id);
    return input.id;
  }
  if (input.makeActive) run("UPDATE environments SET is_active = 0");
  return run(
    `INSERT INTO environments (name, variables, is_active, tls, cookies)
     VALUES (?, ?, ?, ?, ?)`,
    [input.name, variables, input.makeActive ? 1 : 0, tls, cookies ?? '{"enabled":true,"items":[]}'],
  );
}

export function deleteEnvironment(id: number): void {
  run("DELETE FROM environments WHERE id = ?", [id]);
  const remaining = listEnvironments();
  if (remaining.length > 0 && !remaining.some((e) => e.is_active === 1)) {
    setActiveEnvironment(remaining[0].id);
  }
}

export function listCollections(): CollectionRow[] {
  return queryAll<CollectionRow>(
    `SELECT id, name, created_at FROM collections ORDER BY id DESC`,
  );
}

export function createCollection(name: string): number {
  return run(`INSERT INTO collections (name) VALUES (?)`, [name]);
}

export function renameCollection(id: number, name: string): void {
  run("UPDATE collections SET name = ? WHERE id = ?", [name, id]);
}

export function deleteCollection(id: number): void {
  run("DELETE FROM saved_requests WHERE collection_id = ?", [id]);
  run("DELETE FROM collections WHERE id = ?", [id]);
}

export function listSavedRequests(collectionId?: number): SavedRequestRow[] {
  if (collectionId != null) {
    return queryAll<SavedRequestRow>(
      `SELECT id, collection_id, name, method, url, headers, body, auth, query, meta, created_at
       FROM saved_requests
       WHERE collection_id = ?
       ORDER BY id ASC`,
      [collectionId],
    );
  }
  return queryAll<SavedRequestRow>(
    `SELECT id, collection_id, name, method, url, headers, body, auth, query, meta, created_at
     FROM saved_requests
     ORDER BY id DESC`,
  );
}

export function saveRequest(input: SaveRequestInput): number {
  const headers = JSON.stringify(input.headers);
  const auth = JSON.stringify(input.auth || defaultAuth());
  const query = input.query || "[]";
  const meta = input.meta || "{}";
  if (input.id) {
    run(
      `UPDATE saved_requests
       SET collection_id = ?, name = ?, method = ?, url = ?,
           headers = ?, body = ?, auth = ?, query = ?, meta = ?
       WHERE id = ?`,
      [
        input.collectionId,
        input.name,
        input.method,
        input.url,
        headers,
        input.body,
        auth,
        query,
        meta,
        input.id,
      ],
    );
    return input.id;
  }
  return run(
    `INSERT INTO saved_requests
      (collection_id, name, method, url, headers, body, auth, query, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.collectionId,
      input.name,
      input.method,
      input.url,
      headers,
      input.body,
      auth,
      query,
      meta,
    ],
  );
}

export function renameSavedRequest(id: number, name: string): void {
  run("UPDATE saved_requests SET name = ? WHERE id = ?", [name, id]);
}

export function deleteSavedRequest(id: number): void {
  run("DELETE FROM saved_requests WHERE id = ?", [id]);
}

export function getSettings(): AppSettings {
  const rows = queryAll<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const timeoutMs = Number(map.timeoutMs);
  return {
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs >= 1000
        ? timeoutMs
        : DEFAULT_SETTINGS.timeoutMs,
    insecure: map.insecure === "1",
    followRedirects: map.followRedirects !== "0",
  };
}

export function saveSettings(settings: AppSettings): void {
  upsertSetting("timeoutMs", String(settings.timeoutMs));
  upsertSetting("insecure", settings.insecure ? "1" : "0");
  upsertSetting("followRedirects", settings.followRedirects ? "1" : "0");
}

function upsertSetting(key: string, value: string): void {
  run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}

export function backupDatabase(destPath: string): void {
  if (!db || !dbPath) throw new Error("数据库未初始化");
  persist();
  fs.copyFileSync(dbPath, destPath);
}

export function restoreDatabase(srcPath: string): void {
  if (!SQL || !dbPath) throw new Error("数据库未初始化");
  if (!fs.existsSync(srcPath)) throw new Error("备份文件不存在");
  const bytes = fs.readFileSync(srcPath);
  let probe: Database | null = null;
  try {
    probe = new SQL.Database(bytes);
    probe.exec("SELECT name FROM sqlite_master LIMIT 1");
  } catch {
    throw new Error("该文件不是有效的 TinyPost 数据库备份");
  } finally {
    probe?.close();
  }

  if (db) {
    persist();
    db.close();
    db = null;
  }
  const safety = `${dbPath}.before-restore`;
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safety);
  try {
    fs.copyFileSync(srcPath, dbPath);
    db = new SQL.Database(fs.readFileSync(dbPath));
    migrate();
    persist();
    fs.rmSync(safety, { force: true });
  } catch (error) {
    if (fs.existsSync(safety)) fs.copyFileSync(safety, dbPath);
    if (SQL && fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
      migrate();
    }
    throw error instanceof Error ? error : new Error("恢复失败");
  }
}
