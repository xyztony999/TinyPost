import type {
  AuthConfig,
  BodyMode,
  FormField,
  HeaderItem,
  HttpMethod,
  UrlEncodedField,
  VariableItem,
} from "@shared/types";
import { defaultAuth } from "@shared/types";

export interface ImportedRequest {
  name: string;
  method: HttpMethod | string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
  bodyMode: BodyMode;
  formFields: FormField[];
  urlencodedFields: UrlEncodedField[];
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

interface PostmanKeyedValue {
  key?: string;
  value?: string;
  type?: string;
  disabled?: boolean;
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: PostmanKeyedValue[];
    formdata?: PostmanKeyedValue[];
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

function readPostmanBody(body: PostmanRequest["body"]): {
  body: string;
  bodyMode: BodyMode;
  formFields: FormField[];
  urlencodedFields: UrlEncodedField[];
} {
  const mode = (body?.mode || "").toLowerCase();
  if (mode === "urlencoded") {
    return {
      body: "",
      bodyMode: "urlencoded",
      formFields: [],
      urlencodedFields: (body?.urlencoded || [])
        .filter((field) => field && field.key)
        .map((field) => ({
          key: field.key || "",
          value: String(field.value ?? ""),
          enabled: !field.disabled,
        })),
    };
  }
  if (mode === "formdata") {
    return {
      body: "",
      bodyMode: "form-data",
      urlencodedFields: [],
      formFields: (body?.formdata || [])
        .filter((field) => field && field.key)
        .map((field) => {
          const file = (field.type || "").toLowerCase() === "file";
          return {
            key: field.key || "",
            type: file ? "file" : "text",
            value: file ? "" : String(field.value ?? ""),
            enabled: !field.disabled,
          } satisfies FormField;
        }),
    };
  }
  return {
    body: body?.raw || "",
    bodyMode: "raw",
    formFields: [],
    urlencodedFields: [],
  };
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
      .filter((h) => h && h.key)
      .map((h) => ({
        key: h.key || "",
        value: h.value || "",
        enabled: !h.disabled,
      }));

    const parsedBody = readPostmanBody(req.body);

    out.push({
      name: pathName,
      method: (req.method || "GET").toUpperCase(),
      url: resolveUrl(req.url),
      headers,
      body: parsedBody.body,
      auth: req.auth ? authFromPostman(req.auth) : collectionAuth,
      bodyMode: parsedBody.bodyMode,
      formFields: parsedBody.formFields,
      urlencodedFields: parsedBody.urlencodedFields,
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

  // Postman Environment 的 schema 路径同样包含 /collection/，要用 environment 段区分
  if (schema.includes("environment")) {
    throw new Error("这是 Postman Environment 文件，请导入 Collection");
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

interface PostmanEnvironmentFile {
  name?: string;
  values?: Array<{ key?: string; value?: string; enabled?: boolean }>;
  info?: { schema?: string };
  item?: unknown;
}

export interface PostmanEnvironmentResult {
  name: string;
  variables: VariableItem[];
}

export function parsePostmanEnvironment(raw: string): PostmanEnvironmentResult {
  let data: PostmanEnvironmentFile;
  try {
    data = JSON.parse(raw) as PostmanEnvironmentFile;
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }

  const schema = data.info?.schema || "";
  if (schema.includes("collection") || Array.isArray(data.item)) {
    throw new Error("这是 Postman Collection 文件，请作为集合导入");
  }
  if (!Array.isArray(data.values)) {
    throw new Error("无法识别为 Postman Environment");
  }

  const variables = data.values
    .filter((item) => item && item.key && item.enabled !== false)
    .map((item) => ({
      key: String(item.key),
      value: String(item.value ?? ""),
    }));

  return {
    name: data.name?.trim() || "导入的环境",
    variables,
  };
}
