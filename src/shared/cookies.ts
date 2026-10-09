export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  secure: boolean;
  hostOnly: boolean;
}

export interface CookieJar {
  enabled: boolean;
  items: StoredCookie[];
}

export function emptyCookieJar(): CookieJar {
  return { enabled: true, items: [] };
}

export function emptyStoredCookie(): StoredCookie {
  return {
    name: "",
    value: "",
    domain: "",
    path: "/",
    expires: null,
    secure: false,
    hostOnly: true,
  };
}

function cookieKey(cookie: Pick<StoredCookie, "name" | "domain" | "path" | "hostOnly">): string {
  return `${cookie.name}\n${cookie.hostOnly ? "host" : "domain"}\n${cookie.domain}\n${cookie.path}`;
}

export function parseCookieJar(raw: string | null | undefined): CookieJar {
  if (!raw) return emptyCookieJar();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyCookieJar();
    const row = parsed as Record<string, unknown>;
    const items = Array.isArray(row.items) ? row.items.map(asStoredCookie).filter((item) => item.name) : [];
    return { enabled: row.enabled === false ? false : true, items };
  } catch {
    return emptyCookieJar();
  }
}

function asStoredCookie(value: unknown): StoredCookie {
  if (!value || typeof value !== "object") return emptyStoredCookie();
  const row = value as Record<string, unknown>;
  const expires = typeof row.expires === "number" && Number.isFinite(row.expires) ? row.expires : null;
  return {
    name: String(row.name ?? "").trim(),
    value: String(row.value ?? ""),
    domain: String(row.domain ?? "").trim().toLowerCase(),
    path: String(row.path ?? "/") || "/",
    expires,
    secure: row.secure === true,
    hostOnly: row.hostOnly === false ? false : true,
  };
}

export function serializeCookieJar(jar: CookieJar): string {
  return JSON.stringify({
    enabled: jar.enabled !== false,
    items: jar.items.filter((item) => item.name.trim()),
  });
}

function defaultPath(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const slash = pathname.lastIndexOf("/");
  if (slash <= 0) return "/";
  return pathname.slice(0, slash);
}

function domainMatches(host: string, domain: string): boolean {
  const left = host.toLowerCase();
  const right = domain.toLowerCase();
  return left === right || left.endsWith(`.${right}`);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  const path = cookiePath || "/";
  if (requestPath === path) return true;
  if (!requestPath.startsWith(path)) return false;
  if (path.endsWith("/")) return true;
  return requestPath.charAt(path.length) === "/";
}

function splitAttribute(part: string): { name: string; value: string } {
  const eq = part.indexOf("=");
  if (eq < 0) return { name: part.trim(), value: "" };
  return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() };
}

export function applySetCookie(
  jar: CookieJar,
  line: string,
  requestUrl: string,
  now = Date.now(),
): CookieJar {
  if (!jar.enabled) return jar;
  const parsed = readSetCookie(line, requestUrl, now);
  if (!parsed) return jar;
  const items = jar.items.filter((item) => cookieKey(item) !== cookieKey(parsed.identity));
  if (parsed.cookie) items.push(parsed.cookie);
  return { ...jar, items: dropExpired(items, now) };
}

export function mergeSetCookies(
  jar: CookieJar,
  events: Array<{ url: string; line: string }>,
  now = Date.now(),
): CookieJar {
  return events.reduce((current, event) => applySetCookie(current, event.line, event.url, now), jar);
}

function readSetCookie(
  line: string,
  requestUrl: string,
  now: number,
): { identity: StoredCookie; cookie: StoredCookie | null } | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const parts = line.split(";");
  const first = splitAttribute(parts[0] || "");
  if (!first.name || /[\s;,]/.test(first.name)) return null;

  let cookiePath = defaultPath(url.pathname || "/");
  let domain = url.hostname.toLowerCase();
  let hostOnly = true;
  let secure = false;
  let expires: number | null = null;
  let sawExpiry = false;
  let deleteCookie = false;

  for (const part of parts.slice(1)) {
    const attr = splitAttribute(part);
    const name = attr.name.toLowerCase();
    if (name === "path" && attr.value.startsWith("/")) cookiePath = attr.value;
    if (name === "secure") secure = true;
    if (name === "domain" && attr.value) {
      const requested = attr.value.replace(/^\./, "").toLowerCase();
      if (!requested || !domainMatches(url.hostname, requested)) return null;
      domain = requested;
      hostOnly = false;
    }
    if (name === "max-age") {
      const seconds = Number(attr.value);
      if (!Number.isFinite(seconds)) continue;
      sawExpiry = true;
      if (seconds <= 0) {
        deleteCookie = true;
        expires = null;
      } else {
        deleteCookie = false;
        expires = now + seconds * 1000;
      }
    }
    if (name === "expires" && !sawExpiry) {
      const time = Date.parse(attr.value);
      if (!Number.isFinite(time)) continue;
      if (time <= now) deleteCookie = true;
      else expires = time;
    }
  }

  const identity: StoredCookie = {
    name: first.name,
    value: first.value,
    domain,
    path: cookiePath,
    expires,
    secure,
    hostOnly,
  };
  if (deleteCookie) return { identity, cookie: null };
  return { identity, cookie: identity };
}

function dropExpired(items: StoredCookie[], now: number): StoredCookie[] {
  return items.filter((item) => item.expires == null || item.expires > now);
}

export function cookieHeaderValue(jar: CookieJar, requestUrl: string, now = Date.now()): string {
  if (!jar.enabled) return "";
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return "";
  }
  const https = url.protocol === "https:";
  const host = url.hostname.toLowerCase();
  const path = url.pathname || "/";
  const matches = dropExpired(jar.items, now).filter((item) => {
    if (!item.name) return false;
    if (item.secure && !https) return false;
    if (item.hostOnly) {
      if (item.domain !== host) return false;
    } else if (!domainMatches(host, item.domain)) {
      return false;
    }
    return pathMatches(item.path || "/", path);
  });
  matches.sort((a, b) => b.path.length - a.path.length || a.name.localeCompare(b.name));
  return matches.map((item) => `${item.name}=${item.value}`).join("; ");
}
