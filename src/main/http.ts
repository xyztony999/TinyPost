import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type { HeaderItem, HttpRequestPayload, HttpResponsePayload } from "../shared/types";

function statusTextOf(code: number): string {
  return http.STATUS_CODES[code] || "";
}

export function httpSend(payload: HttpRequestPayload): Promise<HttpResponsePayload> {
  return new Promise((resolve, reject) => {
    const method = (payload.method || "GET").trim().toUpperCase();
    const rawUrl = (payload.url || "").trim();
    if (!rawUrl) {
      reject(new Error("请填写请求 URL"));
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      reject(new Error("URL 无效"));
      return;
    }

    const insecure = Boolean(payload.insecure);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const headers: Record<string, string> = {};
    for (const h of payload.headers || []) {
      const key = h.key.trim();
      if (!key) continue;
      headers[key] = h.value;
    }

    const body = payload.body || "";
    const hasBody = body.length > 0 && method !== "GET" && method !== "HEAD";
    if (hasBody && !Object.keys(headers).some((k) => k.toLowerCase() === "content-length")) {
      headers["Content-Length"] = Buffer.byteLength(body).toString();
    }

    const started = Date.now();
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        rejectUnauthorized: isHttps ? !insecure : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            responseHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value);
          }
          const status = res.statusCode || 0;
          resolve({
            status,
            statusText: statusTextOf(status),
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString("utf8"),
            durationMs: Date.now() - started,
            error: null,
          });
        });
      },
    );

    req.on("error", (err) => reject(new Error(`请求失败: ${err.message}`)));
    req.setTimeout(60_000, () => {
      req.destroy(new Error("请求超时"));
    });

    if (hasBody) req.write(body);
    req.end();
  });
}

export type { HeaderItem };
