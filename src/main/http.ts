import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { URL } from "node:url";
import { isTextContentType } from "../shared/contentType";
import { buildMultipart, withMultipartContentType } from "../shared/multipart";
import { withUrlEncodedContentType } from "../shared/urlencoded";
import type {
  HeaderItem,
  HttpRequestPayload,
  HttpResponsePayload,
  MultipartPartPayload,
  RedirectHop,
  SetCookieEvent,
  TlsRequestConfig,
} from "../shared/types";
import { isRowEnabled } from "../shared/types";

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;
const encoder = new TextEncoder();

interface TlsMaterial {
  cert: Buffer;
  key: Buffer;
  ca?: Buffer;
  passphrase?: string;
}

interface InflightSlot {
  cancelled: boolean;
  req: http.ClientRequest | null;
}

const inflight = new Map<string, InflightSlot>();
const responseBinaries = new Map<string, Buffer>();

export function getResponseBinary(requestId = "default"): Buffer | null {
  return responseBinaries.get(requestId) ?? null;
}

function statusTextOf(code: number): string {
  return http.STATUS_CODES[code] || "";
}

function headerRecord(headers: HeaderItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers || []) {
    const key = header.key.trim();
    if (!key || !isRowEnabled(header)) continue;
    out[key] = header.value;
  }
  return out;
}

function hopMethod(status: number, method: string): string {
  if (status === 303) return "GET";
  if ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD") {
    return "GET";
  }
  return method;
}

