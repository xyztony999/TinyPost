import type { AuthConfig, FormField, HeaderItem, UrlEncodedField } from "./types";
import { defaultAuth } from "./types";
import { parseUrlEncodedBody } from "./urlencoded";

export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurlParseError";
  }
}

export interface ParsedCurl {
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  bodyMode: "raw" | "form-data" | "urlencoded";
  formFields: FormField[];
  urlencodedFields: UrlEncodedField[];
  insecure: boolean;
  auth: AuthConfig;
}

export interface CurlExportInput {
  method: string;
  url: string;
  headers: HeaderItem[];
  body?: string;
  bodyMode?: "raw" | "form-data" | "urlencoded";
  formFields?: FormField[];
  urlencodedFields?: UrlEncodedField[];
}

const SHORT_WITH_VALUE = new Set(["X", "H", "d", "F", "u", "o", "A", "e", "b", "m"]);
const SHORT_FLAGS = new Set(["s", "S", "L", "i", "v", "k", "G", "f", "g", "n", "4", "6", "#"]);

const LONG_FLAGS = new Set([
  "--silent",
  "--show-error",
  "--location",
  "--include",
  "--verbose",
  "--insecure",
  "--get",
  "--progress-bar",
  "--fail",
  "--globoff",
  "--netrc",
  "--compressed",
  "--http1.0",
  "--http1.1",
  "--http2",
  "--ipv4",
  "--ipv6",
  "--path-as-is",
]);

const LONG_WITH_VALUE = new Set([
  "--request",
  "--header",
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-ascii",
  "--data-urlencode",
  "--form",
  "--url",
  "--user",
  "--output",
  "--user-agent",
  "--referer",
  "--cookie",
  "--connect-timeout",
  "--max-time",
]);

function isCurlCommand(token: string): boolean {
  const base = token.replace(/\\/g, "/").split("/").pop() || token;
  return base.toLowerCase() === "curl" || base.toLowerCase() === "curl.exe";
}

export function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  let i = 0;

  const push = () => {
    if (!started) return;
    tokens.push(current);
    current = "";
    started = false;
  };

  while (i < input.length) {
    const ch = input[i];
    if (quote === "'") {
      if (ch === "'") {
        quote = null;
        i += 1;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\") {
        const next = input[i + 1];
        if (next == null) throw new CurlParseError("curl 字符串转义不完整");
        if (next === "\n") {
          i += 2;
          continue;
        }
        if (next === "\r" && input[i + 2] === "\n") {
          i += 3;
          continue;
        }
        const mapped: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          '"': '"',
          "\\": "\\",
          $: "$",
          "`": "`",
        };
        current += mapped[next] ?? next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        quote = null;
        i += 1;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = input[i + 1];
      if (next == null) throw new CurlParseError("curl 反斜杠续行不完整");
      if (next === "\n") {
        i += 2;
        continue;
      }
      if (next === "\r" && input[i + 2] === "\n") {
        i += 3;
        continue;
      }
      started = true;
      current += next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      quote = "'";
      started = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quote = '"';
      started = true;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      push();
      i += 1;
      continue;
    }
    started = true;
    current += ch;
    i += 1;
  }
  if (quote === "'") throw new CurlParseError("curl 单引号未闭合");
  if (quote === '"') throw new CurlParseError("curl 双引号未闭合");
  push();
  return tokens;
}

function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

function parseFormParams(params: string): { type?: string; filename?: string } {
  const out: { type?: string; filename?: string } = {};
  if (!params) return out;
  for (const part of params.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim().replace(/^"|"$/g, "");
    if (key === "type") out.type = value;
    if (key === "filename") out.filename = value;
  }
  return out;
}

function parseFormValue(raw: string): FormField {
  const eq = raw.indexOf("=");
  if (eq <= 0) throw new CurlParseError(`无效的 -F 参数：${raw}`);
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (value.startsWith("<")) {
    throw new CurlParseError("不支持 curl 的 <file 读入语法，请改用 @file");
  }
  if (!value.startsWith("@")) {
    return { key, type: "text", value, enabled: true };
  }

  let rest = value.slice(1);
  let filePath = "";
  let params = "";
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    if (end < 0) throw new CurlParseError("curl 文件路径引号未闭合");
    filePath = rest.slice(1, end);
    params = rest.slice(end + 1);
  } else {
    const semi = rest.indexOf(";");
    if (semi < 0) filePath = rest;
    else {
      filePath = rest.slice(0, semi);
      params = rest.slice(semi);
    }
  }
  if (params.startsWith(";")) params = params.slice(1);
  const extra = parseFormParams(params);
  return {
    key,
    type: "file",
    value: filePath,
    fileName: extra.filename || fileBaseName(filePath),
    contentType: extra.type || "",
    enabled: true,
  };
}

function headerFrom(raw: string): HeaderItem {
  const colon = raw.indexOf(":");
  if (colon <= 0) throw new CurlParseError(`无效的请求头：${raw}`);
  return {
    key: raw.slice(0, colon).trim(),
    value: raw.slice(colon + 1).trim(),
    enabled: true,
  };
}

