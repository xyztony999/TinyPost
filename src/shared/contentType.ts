export function mediaType(contentType: string | undefined): string {
  return (contentType || "").split(";")[0]?.trim().toLowerCase() || "";
}

export function isTextContentType(contentType: string | undefined): boolean {
  const type = mediaType(contentType);
  if (!type) return true;
  if (type.startsWith("text/")) return true;
  if (type === "application/json" || type.endsWith("+json")) return true;
  if (type === "application/xml" || type === "application/xhtml+xml" || type.endsWith("+xml")) return true;
  if (type === "application/javascript" || type === "application/x-javascript") return true;
  if (type === "application/x-www-form-urlencoded") return true;
  if (type === "application/graphql" || type === "application/graphql-response+json") return true;
  return false;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/octet-stream": "bin",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function extensionForContentType(contentType: string | undefined): string {
  const type = mediaType(contentType);
  if (EXTENSIONS[type]) return EXTENSIONS[type];
  if (type.startsWith("image/")) {
    const subtype = type.slice("image/".length).replace("+xml", "");
    return subtype || "bin";
  }
  return "bin";
}

export function binaryHistoryNote(contentType: string | undefined, sizeBytes: number): string {
  const type = mediaType(contentType) || "application/octet-stream";
  return `[二进制响应 ${type}，${sizeBytes} 字节]`;
}
