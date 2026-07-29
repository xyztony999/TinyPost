import type { AuthConfig, HeaderItem } from "../types";
import { substituteVars } from "./vars";

function upsertHeader(headers: HeaderItem[], key: string, value: string): HeaderItem[] {
  const lower = key.toLowerCase();
  const next = headers.filter((h) => h.key.trim().toLowerCase() !== lower);
  next.push({ key, value });
  return next;
}

export function applyAuth(
  headers: HeaderItem[],
  auth: AuthConfig,
  variables: Record<string, string>,
): HeaderItem[] {
  let next = [...headers];

  const encodeBasic = (value: string) => {
    try {
      return btoa(unescape(encodeURIComponent(value)));
    } catch {
      return btoa(value);
    }
  };

  switch (auth.type) {
    case "bearer": {
      const token = substituteVars(auth.bearerToken || "", variables).trim();
      if (token) {
        next = upsertHeader(next, "Authorization", `Bearer ${token}`);
      }
      break;
    }
    case "basic": {
      const username = substituteVars(auth.basicUsername || "", variables);
      const password = substituteVars(auth.basicPassword || "", variables);
      const encoded = encodeBasic(`${username}:${password}`);
      next = upsertHeader(next, "Authorization", `Basic ${encoded}`);
      break;
    }
    case "apikey": {
      const key = substituteVars(auth.apiKeyKey || "", variables).trim() || "X-API-Key";
      const value = substituteVars(auth.apiKeyValue || "", variables);
      if (value) {
        next = upsertHeader(next, key, value);
      }
      break;
    }
    default:
      break;
  }

  return next;
}

export function parseAuthJson(raw: string): AuthConfig {
  try {
    const parsed = JSON.parse(raw || "{}") as AuthConfig;
    if (parsed && typeof parsed === "object" && parsed.type) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { type: "none" };
}
