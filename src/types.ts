export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface HeaderItem {
  key: string;
  value: string;
}

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthConfig {
  type: AuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyKey?: string;
  apiKeyValue?: string;
}

export interface VariableItem {
  key: string;
  value: string;
}

export interface HttpRequestPayload {
  method: HttpMethod | string;
  url: string;
  headers: HeaderItem[];
  body?: string;
  insecure?: boolean;
}

export interface HttpResponsePayload {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  error?: string | null;
}

export interface HistoryRow {
  id: number;
  method: string;
  url: string;
  request_headers: string;
  request_body: string;
  status: number | null;
  response_headers: string;
  response_body: string;
  duration_ms: number | null;
  created_at: string;
}

export interface EnvironmentRow {
  id: number;
  name: string;
  variables: string;
  is_active: number;
  created_at: string;
}

export interface CollectionRow {
  id: number;
  name: string;
  created_at: string;
}

export interface SavedRequestRow {
  id: number;
  collection_id: number | null;
  name: string;
  method: string;
  url: string;
  headers: string;
  body: string;
  auth: string;
  created_at: string;
}

export function emptyHeader(): HeaderItem {
  return { key: "", value: "" };
}

export function emptyVariable(): VariableItem {
  return { key: "", value: "" };
}

export function defaultAuth(): AuthConfig {
  return { type: "none" };
}