function hasContentType(headers: HeaderItem[]): boolean {
  return headers.some((header) => header.key.toLowerCase() === "content-type");
}

export function parseCurl(input: string): ParsedCurl {
  const cleaned = input.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new CurlParseError("请输入 curl 命令");
  const args = tokenizeCurl(cleaned);
  if (args.length === 0 || !isCurlCommand(args[0])) {
    throw new CurlParseError("请粘贴 curl 命令");
  }

  let method = "";
  let url = "";
  let sawPositional = false;
  const headers: HeaderItem[] = [];
  const dataParts: string[] = [];
  const formDataParts: string[] = [];
  const urlEncodeParts: string[] = [];
  const formFields: FormField[] = [];
  let insecure = false;
  let useGet = false;
  let user = "";

  const take = (index: number, inline: string | null, flag: string): { value: string; next: number } => {
    if (inline !== null) return { value: inline, next: index };
    const value = args[index + 1];
    if (value === undefined) throw new CurlParseError(`参数 ${flag} 缺少取值`);
    return { value, next: index + 1 };
  };

  const apply = (flag: string, value: string | null, index: number): number => {
    if (flag === "-k" || flag === "--insecure") {
      insecure = true;
      return index;
    }
    if (flag === "-G" || flag === "--get") {
      useGet = true;
      return index;
    }
    if (SHORT_FLAGS.has(flag.slice(1)) || LONG_FLAGS.has(flag)) return index;
    if (flag === "-X" || flag === "--request") {
      const taken = take(index, value, flag);
      method = taken.value.toUpperCase();
      return taken.next;
    }
    if (flag === "-H" || flag === "--header") {
      const taken = take(index, value, flag);
      headers.push(headerFrom(taken.value));
      return taken.next;
    }
    if (flag === "-A" || flag === "--user-agent") {
      const taken = take(index, value, flag);
      headers.push({ key: "User-Agent", value: taken.value, enabled: true });
      return taken.next;
    }
    if (flag === "-e" || flag === "--referer") {
      const taken = take(index, value, flag);
      headers.push({ key: "Referer", value: taken.value, enabled: true });
      return taken.next;
    }
    if (flag === "-b" || flag === "--cookie") {
      const taken = take(index, value, flag);
      headers.push({ key: "Cookie", value: taken.value, enabled: true });
      return taken.next;
    }
    if (flag === "--data-urlencode") {
      const taken = take(index, value, flag);
      urlEncodeParts.push(taken.value);
      return taken.next;
    }
    if (flag === "-d" || flag === "--data" || flag === "--data-ascii") {
      const taken = take(index, value, flag);
      formDataParts.push(taken.value);
      return taken.next;
    }
    if (flag === "--data-raw" || flag === "--data-binary") {
      const taken = take(index, value, flag);
      dataParts.push(taken.value);
      return taken.next;
    }
    if (flag === "-F" || flag === "--form") {
      const taken = take(index, value, flag);
      formFields.push(parseFormValue(taken.value));
      return taken.next;
    }
    if (flag === "--url") {
      const taken = take(index, value, flag);
      url = taken.value;
      return taken.next;
    }
    if (flag === "-u" || flag === "--user") {
      const taken = take(index, value, flag);
      user = taken.value;
      return taken.next;
    }
    if (
      flag === "-o" ||
      flag === "--output" ||
      flag === "-m" ||
      flag === "--max-time" ||
      flag === "--connect-timeout"
    ) {
      return take(index, value, flag).next;
    }
    throw new CurlParseError(`不支持的 curl 参数：${flag}`);
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--") {
      for (const extra of args.slice(i + 1)) {
        if (sawPositional || url) throw new CurlParseError("curl 中出现多个 URL");
        url = extra;
        sawPositional = true;
      }
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq >= 0 ? arg.slice(0, eq) : arg;
      const inline = eq >= 0 ? arg.slice(eq + 1) : null;
      if (inline === null && !LONG_FLAGS.has(name) && !LONG_WITH_VALUE.has(name)) {
        throw new CurlParseError(`不支持的 curl 参数：${name}`);
      }
      if (eq >= 0 && LONG_FLAGS.has(name)) {
        throw new CurlParseError(`参数 ${name} 不接受取值`);
      }
      i = apply(name, inline, i) + (inline !== null || LONG_FLAGS.has(name) ? 1 : 1);
      // apply returns the index of the value token when it consumes the next arg,
      // or the current index for flags. Always advance one past the returned index.
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1 && !/^https?:\/\//i.test(arg)) {
      const cluster = arg.slice(1);
      let c = 0;
      let cursor = i;
      while (c < cluster.length) {
        const letter = cluster[c];
        const flag = `-${letter}`;
        if (SHORT_WITH_VALUE.has(letter)) {
          const rest = cluster.slice(c + 1);
          cursor = apply(flag, rest ? rest : null, cursor);
          break;
        }
        if (!SHORT_FLAGS.has(letter)) throw new CurlParseError(`不支持的 curl 参数：-${letter}`);
        cursor = apply(flag, null, cursor);
        c += 1;
      }
      i = cursor + 1;
      continue;
    }
    if (sawPositional || url) throw new CurlParseError("curl 中出现多个 URL");
    url = arg;
    sawPositional = true;
    i += 1;
  }

  if (!url) throw new CurlParseError("curl 中没有 URL");
  const hasData = dataParts.length > 0 || formDataParts.length > 0 || urlEncodeParts.length > 0;
  if (hasData && formFields.length > 0) {
    throw new CurlParseError("不能同时使用 -d 与 -F");
  }
  if (urlEncodeParts.length > 0 && (dataParts.length > 0 || formDataParts.length > 0)) {
    throw new CurlParseError("不能同时使用 --data-urlencode 与 -d");
  }

  let body = "";
  let bodyMode: ParsedCurl["bodyMode"] = "raw";
  let urlencodedFields: UrlEncodedField[] = [];
  if (formFields.length > 0) {
    bodyMode = "form-data";
  } else if (urlEncodeParts.length > 0) {
    bodyMode = "urlencoded";
    urlencodedFields = urlEncodeParts.map(parseDataUrlEncode);
  } else if (formDataParts.length > 0 && dataParts.length === 0) {
    const joined = formDataParts.join("&");
    if (useGet && (!method || method === "GET")) {
      url = url.includes("?") ? `${url}&${joined}` : `${url}?${joined}`;
    } else {
      const fields = explicitNonFormType(headers) ? null : parseUrlEncodedBody(joined);
      if (fields) {
        bodyMode = "urlencoded";
        urlencodedFields = fields;
      } else {
        body = joined;
        if (!hasContentType(headers)) {
          headers.push({
            key: "Content-Type",
            value: "application/x-www-form-urlencoded",
            enabled: true,
          });
        }
      }
    }
  } else if (dataParts.length > 0 || formDataParts.length > 0) {
    const joined = [...formDataParts, ...dataParts].join("&");
    if (useGet && (!method || method === "GET")) {
      url = url.includes("?") ? `${url}&${joined}` : `${url}?${joined}`;
    } else {
      body = joined;
      if (!hasContentType(headers)) {
        headers.push({
          key: "Content-Type",
          value: "application/x-www-form-urlencoded",
          enabled: true,
        });
      }
    }
  }

  if (!method) {
    method = useGet ? "GET" : body || bodyMode === "form-data" || bodyMode === "urlencoded" ? "POST" : "GET";
  }

  let auth = defaultAuth();
  if (user) {
    const colon = user.indexOf(":");
    auth = {
      type: "basic",
      basicUsername: colon < 0 ? user : user.slice(0, colon),
      basicPassword: colon < 0 ? "" : user.slice(colon + 1),
    };
  }

  return { method, url, headers, body, bodyMode, formFields, urlencodedFields, insecure, auth };
}

