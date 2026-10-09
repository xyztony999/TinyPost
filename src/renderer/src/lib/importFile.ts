import {
  parsePortable,
  type PortableBackup,
  type PortableCollection,
  type PortableEnvironment,
} from "@shared/portable";
import {
  parsePostmanCollection,
  parsePostmanEnvironment,
  type PostmanEnvironmentResult,
  type PostmanImportResult,
} from "./postmanImport";

export type ImportPayload =
  | { type: "postman-collection"; data: PostmanImportResult }
  | { type: "postman-environment"; data: PostmanEnvironmentResult }
  | { type: "collection"; data: PortableCollection }
  | { type: "environment"; data: PortableEnvironment }
  | { type: "backup"; data: PortableBackup };

export function parseImportJson(raw: string): ImportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("不是有效的 JSON 文件");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("无法识别的导入文件");
  }
  const row = parsed as Record<string, unknown>;
  if (typeof row.kind === "string" && row.kind.startsWith("tinypost.")) {
    const doc = parsePortable(raw);
    if (doc.kind === "tinypost.collection") return { type: "collection", data: doc };
    if (doc.kind === "tinypost.environment") return { type: "environment", data: doc };
    return { type: "backup", data: doc };
  }
  const info = row.info as { schema?: string } | undefined;
  const schema = info?.schema || "";
  if (schema.includes("environment") || Array.isArray(row.values)) {
    return { type: "postman-environment", data: parsePostmanEnvironment(raw) };
  }
  return { type: "postman-collection", data: parsePostmanCollection(raw) };
}
