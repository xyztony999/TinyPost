import type { VariableItem } from "../types";

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function parseVariablesJson(raw: string): VariableItem[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (item && typeof item === "object") {
            const row = item as Record<string, unknown>;
            return {
              key: String(row.key ?? ""),
              value: String(row.value ?? ""),
            };
          }
          return null;
        })
        .filter((item): item is VariableItem => !!item);
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
        key,
        value: String(value ?? ""),
      }));
    }
  } catch {
    // ignore
  }
  return [];
}

export function variablesToMap(variables: VariableItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of variables) {
    const key = item.key.trim();
    if (!key) continue;
    map[key] = item.value;
  }
  return map;
}

export function substituteVars(
  input: string,
  variables: Record<string, string>,
): string {
  if (!input) return input;
  return input.replace(VAR_RE, (_match, name: string) => {
    const key = name.trim();
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : `{{${key}}}`;
  });
}
