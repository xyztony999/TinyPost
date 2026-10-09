import type {
  AppSettings,
  AuthConfig,
  AuthType,
  ExtractRule,
  FormField,
  HeaderItem,
  QueryItem,
  TlsConfig,
  VariableItem,
} from "./types";
import { defaultAuth, emptyTls } from "./types";

export const PORTABLE_VERSION = 1;

export interface PortableRequest {
  name: string;
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
  query: QueryItem[];
  bodyMode: "raw" | "form-data";
  formFields: FormField[];
  extractors: ExtractRule[];
}

export interface PortableCollection {
  version: number;
  kind: "tinypost.collection";
  name: string;
  requests: PortableRequest[];
}

export interface PortableEnvironment {
  version: number;
  kind: "tinypost.environment";
  name: string;
  variables: VariableItem[];
  tls: TlsConfig;
}

export interface PortableBackup {
  version: number;
  kind: "tinypost.backup";
  collections: Array<{ name: string; requests: PortableRequest[] }>;
  environments: Array<{
    name: string;
    variables: VariableItem[];
    isActive?: boolean;
    tls: TlsConfig;
  }>;
  settings?: AppSettings;
}

export type PortableDocument = PortableCollection | PortableEnvironment | PortableBackup;

const AUTH_TYPES = new Set<AuthType>(["none", "bearer", "basic", "apikey"]);

function fail(message: string): never {
  throw new Error(message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}必须是对象`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) fail(message);
  return value;
}

function readHeaders(value: unknown, label: string): HeaderItem[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label}的 headers 必须是数组`);
  return value.map((item, index) => {
    const row = asObject(item, `${label}的请求头 #${index + 1}`);
    if (typeof row.key !== "string") fail(`${label}的请求头 #${index + 1} 缺少 key`);
    return {
      key: row.key,
      value: String(row.value ?? ""),
      enabled: row.enabled === false ? false : true,
    };
  });
}

function readQuery(value: unknown, label: string): QueryItem[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label}的 query 必须是数组`);
  return value.map((item, index) => {
    const row = asObject(item, `${label}的查询参数 #${index + 1}`);
    if (typeof row.key !== "string") fail(`${label}的查询参数 #${index + 1} 缺少 key`);
    return {
      key: row.key,
      value: String(row.value ?? ""),
      enabled: row.enabled === false ? false : true,
    };
  });
}

function readAuth(value: unknown, label: string): AuthConfig {
  if (value == null) return defaultAuth();
  const row = asObject(value, `${label}的 auth`);
  if (typeof row.type !== "string" || !AUTH_TYPES.has(row.type as AuthType)) {
    fail(`${label}的 auth.type 无效`);
  }
  return {
    type: row.type as AuthType,
    bearerToken: row.bearerToken != null ? String(row.bearerToken) : undefined,
    basicUsername: row.basicUsername != null ? String(row.basicUsername) : undefined,
    basicPassword: row.basicPassword != null ? String(row.basicPassword) : undefined,
    apiKeyKey: row.apiKeyKey != null ? String(row.apiKeyKey) : undefined,
    apiKeyValue: row.apiKeyValue != null ? String(row.apiKeyValue) : undefined,
  };
}

function readFormFields(value: unknown, label: string): FormField[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label}的 formFields 必须是数组`);
  return value.map((item, index) => {
    const row = asObject(item, `${label}的表单字段 #${index + 1}`);
    if (row.type != null && row.type !== "text" && row.type !== "file") {
      fail(`${label}的表单字段 #${index + 1} type 无效`);
    }
    return {
      key: String(row.key ?? ""),
      type: row.type === "file" ? "file" : "text",
      value: String(row.value ?? ""),
      fileName: row.fileName != null ? String(row.fileName) : undefined,
      contentType: row.contentType != null ? String(row.contentType) : undefined,
      enabled: row.enabled === false ? false : true,
    };
  });
}

function readExtractors(value: unknown, label: string): ExtractRule[] {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label}的 extractors 必须是数组`);
  return value.map((item, index) => {
    const row = asObject(item, `${label}的提取规则 #${index + 1}`);
    return {
      path: String(row.path ?? ""),
      variable: String(row.variable ?? ""),
      enabled: row.enabled === false ? false : true,
    };
  });
}

