export interface MultipartPart {
  name: string;
  filename?: string;
  contentType?: string;
  data: string | Uint8Array;
}

export interface MultipartBuild {
  body: Uint8Array;
  contentType: string;
  boundary: string;
}

const encoder = new TextEncoder();

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesOf(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

function includesBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `TinyPost${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function partsContain(parts: MultipartPart[], boundary: string): boolean {
  const needle = encoder.encode(boundary);
  for (const part of parts) {
    if (part.name.includes(boundary) || (part.filename || "").includes(boundary)) return true;
    if (includesBytes(bytesOf(part.data), needle)) return true;
  }
  return false;
}

export function escapeDisposition(value: string): string {
  return value.replace(/[\r\n]/g, "").replace(/"/g, "%22");
}

export function withMultipartContentType(
  headers: Record<string, string>,
  contentType: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") continue;
    next[key] = value;
  }
  next["Content-Type"] = contentType;
  return next;
}

export function buildMultipart(parts: MultipartPart[], preferredBoundary?: string): MultipartBuild {
  let boundary = preferredBoundary || randomBoundary();
  if (!preferredBoundary) {
    for (let attempt = 0; attempt < 4 && partsContain(parts, boundary); attempt++) {
      boundary = randomBoundary();
    }
  }
  if (partsContain(parts, boundary)) {
    throw new Error("multipart boundary 与内容冲突");
  }

  const chunks: Uint8Array[] = [];
  const push = (text: string) => chunks.push(encoder.encode(text));

  for (const part of parts) {
    if (!part.name) throw new Error("multipart 字段名为空");
    push(`--${boundary}\r\n`);
    const name = escapeDisposition(part.name);
    if (part.filename != null) {
      const filename = escapeDisposition(part.filename);
      push(`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`);
      push(`Content-Type: ${part.contentType || "application/octet-stream"}\r\n\r\n`);
    } else {
      push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    }
    chunks.push(bytesOf(part.data));
    push("\r\n");
  }
  push(`--${boundary}--\r\n`);

  return {
    body: concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
    boundary,
  };
}
