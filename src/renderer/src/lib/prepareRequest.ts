import { cookieHeaderValue, type CookieJar } from "@shared/cookies";
import { encodeUrlEncoded } from "@shared/urlencoded";
import type { RequestMeta } from "@shared/requestMeta";
import type {
  AuthConfig,
  HeaderItem,
  HttpRequestPayload,
  MultipartPartPayload,
  TlsRequestConfig,
} from "@shared/types";
import { isRowEnabled } from "@shared/types";
import { applyAuth } from "./auth";
import { substituteVars } from "./vars";

export interface PrepareRequestInput {
  method: string;
  url: string;
  headers: HeaderItem[];
  body: string;
  auth: AuthConfig;
  meta: RequestMeta;
  variables: Record<string, string>;
  jar: CookieJar;
  tls?: TlsRequestConfig;
  insecure: boolean;
  timeoutMs: number;
  followRedirects: boolean;
  requestId: string;
}

export function prepareHttpRequest(input: PrepareRequestInput): {
  error: string | null;
  payload: HttpRequestPayload | null;
} {
  const method = (input.method || "GET").toUpperCase();
  const skipBody = method === "GET" || method === "HEAD";
  const variables = input.variables;

  if (!skipBody && input.meta.bodyMode === "form-data") {
    for (const field of input.meta.formFields) {
      if (!isRowEnabled(field) || !field.key.trim()) continue;
      if (field.type === "file" && !substituteVars(field.value, variables).trim()) {
        return { error: `请为「${field.key}」选择文件`, payload: null };
      }
    }
  }

  const cleanedHeaders = input.headers.filter((header) => header.key.trim() && isRowEnabled(header));
  const resolvedUrl = substituteVars(input.url.trim(), variables);
  const resolvedHeaders = cleanedHeaders.map((header) => ({
    key: substituteVars(header.key, variables),
    value: substituteVars(header.value, variables),
    enabled: true,
  }));
  const finalHeaders = applyAuth(resolvedHeaders, input.auth, variables);
  if (input.jar.enabled && !finalHeaders.some((header) => header.key.toLowerCase() === "cookie")) {
    const cookie = cookieHeaderValue(input.jar, resolvedUrl);
    if (cookie) finalHeaders.push({ key: "Cookie", value: cookie, enabled: true });
  }

  const sendMultipart = !skipBody && input.meta.bodyMode === "form-data";
  const sendUrlEncoded = !skipBody && input.meta.bodyMode === "urlencoded";
  const encodedBody = sendUrlEncoded
    ? encodeUrlEncoded(
        input.meta.urlencodedFields
          .filter((field) => isRowEnabled(field) && (field.key.trim() || field.value.trim()))
          .map((field) => ({
            key: substituteVars(field.key, variables),
            value: substituteVars(field.value, variables),
          })),
      )
    : undefined;
  const multipart: MultipartPartPayload[] | undefined = sendMultipart
    ? input.meta.formFields
        .filter((field) => isRowEnabled(field) && field.key.trim())
        .map((field) => ({
          name: substituteVars(field.key, variables),
          text: field.type === "text" ? substituteVars(field.value, variables) : undefined,
          filePath: field.type === "file" ? substituteVars(field.value, variables) : undefined,
          fileName: field.fileName ? substituteVars(field.fileName, variables) : field.fileName,
          contentType: field.contentType ? substituteVars(field.contentType, variables) : field.contentType,
        }))
    : undefined;

  return {
    error: null,
    payload: {
      method,
      url: resolvedUrl,
      headers: finalHeaders,
      body: skipBody || sendMultipart ? undefined : sendUrlEncoded ? encodedBody : substituteVars(input.body, variables),
      multipart: multipart && multipart.length > 0 ? multipart : undefined,
      urlencoded: sendUrlEncoded,
      tls: input.tls,
      insecure: input.insecure,
      timeoutMs: input.timeoutMs,
      followRedirects: input.followRedirects,
      requestId: input.requestId,
    },
  };
}
