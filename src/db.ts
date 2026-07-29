import Database from "@tauri-apps/plugin-sql";
import type { HeaderItem, HistoryRow, HttpResponsePayload } from "./types";

const DB_URL = "sqlite:tinypost.db";

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export async function saveHistory(input: {
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  response: HttpResponsePayload;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO request_history
      (method, url, request_headers, request_body, status, response_headers, response_body, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.method,
      input.url,
      JSON.stringify(input.headers),
      input.body,
      input.response.status,
      JSON.stringify(input.response.headers),
      input.response.body,
      input.response.durationMs,
    ],
  );
}

export async function listHistory(limit = 50): Promise<HistoryRow[]> {
  const db = await getDb();
  return db.select<HistoryRow[]>(
    `SELECT id, method, url, request_headers, request_body, status,
            response_headers, response_body, duration_ms, created_at
     FROM request_history
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM request_history");
}
