import type { ExtractRule } from "./types";

export class JsonPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonPathError";
  }
}

export interface ExtractionHit {
  variable: string;
  path: string;
  ok: boolean;
  value?: string;
  error?: string;
}

function fail(message: string): never {
  throw new JsonPathError(message);
}

function readProperty(current: unknown, key: string, display: string): unknown {
  if (current == null || typeof current !== "object" || Array.isArray(current)) {
    fail(`路径 ${display} 作用在非对象值上`);
  }
  const record = current as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    fail(`属性不存在：${key}`);
  }
  return record[key];
}

function readIndex(current: unknown, index: number): unknown {
  if (!Array.isArray(current)) fail(`下标 [${index}] 作用在非数组值上`);
  if (index < 0 || index >= current.length) fail(`数组下标越界：[${index}]`);
  return current[index];
}

export function queryJsonPath(data: unknown, expression: string): unknown {
  const expr = expression.trim();
  if (!expr.startsWith("$")) fail(`JSONPath 必须以 $ 开头：${expression}`);
  if (expr.includes("..")) fail("不支持递归下降 ..");
  if (expr.includes("*")) fail("不支持通配符 *");
  if (expr.includes("?") || expr.includes("@") || expr.includes("(")) {
    fail("不支持过滤表达式");
  }

  let index = 1;
  let current: unknown = data;
  if (expr === "$") return data;

  while (index < expr.length) {
    const ch = expr[index];
    if (ch === ".") {
      index += 1;
      if (index >= expr.length) fail("JSONPath 在 . 之后意外结束");
      if (expr[index] === "[") continue;
      if (!/[A-Za-z_]/.test(expr[index])) fail(`无法解析的片段：${expr.slice(index)}`);
      const start = index;
      index += 1;
      while (index < expr.length && /[\w$]/.test(expr[index])) index += 1;
      const key = expr.slice(start, index);
      current = readProperty(current, key, `.${key}`);
      continue;
    }
    if (ch === "[") {
      const end = expr.indexOf("]", index);
      if (end < 0) fail("JSONPath 缺少 ]");
      const inner = expr.slice(index + 1, end).trim();
      if (!inner) fail("JSONPath 下标为空");
      if (inner.includes(",")) fail("不支持多个下标");
      if (inner.includes(":")) fail("不支持切片");
      if (inner.startsWith("-")) fail("不支持负数下标");
      if (/^(0|[1-9]\d*)$/.test(inner)) {
        current = readIndex(current, Number(inner));
      } else if (
        (inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2) ||
        (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2)
      ) {
        const key = inner.slice(1, -1);
        if (key.includes(inner[0])) fail("不支持带转义的引号键");
        current = readProperty(current, key, `['${key}']`);
      } else {
        fail(`仅支持数组下标或引号键，无法解析：${inner}`);
      }
      index = end + 1;
      continue;
    }
    fail(`无法解析的片段：${expr.slice(index)}`);
  }
  return current;
}

export function valueToVariable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "";
  return JSON.stringify(value);
}

export function extractByRules(body: string, rules: ExtractRule[]): ExtractionHit[] {
  const active = rules.filter(
    (rule) => rule.enabled !== false && (rule.path.trim() || rule.variable.trim()),
  );
  let data: unknown;
  let parseError: string | null = null;
  try {
    data = JSON.parse(body);
  } catch {
    parseError = "响应不是合法 JSON";
  }

  return active.map((rule) => {
    const path = rule.path.trim();
    const variable = rule.variable.trim();
    if (!variable) return { variable, path, ok: false, error: "变量名为空" };
    if (!path) return { variable, path, ok: false, error: "JSONPath 为空" };
    if (parseError) return { variable, path, ok: false, error: parseError };
    try {
      const value = queryJsonPath(data, path);
      return { variable, path, ok: true, value: valueToVariable(value) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { variable, path, ok: false, error: message };
    }
  });
}
