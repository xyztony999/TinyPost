import type { BodyMode, ExtractRule, FormField, UrlEncodedField } from "./types";

export interface RequestMeta {
  bodyMode: BodyMode;
  formFields: FormField[];
  urlencodedFields: UrlEncodedField[];
  extractors: ExtractRule[];
}

export function defaultRequestMeta(): RequestMeta {
  return { bodyMode: "raw", formFields: [], urlencodedFields: [], extractors: [] };
}

function asFormField(value: unknown): FormField | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const type = row.type === "file" ? "file" : "text";
  return {
    key: String(row.key ?? ""),
    type,
    value: String(row.value ?? ""),
    fileName: row.fileName != null ? String(row.fileName) : undefined,
    contentType: row.contentType != null ? String(row.contentType) : undefined,
    enabled: row.enabled === false ? false : true,
  };
}

function asUrlEncodedField(value: unknown): UrlEncodedField | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    key: String(row.key ?? ""),
    value: String(row.value ?? ""),
    enabled: row.enabled === false ? false : true,
  };
}

function asExtractRule(value: unknown): ExtractRule | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    path: String(row.path ?? ""),
    variable: String(row.variable ?? ""),
    enabled: row.enabled === false ? false : true,
  };
}

export function parseRequestMeta(raw: string | null | undefined): RequestMeta {
  if (!raw || raw === "{}") return defaultRequestMeta();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return defaultRequestMeta();
    const row = parsed as Record<string, unknown>;
    const formFields = Array.isArray(row.formFields)
      ? row.formFields.map(asFormField).filter((item): item is FormField => item !== null)
      : [];
    const urlencodedFields = Array.isArray(row.urlencodedFields)
      ? row.urlencodedFields
          .map(asUrlEncodedField)
          .filter((item): item is UrlEncodedField => item !== null)
      : [];
    const extractors = Array.isArray(row.extractors)
      ? row.extractors.map(asExtractRule).filter((item): item is ExtractRule => item !== null)
      : [];
    const bodyMode: BodyMode =
      row.bodyMode === "form-data" ? "form-data" : row.bodyMode === "urlencoded" ? "urlencoded" : "raw";
    return {
      bodyMode,
      formFields,
      urlencodedFields,
      extractors,
    };
  } catch {
    return defaultRequestMeta();
  }
}

export function compactFormFields(fields: FormField[]): FormField[] {
  return fields.filter(
    (field) =>
      field.key.trim() ||
      field.value.trim() ||
      Boolean(field.fileName) ||
      Boolean(field.contentType) ||
      field.enabled === false,
  );
}

export function compactExtractors(rules: ExtractRule[]): ExtractRule[] {
  return rules.filter((rule) => rule.path.trim() || rule.variable.trim() || rule.enabled === false);
}

export function compactUrlEncodedFields(fields: UrlEncodedField[]): UrlEncodedField[] {
  return fields.filter((field) => field.key.trim() || field.value.trim() || field.enabled === false);
}

export function serializeRequestMeta(meta: RequestMeta): string {
  return JSON.stringify({
    bodyMode: meta.bodyMode,
    formFields: compactFormFields(meta.formFields),
    urlencodedFields: compactUrlEncodedFields(meta.urlencodedFields),
    extractors: compactExtractors(meta.extractors),
  });
}
