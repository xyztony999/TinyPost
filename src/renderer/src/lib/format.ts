import { formatXml, looksLikeXml } from "@shared/xml";

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export type StatusTone = "ok" | "redirect" | "client" | "server" | "unknown";

export function statusTone(status: number | null | undefined): StatusTone {
  if (status == null || status <= 0) return "unknown";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect";
  if (status >= 400 && status < 500) return "client";
  return "server";
}

export type BodyLanguage = "json" | "xml" | "text";

export function presentBody(
  text: string,
  pretty: boolean,
): { text: string; language: BodyLanguage; error: string | null } {
  const language: BodyLanguage = looksLikeJson(text) ? "json" : looksLikeXml(text) ? "xml" : "text";
  if (!pretty) return { text, language, error: null };
  if (language === "json") {
    try {
      return { text: JSON.stringify(JSON.parse(text), null, 2), language, error: null };
    } catch {
      return { text, language: "text", error: null };
    }
  }
  if (language === "xml") {
    try {
      return { text: formatXml(text), language, error: null };
    } catch (error) {
      return {
        text,
        language,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { text, language, error: null };
}

export function editorLanguage(text: string): BodyLanguage {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("<")) return "xml";
  return "text";
}

export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}