function explicitNonFormType(headers: HeaderItem[]): boolean {
  const header = headers.find(
    (item) => item.enabled !== false && item.key.toLowerCase() === "content-type",
  );
  if (!header) return false;
  return !header.value.toLowerCase().includes("application/x-www-form-urlencoded");
}

function parseDataUrlEncode(raw: string): UrlEncodedField {
  if (raw.startsWith("@") || /^[^=]+@/.test(raw)) {
    throw new CurlParseError("--data-urlencode 不读取文件");
  }
  const eq = raw.indexOf("=");
  if (eq < 0) return { key: "", value: raw, enabled: true };
  return { key: raw.slice(0, eq), value: raw.slice(eq + 1), enabled: true };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatFormField(field: FormField): string {
  if (field.type === "file") {
    const params: string[] = [];
    if (field.fileName) params.push(`filename=${field.fileName}`);
    if (field.contentType) params.push(`type=${field.contentType}`);
    const suffix = params.length ? `;${params.join(";")}` : "";
    return `${field.key}=@${field.value}${suffix}`;
  }
  return `${field.key}=${field.value}`;
}

export function buildCurl(input: CurlExportInput): string {
  const method = (input.method || "GET").toUpperCase();
  const skipBody = method === "GET" || method === "HEAD";
  const multipart = !skipBody && input.bodyMode === "form-data";
  const urlencoded = !skipBody && input.bodyMode === "urlencoded";
  const lines = [`curl -X ${method} ${shellQuote(input.url)}`];
  for (const header of input.headers) {
    if (header.enabled === false || !header.key.trim()) continue;
    if ((multipart || urlencoded) && header.key.toLowerCase() === "content-type") continue;
    lines.push(`-H ${shellQuote(`${header.key}: ${header.value}`)}`);
  }
  if (multipart) {
    for (const field of input.formFields || []) {
      if (field.enabled === false || !field.key.trim()) continue;
      lines.push(`-F ${shellQuote(formatFormField(field))}`);
    }
  } else if (urlencoded) {
    for (const field of input.urlencodedFields || []) {
      if (field.enabled === false || !field.key.trim()) continue;
      lines.push(`--data-urlencode ${shellQuote(`${field.key}=${field.value}`)}`);
    }
  } else if (!skipBody && input.body) {
    lines.push(`--data-raw ${shellQuote(input.body)}`);
  }
  return lines.join(" \\\n  ");
}