function readRequest(value: unknown, index: number): PortableRequest {
  const label = `请求 #${index + 1}`;
  const row = asObject(value, label);
  const name = requiredString(row.name, `${label}缺少名称`);
  const named = `请求「${name}」`;
  const method = requiredString(row.method, `${named}缺少方法`);
  if (typeof row.url !== "string") fail(`${named}缺少 URL`);
  if (row.body != null && typeof row.body !== "string") fail(`${named}的 body 必须是字符串`);
  if (row.bodyMode != null && row.bodyMode !== "raw" && row.bodyMode !== "form-data") {
    fail(`${named}的 bodyMode 无效`);
  }
  return {
    name: name.trim(),
    method: method.trim(),
    url: row.url,
    headers: readHeaders(row.headers, named),
    body: typeof row.body === "string" ? row.body : "",
    auth: readAuth(row.auth, named),
    query: readQuery(row.query, named),
    bodyMode: row.bodyMode === "form-data" ? "form-data" : "raw",
    formFields: readFormFields(row.formFields, named),
    extractors: readExtractors(row.extractors, named),
  };
}

function readVariables(value: unknown, label: string): VariableItem[] {
  if (!Array.isArray(value)) fail(`${label}的 variables 必须是数组`);
  return value.map((item, index) => {
    const row = asObject(item, `${label}的变量 #${index + 1}`);
    if (typeof row.key !== "string" || !row.key.trim()) {
      fail(`${label}的变量 #${index + 1} 缺少 key`);
    }
    return { key: row.key, value: String(row.value ?? "") };
  });
}

function readTls(value: unknown, label: string): TlsConfig {
  if (value == null) return emptyTls();
  const row = asObject(value, `${label}的 tls`);
  return {
    certPath: String(row.certPath ?? ""),
    keyPath: String(row.keyPath ?? ""),
    caPath: String(row.caPath ?? ""),
  };
}

function readSettings(value: unknown): AppSettings | undefined {
  if (value == null) return undefined;
  const row = asObject(value, "settings");
  if (typeof row.timeoutMs !== "number" || row.timeoutMs < 1000) fail("settings.timeoutMs 无效");
  if (typeof row.insecure !== "boolean") fail("settings.insecure 无效");
  if (typeof row.followRedirects !== "boolean") fail("settings.followRedirects 无效");
  return {
    timeoutMs: row.timeoutMs,
    insecure: row.insecure,
    followRedirects: row.followRedirects,
  };
}

function readVersion(row: Record<string, unknown>): void {
  if (row.version == null) fail("缺少 version");
  if (row.version !== PORTABLE_VERSION) {
    fail(`不支持的文件版本：${String(row.version)}（当前仅支持 ${PORTABLE_VERSION}）`);
  }
}

export function parsePortable(raw: string): PortableDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("不是有效的 JSON");
  }
  const row = asObject(parsed, "文件");
  readVersion(row);
  if (row.kind === "tinypost.collection") {
    const name = requiredString(row.name, "集合缺少名称");
    if (!Array.isArray(row.requests)) fail("集合的 requests 必须是数组");
    return {
      version: PORTABLE_VERSION,
      kind: "tinypost.collection",
      name: name.trim(),
      requests: row.requests.map((item, index) => readRequest(item, index)),
    };
  }
  if (row.kind === "tinypost.environment") {
    const name = requiredString(row.name, "环境缺少名称");
    return {
      version: PORTABLE_VERSION,
      kind: "tinypost.environment",
      name: name.trim(),
      variables: readVariables(row.variables, "环境"),
      tls: readTls(row.tls, "环境"),
    };
  }
  if (row.kind === "tinypost.backup") {
    if (!Array.isArray(row.collections)) fail("备份的 collections 必须是数组");
    if (!Array.isArray(row.environments)) fail("备份的 environments 必须是数组");
    return {
      version: PORTABLE_VERSION,
      kind: "tinypost.backup",
      collections: row.collections.map((item, index) => {
        const collection = asObject(item, `备份集合 #${index + 1}`);
        const name = requiredString(collection.name, `备份集合 #${index + 1} 缺少名称`);
        if (!Array.isArray(collection.requests)) fail(`备份集合「${name}」的 requests 必须是数组`);
        return {
          name: name.trim(),
          requests: collection.requests.map((req, reqIndex) => readRequest(req, reqIndex)),
        };
      }),
      environments: row.environments.map((item, index) => {
        const env = asObject(item, `备份环境 #${index + 1}`);
        const name = requiredString(env.name, `备份环境 #${index + 1} 缺少名称`);
        return {
          name: name.trim(),
          variables: readVariables(env.variables, `备份环境「${name}」`),
          isActive: env.isActive === true,
          tls: readTls(env.tls, `备份环境「${name}」`),
        };
      }),
      settings: readSettings(row.settings),
    };
  }
  fail("无法识别的 kind");
}
