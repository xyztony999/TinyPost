import type { UrlEncodedField } from "./types";

function encodeFormComponent(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function encodeUrlEncoded(fields: Array<Pick<UrlEncodedField, "key" | "value">>): string {
  return fields
    .map((field) => {
      if (!field.key) return encodeFormComponent(field.value);
      return `${encodeFormComponent(field.key)}=${encodeFormComponent(field.value)}`;
    })
    .join("&");
}

export function parseUrlEncodedBody(body: string): UrlEncodedField[] | null {
  const trimmed = body.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) return null;
  if (!trimmed.includes("=")) return null;

  const params = new URLSearchParams(trimmed);
  const fields: UrlEncodedField[] = [];
  for (const [key, value] of params.entries()) {
    if (!key) return null;
    fields.push({ key, value, enabled: true });
  }
  return fields.length > 0 ? fields : null;
}

export function withUrlEncodedContentType(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") continue;
    next[key] = value;
  }
  next["Content-Type"] = "application/x-www-form-urlencoded";
  return next;
}
