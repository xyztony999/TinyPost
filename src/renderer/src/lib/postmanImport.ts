import type { AuthConfig, HeaderItem, HttpMethod, VariableItem } from "@shared/types";
import { defaultAuth } from "@shared/types";

export interface ImportedRequest {
  name: string;
  method: HttpMethod | string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
}

export interface PostmanImportResult {
  collectionName: string;
  requests: ImportedRequest[];
  variables: VariableItem[];
}

interface PostmanHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  path?: string[] | string;
  query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
}

interface PostmanAuth {
  type?: string;
  bearer?: Array<{ key?: string; value?: string }>;
  basic?: Array<{ key?: string; value?: string }>;
  apikey?: Array<{ key?: string; value?: string }>;
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  body?: {
    mode?: string;
    raw?: string;
  };
  url?: string | PostmanUrl;
  auth?: PostmanAuth;
}

interface PostmanItem {
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
}

interface PostmanCollection {
  info?: { name?: string; schema?: string };
  item?: PostmanItem[];
  variable?: Array<{ key?: string; value?: string }>;
  auth?: PostmanAuth;
}

function authFromPostman(auth?: PostmanAuth): AuthConfig {
  if (!auth?.type) return defaultAuth();
  const type = auth.type.toLowerCase();

  if (type === "bearer") {
    const token =
      auth.bearer?.find((x) => x.key === "token")?.value ||
      auth.bearer?.[0]?.value ||
      "";
    return { type: "bearer", bearerToken: token };
  }

  if (type === "basic") {
    const username = auth.basic?.find((x) => x.key === "username")?.value || "";
    const password = auth.basic?.find((x) => x.key === "password")?.value || "";
    return { type: "basic", basicUsername: username, basicPassword: password };
  }

  if (type === "apikey") {
    const key = auth.apikey?.find((x) => x.key === "key")?.value || "X-API-Key";
    const value = auth.apikey?.find((x) => x.key === "value")?.value || "";
    return { type: "apikey", apiKeyKey: key, apiKeyValue: value };
  }

  return defaultAuth();
}

function resolveUrl(url?: string | PostmanUrl): string {
  if (!url) return "";
  if (typeof url === "string") return url;
  if (url.raw) return url.raw;

  const protocol = url.protocol || "http";
  const host = (url.host || []).join(".");
  const pathParts = Array.isArray(url.path)
    ? url.path
    : typeof url.path === "string"
      ? [url.path]
      : [];
  const path = pathParts.map((p) => String(p).replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
  const query = (url.query || [])
    .filter((q) => q && !q.disabled && q.key)
    .map((q) => `${encodeURIComponent(q.key || "")}=${encodeURIComponent(q.value || "")}`)
    .join("&");

  const base = host ? `${protocol}://${host}${path ? `/${path}` : ""}` : path;
  return query ? `${base}?${query}` : base;
}

function walkItems(
  items: PostmanItem[] | undefined,
  prefix: string,
  collectionAuth: AuthConfig,
  out: ImportedRequest[],
) {
  if (!items) return;

  for (const item of items) {
    const name = item.name?.trim() || "未命名请求";
    const pathName = prefix ? `${prefix} / ${name}` : name;

    if (item.item && item.item.length > 0 && !item.request) {
      walkItems(item.item, pathName, collectionAuth, out);
      continue;
    }

    if (!item.request) continue;

    const req = item.request;
    const headers = (req.header || [])
      .filter((h) => h && !h.disabled && h.key)
      .map((h) => ({ key: h.key || "", value: h.value || "" }));

    const body =
      req.body?.mode === "raw" || req.body?.raw
        ? req.body.raw || ""
        : "";

    out.push({
      name: pathName,
      method: (req.method || "GET").toUpperCase(),
      url: resolveUrl(req.url),
      headers,
      body,
      auth: req.auth ? authFromPostman(req.auth) : collectionAuth,
    });
  }
}

export function parsePostmanCollection(raw: string): PostmanImportResult {
  let data: PostmanCollection;
  try {
    data = JSON.parse(raw) as PostmanCollection;
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }

  const schema = data.info?.schema || "";
  if (
    data.info == null &&
    !Array.isArray(data.item) &&
    !("variable" in data)
  ) {
    throw new Error("无法识别为 Postman Collection");
  }

  if (schema && !schema.includes("collection")) {
    // 允许无 schema 的简化导出；有 schema 但不含 collection 时提示
    if (schema.includes("environment")) {
      throw new Error("这是 Postman Environment 文件，请导入 Collection");
    }
  }

  const collectionAuth = authFromPostman(data.auth);
  const requests: ImportedRequest[] = [];
  walkItems(data.item, "", collectionAuth, requests);

  if (requests.length === 0) {
    throw new Error("Collection 中没有可导入的请求");
  }

  const variables: VariableItem[] = (data.variable || [])
    .filter((v) => v?.key)
    .map((v) => ({ key: v.key || "", value: String(v.value ?? "") }));

  return {
    collectionName: data.info?.name?.trim() || "导入的 Collection",
    requests,
    variables,
  };
}
