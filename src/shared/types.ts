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
  enabled?: boolean;
}

export type BodyMode = "raw" | "form-data";

export interface FormField {
  key: string;
  type: "text" | "file";
  value: string;
  fileName?: string;
  contentType?: string;
  enabled?: boolean;
}

export interface ExtractRule {
  path: string;
  variable: string;
  enabled?: boolean;
}

export interface TlsConfig {
  certPath: string;
  keyPath: string;
  caPath: string;
}

export interface TlsRequestConfig {
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  passphrase?: string;
}

export interface MultipartPartPayload {
  name: string;
  text?: string;
  filePath?: string;
  fileName?: string;
  contentType?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface QueryItem {
  key: string;
  value: string;
  enabled?: boolean;
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

export interface AppSettings {
  timeoutMs: number;
  insecure: boolean;
  followRedirects: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  timeoutMs: 60_000,
  insecure: false,
  followRedirects: true,
};

export interface RedirectHop {
  status: number;
  url: string;
  location: string;
}

export interface HttpRequestPayload {
  method: HttpMethod | string;
  url: string;
  headers: HeaderItem[];
  body?: string;
  multipart?: MultipartPartPayload[];
  tls?: TlsRequestConfig;
  insecure?: boolean;
  timeoutMs?: number;
  followRedirects?: boolean;
  requestId?: string;
}

export interface HttpResponsePayload {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  error?: string | null;
  url?: string;
  sizeBytes?: number;
  redirects?: RedirectHop[];
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
  auth: string;
  query: string;
  meta: string;
}

export interface EnvironmentRow {
  id: number;
  name: string;
  variables: string;
  tls: string;
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
  query: string;
  meta: string;
  created_at: string;
}

export interface SaveHistoryInput {
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
  query: string;
  meta?: string;
  response: HttpResponsePayload;
}

export interface SaveRequestInput {
  id?: number;
  collectionId: number;
  name: string;
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
  query?: string;
  meta?: string;
}

export interface UpsertEnvironmentInput {
  id?: number;
  name: string;
  variables: VariableItem[];
  tls?: TlsConfig;
  makeActive?: boolean;
}

export function emptyHeader(): HeaderItem {
  return { key: "", value: "", enabled: true };
}

export function emptyQuery(): QueryItem {
  return { key: "", value: "", enabled: true };
}

export function emptyVariable(): VariableItem {
  return { key: "", value: "" };
}

export function emptyFormField(): FormField {
  return { key: "", type: "text", value: "", enabled: true };
}

export function emptyExtractRule(): ExtractRule {
  return { path: "", variable: "", enabled: true };
}

export function emptyTls(): TlsConfig {
  return { certPath: "", keyPath: "", caPath: "" };
}

export function defaultAuth(): AuthConfig {
  return { type: "none" };
}

export function isRowEnabled(item: { enabled?: boolean }): boolean {
  return item.enabled !== false;
}
