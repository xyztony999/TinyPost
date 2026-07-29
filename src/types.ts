export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HeaderItem {
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
