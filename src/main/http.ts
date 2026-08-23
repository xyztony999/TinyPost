import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type {
  HeaderItem,
  HttpRequestPayload,
  HttpResponsePayload,
  RedirectHop,
} from "../shared/types";
import { isRowEnabled } from "../shared/types";

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

interface InflightSlot {
  cancelled: boolean;
  req: http.ClientRequest | null;
}

const inflight = new Map<string, InflightSlot>();

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

function locationHeader(headers: http.IncomingHttpHeaders): string | undefined {
  const raw = headers.location;
  if (Array.isArray(raw)) return raw[0];
  return raw;
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

  const timeoutMs = Math.max(1_000, Number(payload.timeoutMs) || 60_000);
  const followRedirects = payload.followRedirects !== false;
  const insecure = Boolean(payload.insecure);
  const started = Date.now();
  const deadline = started + timeoutMs;
  const redirects: RedirectHop[] = [];

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
    body: string,
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
      const sendBody = body.length > 0 && method !== "GET" && method !== "HEAD";
      const reqHeaders = { ...headers };
      for (const key of Object.keys(reqHeaders)) {
        if (key.toLowerCase() === "content-length") delete reqHeaders[key];
      }
      if (sendBody) {
        reqHeaders["Content-Length"] = Buffer.byteLength(body).toString();
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
              const nextBody = nextMethod === "GET" || nextMethod === "HEAD" ? "" : body;
              resolve(sendOnce(nextMethod, nextUrl, headers, nextBody, hop + 1));
              return;
            }

            const responseHeaders: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
              if (value == null) continue;
              responseHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
            }
            const buf = Buffer.concat(chunks);
            resolve({
              status,
              statusText: statusTextOf(status),
              headers: responseHeaders,
              body: buf.toString("utf8"),
              durationMs: Date.now() - started,
              error: null,
              url: parsed.toString(),
              sizeBytes: buf.length,
              redirects: redirects.length ? redirects : undefined,
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

  return sendOnce(
    (payload.method || "GET").trim().toUpperCase(),
    rawUrl,
    headerRecord(payload.headers),
    payload.body || "",
    0,
  ).finally(() => {
    if (inflight.get(requestId) === slot) {
      inflight.delete(requestId);
    }
  });
}

export type { HeaderItem };