function setCookieLines(headers: http.IncomingHttpHeaders): string[] {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function locationHeader(headers: http.IncomingHttpHeaders): string | undefined {
  const raw = headers.location;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function loadMultipart(parts: MultipartPartPayload[]): { body: Uint8Array; contentType: string } {
  const built = buildMultipart(
    parts.map((part) => {
      const name = part.name.trim();
      if (!name) throw new Error("multipart 字段名为空");
      if (part.filePath) {
        const filePath = part.filePath;
        if (!fs.existsSync(filePath)) throw new Error(`文件不存在：${filePath}`);
        return {
          name,
          filename: part.fileName || path.basename(filePath),
          contentType: part.contentType || "application/octet-stream",
          data: new Uint8Array(fs.readFileSync(filePath)),
        };
      }
      return { name, data: part.text ?? "" };
    }),
  );
  return { body: built.body, contentType: built.contentType };
}

function loadTls(tls: TlsRequestConfig | undefined, isHttps: boolean): TlsMaterial | undefined {
  if (!tls) return undefined;
  const certPath = tls.certPath?.trim() || "";
  const keyPath = tls.keyPath?.trim() || "";
  const caPath = tls.caPath?.trim() || "";
  if (!certPath && !keyPath && !caPath && !tls.passphrase) return undefined;
  if (!isHttps) throw new Error("客户端证书仅适用于 https");
  if (!certPath || !keyPath) throw new Error("客户端证书需要同时选择 cert 与 key");
  if (!fs.existsSync(certPath)) throw new Error(`证书文件不存在：${certPath}`);
  if (!fs.existsSync(keyPath)) throw new Error(`私钥文件不存在：${keyPath}`);
  if (caPath && !fs.existsSync(caPath)) throw new Error(`CA 文件不存在：${caPath}`);
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    ca: caPath ? fs.readFileSync(caPath) : undefined,
    passphrase: tls.passphrase?.trim() || undefined,
  };
}

export function httpCancel(requestId = "default"): boolean {
  const slot = inflight.get(requestId);
  if (!slot) return false;
  slot.cancelled = true;
  if (slot.req) {
    slot.req.destroy(new Error("已取消"));
  }
  return true;
}

export function httpSend(payload: HttpRequestPayload): Promise<HttpResponsePayload> {
  const requestId = payload.requestId || "default";
  const previous = inflight.get(requestId);
  if (previous) {
    previous.cancelled = true;
    previous.req?.destroy(new Error("已取消"));
  }

  const slot: InflightSlot = { cancelled: false, req: null };
  inflight.set(requestId, slot);
  responseBinaries.delete(requestId);

  const timeoutMs = Math.max(1_000, Number(payload.timeoutMs) || 60_000);
  const followRedirects = payload.followRedirects !== false;
  const insecure = Boolean(payload.insecure);
  const started = Date.now();
  const deadline = started + timeoutMs;
  const redirects: RedirectHop[] = [];
  const setCookies: SetCookieEvent[] = [];

  const rawUrl = (payload.url || "").trim();
  if (!rawUrl) {
    inflight.delete(requestId);
    return Promise.reject(new Error("请填写请求 URL"));
  }

  function remainingTimeout(): number {
    return Math.max(1, deadline - Date.now());
  }

  function sendOnce(
    method: string,
    currentUrl: string,
    headers: Record<string, string>,
    body: Uint8Array,
    tlsMaterial: TlsMaterial | undefined,
    hop: number,
  ): Promise<HttpResponsePayload> {
    return new Promise((resolve, reject) => {
      if (slot.cancelled) {
        reject(new Error("已取消"));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("请求超时"));
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        reject(new Error("URL 无效"));
        return;
      }

      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      const sendBody = body.byteLength > 0 && method !== "GET" && method !== "HEAD";
      const reqHeaders = { ...headers };
      for (const key of Object.keys(reqHeaders)) {
        if (key.toLowerCase() === "content-length") delete reqHeaders[key];
      }
      if (sendBody) {
        reqHeaders["Content-Length"] = String(body.byteLength);
      }

      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method,
          headers: reqHeaders,
          rejectUnauthorized: isHttps ? !insecure : undefined,
          cert: isHttps ? tlsMaterial?.cert : undefined,
          key: isHttps ? tlsMaterial?.key : undefined,
          ca: isHttps ? tlsMaterial?.ca : undefined,
          passphrase: isHttps ? tlsMaterial?.passphrase : undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            if (slot.cancelled) {
              reject(new Error("已取消"));
              return;
            }

            const status = res.statusCode || 0;
            const location = locationHeader(res.headers);
            const hopCookies = setCookieLines(res.headers);
            for (const line of hopCookies) setCookies.push({ url: parsed.toString(), line });
            if (
              followRedirects &&
              REDIRECT_CODES.has(status) &&
              location &&
              hop < MAX_REDIRECTS
            ) {
              let nextUrl: string;
              try {
                nextUrl = new URL(location, parsed).toString();
              } catch {
                reject(new Error("重定向 Location 无效"));
                return;
              }
              redirects.push({
                status,
                url: parsed.toString(),
                location: nextUrl,
              });
              const nextMethod = hopMethod(status, method);
              const nextBody =
                nextMethod === "GET" || nextMethod === "HEAD" ? new Uint8Array() : body;
              resolve(sendOnce(nextMethod, nextUrl, headers, nextBody, tlsMaterial, hop + 1));
              return;
            }

            const responseHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              if (value == null) continue;
              if (key.toLowerCase() === "set-cookie") {
                responseHeaders[key] = hopCookies.join("\n");
                continue;
              }
              responseHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
            }
            const buf = Buffer.concat(chunks);
            const contentType = responseHeaders["content-type"] || "";
            const textual = isTextContentType(contentType);
            if (textual) responseBinaries.delete(requestId);
            else responseBinaries.set(requestId, buf);
            resolve({
              status,
              statusText: statusTextOf(status),
              headers: responseHeaders,
              body: textual ? buf.toString("utf8") : "",
              durationMs: Date.now() - started,
              error: null,
              url: parsed.toString(),
              sizeBytes: buf.length,
              redirects: redirects.length ? redirects : undefined,
              binary: textual ? undefined : true,
              contentType: contentType || undefined,
              setCookies: setCookies.length ? setCookies : undefined,
            });
          });
        },
      );

      slot.req = req;
      req.on("error", (err) => {
        if (slot.cancelled || err.message === "已取消") {
          reject(new Error("已取消"));
          return;
        }
        reject(new Error(`请求失败: ${err.message}`));
      });
      req.setTimeout(remainingTimeout(), () => {
        req.destroy(new Error("请求超时"));
      });
      if (sendBody) req.write(body);
      req.end();
    });
  }

  const method = (payload.method || "GET").trim().toUpperCase();
  let headers = headerRecord(payload.headers);
  let body = encoder.encode(payload.body || "");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    inflight.delete(requestId);
    return Promise.reject(new Error("URL 无效"));
  }
  const isHttps = parsedUrl.protocol === "https:";

  try {
    if (payload.multipart && payload.multipart.length > 0 && method !== "GET" && method !== "HEAD") {
      const multipart = loadMultipart(payload.multipart);
      headers = withMultipartContentType(headers, multipart.contentType);
      body = multipart.body;
    } else if (payload.urlencoded && method !== "GET" && method !== "HEAD") {
      headers = withUrlEncodedContentType(headers);
      body = encoder.encode(payload.body || "");
    }
    const tlsMaterial = loadTls(payload.tls, isHttps);
    return sendOnce(method, rawUrl, headers, body, tlsMaterial, 0).finally(() => {
      if (inflight.get(requestId) === slot) {
        inflight.delete(requestId);
      }
    });
  } catch (error) {
    inflight.delete(requestId);
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export type { HeaderItem };
