import Database from "@tauri-apps/plugin-sql";
import type {
  AuthConfig,
  CollectionRow,
  EnvironmentRow,
  HeaderItem,
  HistoryRow,
  HttpResponsePayload,
  SavedRequestRow,
  VariableItem,
} from "./types";
import { defaultAuth } from "./types";

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

export async function listEnvironments(): Promise<EnvironmentRow[]> {
  const db = await getDb();
  return db.select<EnvironmentRow[]>(
    `SELECT id, name, variables, is_active, created_at
     FROM environments
     ORDER BY id ASC`,
  );
}

export async function ensureDefaultEnvironment(): Promise<EnvironmentRow[]> {
  let envs = await listEnvironments();
  if (envs.length === 0) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO environments (name, variables, is_active)
       VALUES ($1, $2, 1)`,
      [
        "本地",
        JSON.stringify([
          { key: "baseUrl", value: "http://127.0.0.1:8080" },
          { key: "token", value: "" },
        ] satisfies VariableItem[]),
      ],
    );
    envs = await listEnvironments();
  }
  return envs;
}

export async function setActiveEnvironment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE environments SET is_active = 0");
  await db.execute("UPDATE environments SET is_active = 1 WHERE id = $1", [id]);
}

export async function upsertEnvironment(input: {
  id?: number;
  name: string;
  variables: VariableItem[];
  makeActive?: boolean;
}): Promise<number> {
  const db = await getDb();
  const variables = JSON.stringify(input.variables);

  if (input.id) {
    await db.execute(
      `UPDATE environments SET name = $1, variables = $2 WHERE id = $3`,
      [input.name, variables, input.id],
    );
    if (input.makeActive) {
      await setActiveEnvironment(input.id);
    }
    return input.id;
  }

  if (input.makeActive) {
    await db.execute("UPDATE environments SET is_active = 0");
  }

  const result = await db.execute(
    `INSERT INTO environments (name, variables, is_active)
     VALUES ($1, $2, $3)`,
    [input.name, variables, input.makeActive ? 1 : 0],
  );
  return Number(result.lastInsertId);
}

export async function deleteEnvironment(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM environments WHERE id = $1", [id]);
  const remaining = await listEnvironments();
  if (remaining.length > 0 && !remaining.some((e) => e.is_active === 1)) {
    await setActiveEnvironment(remaining[0].id);
  }
}

export async function listCollections(): Promise<CollectionRow[]> {
  const db = await getDb();
  return db.select<CollectionRow[]>(
    `SELECT id, name, created_at FROM collections ORDER BY id DESC`,
  );
}

export async function createCollection(name: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO collections (name) VALUES ($1)`,
    [name],
  );
  return Number(result.lastInsertId);
}

export async function deleteCollection(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM saved_requests WHERE collection_id = $1", [id]);
  await db.execute("DELETE FROM collections WHERE id = $1", [id]);
}

export async function listSavedRequests(
  collectionId?: number,
): Promise<SavedRequestRow[]> {
  const db = await getDb();
  if (collectionId != null) {
    return db.select<SavedRequestRow[]>(
      `SELECT id, collection_id, name, method, url, headers, body, auth, created_at
       FROM saved_requests
       WHERE collection_id = $1
       ORDER BY id ASC`,
      [collectionId],
    );
  }
  return db.select<SavedRequestRow[]>(
    `SELECT id, collection_id, name, method, url, headers, body, auth, created_at
     FROM saved_requests
     ORDER BY id DESC`,
  );
}

export async function saveRequest(input: {
  id?: number;
  collectionId: number;
  name: string;
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
}): Promise<number> {
  const db = await getDb();
  const headers = JSON.stringify(input.headers);
  const auth = JSON.stringify(input.auth || defaultAuth());

  if (input.id) {
    await db.execute(
      `UPDATE saved_requests
       SET collection_id = $1, name = $2, method = $3, url = $4,
           headers = $5, body = $6, auth = $7
       WHERE id = $8`,
      [
        input.collectionId,
        input.name,
        input.method,
        input.url,
        headers,
        input.body,
        auth,
        input.id,
      ],
    );
    return input.id;
  }

  const result = await db.execute(
    `INSERT INTO saved_requests
      (collection_id, name, method, url, headers, body, auth)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.collectionId,
      input.name,
      input.method,
      input.url,
      headers,
      input.body,
      auth,
    ],
  );
  return Number(result.lastInsertId);
}

export async function deleteSavedRequest(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM saved_requests WHERE id = $1", [id]);
}
