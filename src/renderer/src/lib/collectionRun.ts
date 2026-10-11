import { mergeSetCookies, type CookieJar } from "@shared/cookies";
import { extractByRules, type ExtractionHit } from "@shared/jsonpath";
import { compactExtractors } from "@shared/requestMeta";
import type { ExtractRule, SetCookieEvent, VariableItem } from "@shared/types";

export interface RunStep {
  savedId: number;
  name: string;
  method: string;
  status: number | null;
  durationMs: number | null;
  error: string | null;
  stopped: boolean;
  binary: boolean;
  contentType?: string;
  sizeBytes?: number;
}

export interface RunReport {
  collectionId: number;
  collectionName: string;
  running: boolean;
  cancelled: boolean;
  steps: RunStep[];
}

export function advanceEnvironment(input: {
  variables: VariableItem[];
  jar: CookieJar;
  status: number;
  body: string;
  binary: boolean;
  setCookies?: SetCookieEvent[];
  extractors: ExtractRule[];
}): { variables: VariableItem[]; jar: CookieJar; hits: ExtractionHit[]; proceed: boolean } {
  const jar =
    input.jar.enabled && input.setCookies?.length
      ? mergeSetCookies(input.jar, input.setCookies)
      : input.jar;
  const proceed = input.status >= 200 && input.status < 300;
  if (!proceed || input.binary) {
    return { variables: input.variables, jar, hits: [], proceed };
  }
  const hits = extractByRules(input.body, compactExtractors(input.extractors));
  const variables = input.variables.map((item) => ({ ...item }));
  for (const hit of hits) {
    if (!hit.ok || hit.value === undefined) continue;
    const index = variables.findIndex((item) => item.key === hit.variable);
    if (index >= 0) variables[index] = { key: hit.variable, value: hit.value };
    else variables.push({ key: hit.variable, value: hit.value });
  }
  return { variables, jar, hits, proceed };
}

export function runSummary(report: RunReport): string {
  if (report.running) return `正在运行「${report.collectionName}」`;
  if (report.cancelled) return `已取消「${report.collectionName}」`;
  const stopped = report.steps.find((step) => step.stopped);
  if (stopped) {
    const detail = stopped.error || (stopped.status != null ? String(stopped.status) : "");
    return detail ? `已停止：${stopped.name}（${detail}）` : `已停止：${stopped.name}`;
  }
  return `已跑完「${report.collectionName}」`;
}
