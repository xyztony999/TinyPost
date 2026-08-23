import type { QueryItem } from "@shared/types";
import { emptyQuery, isRowEnabled } from "@shared/types";

export function splitUrl(url: string): { base: string; query: string; hash: string } {
  let hash = "";
  let rest = url;
  const hashIdx = url.indexOf("#");
  if (hashIdx >= 0) {
    hash = url.slice(hashIdx);
    rest = url.slice(0, hashIdx);
  }
  const qIdx = rest.indexOf("?");
  if (qIdx < 0) return { base: rest, query: "", hash };
  return { base: rest.slice(0, qIdx), query: rest.slice(qIdx + 1), hash };
}

function shouldEncode(part: string): boolean {
  return !part.includes("{{") && !part.includes("}}");
}

function encodePart(part: string): string {
  return shouldEncode(part) ? encodeURIComponent(part) : part;
}

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, " "));
  } catch {
    return part;
  }
}

export function parseQuery(query: string): QueryItem[] {
  if (!query) return [];
  return query
    .split("&")
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq < 0) return { key: decodePart(pair), value: "", enabled: true };
      return {
        key: decodePart(pair.slice(0, eq)),
        value: decodePart(pair.slice(eq + 1)),
        enabled: true,
      };
    });
}

export function queryFromUrl(url: string): QueryItem[] {
  const parsed = parseQuery(splitUrl(url).query);
  return parsed.length ? [...parsed, emptyQuery()] : [emptyQuery()];
}

export function withTrailingEmpty(items: QueryItem[]): QueryItem[] {
  const next = items.filter((item, index) => {
    const isLast = index === items.length - 1;
    return item.key || item.value || item.enabled === false || isLast;
  });
  const last = next[next.length - 1];
  if (!last || last.key || last.value || last.enabled === false) {
    next.push(emptyQuery());
  }
  return next;
}

export function buildUrl(url: string, params: QueryItem[]): string {
  const { base, hash } = splitUrl(url);
  const qs = params
    .filter((item) => isRowEnabled(item) && item.key.trim())
    .map((item) => `${encodePart(item.key.trim())}=${encodePart(item.value)}`)
    .join("&");
  return `${base}${qs ? `?${qs}` : ""}${hash}`;
}

export function mergeQueryFromUrl(url: string, previous: QueryItem[]): QueryItem[] {
  const parsed = parseQuery(splitUrl(url).query);
  const parsedKeys = new Set(parsed.map((item) => item.key));
  const disabled = previous.filter(
    (item) => item.enabled === false && item.key.trim() && !parsedKeys.has(item.key),
  );
  return withTrailingEmpty([...parsed, ...disabled]);
}

export function parseQueryJson(raw: string | null | undefined): QueryItem[] | null {
  if (!raw || raw === "[]") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map((item): QueryItem | null => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          key: String(row.key ?? ""),
          value: String(row.value ?? ""),
          enabled: row.enabled === false ? false : true,
        };
      })
      .filter((item): item is QueryItem => item !== null);
    return items.length ? withTrailingEmpty(items) : null;
  } catch {
    return null;
  }
}

export function serializeQuery(items: QueryItem[]): string {
  return JSON.stringify(
    items.filter((item) => item.key.trim() || item.value || item.enabled === false),
  );
}
