import { useEffect, useMemo, useRef, useState } from "react";
import { TinyPostLogo } from "./components/TinyPostLogo";
import { EnvEditor } from "./components/EnvEditor";
import { CurlImportDialog, METHODS, RequestEditor, type ComposerTab } from "./components/RequestEditor";
import { ResponseView } from "./components/ResponseView";
import { Sidebar } from "./components/Sidebar";
import {
  backupDatabase,
  clearHistory,
  createCollection,
  deleteCollection,
  deleteEnvironment,
  deleteSavedRequest,
  ensureDefaultEnvironment,
  getSettings,
  httpCancel,
  listCollections,
  listHistory,
  listSavedRequests,
  pickFile,
  renameCollection,
  renameSavedRequest,
  restoreDatabase,
  saveHistory,
  saveRequest,
  saveBinaryResponse,
  saveResponseBody,
  saveSettings,
  saveTextFile,
  setActiveEnvironment,
  upsertEnvironment,
} from "./db";
import { applyAuth, parseAuthJson } from "./lib/auth";
import { binaryHistoryNote, extensionForContentType } from "@shared/contentType";
import {
  cookieHeaderValue,
  emptyCookieJar,
  emptyStoredCookie,
  mergeSetCookies,
  parseCookieJar,
  type CookieJar,
  type StoredCookie,
} from "@shared/cookies";
import { looksLikeJson } from "./lib/format";
import { parseImportJson } from "./lib/importFile";
import {
  buildUrl,
  mergeQueryFromUrl,
  parseQueryJson,
  queryFromUrl,
  serializeQuery,
  withTrailingEmpty,
} from "./lib/query";
import { parseVariablesJson, substituteVars, variablesToMap } from "./lib/vars";
import { buildCurl, parseCurl } from "@shared/curl";
import { extractByRules, type ExtractionHit } from "@shared/jsonpath";
import type { PortableRequest } from "@shared/portable";
import { PORTABLE_VERSION } from "@shared/portable";
import {
  compactExtractors,
  compactFormFields,
  compactUrlEncodedFields,
  parseRequestMeta,
  serializeRequestMeta,
} from "@shared/requestMeta";
import { encodeUrlEncoded } from "@shared/urlencoded";
import { looksLikeXml } from "@shared/xml";
import type {
  AuthConfig,
  BodyMode,
  CollectionRow,
  EnvironmentRow,
  ExtractRule,
  FormField,
  HeaderItem,
  HistoryRow,
  HttpMethod,
  HttpResponsePayload,
  MultipartPartPayload,
  QueryItem,
  SavedRequestRow,
  TlsConfig,
  TlsRequestConfig,
  UrlEncodedField,
  VariableItem,
} from "@shared/types";
import {
  DEFAULT_SETTINGS,
  defaultAuth,
  emptyExtractRule,
  emptyFormField,
  emptyHeader,
  emptyTls,
  emptyUrlEncodedField,
  emptyVariable,
  isRowEnabled,
} from "@shared/types";
import "./App.css";

const COMPOSER_REQUEST_ID = "composer";

function parseHeadersJson(raw: string): HeaderItem[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): HeaderItem | null => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          key: String(row.key ?? ""),
          value: String(row.value ?? ""),
          enabled: row.enabled === false ? false : true,
        };
      })
      .filter((item): item is HeaderItem => item !== null);
  } catch {
    return [];
  }
}

function parseResponseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
    );
  } catch {
    return {};
  }
}

function parseTls(raw: string | null | undefined): TlsConfig {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<TlsConfig>;
    return {
      certPath: String(parsed.certPath ?? ""),
      keyPath: String(parsed.keyPath ?? ""),
      caPath: String(parsed.caPath ?? ""),
    };
  } catch {
    return emptyTls();
  }
}

function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

function persistList<T>(items: T[], isFilled: (item: T) => boolean, empty: () => T): T[] {
  if (items.length === 0) return [empty()];
  return isFilled(items[items.length - 1]) ? [...items, empty()] : items;
}

function persistHeaders(next: HeaderItem[]): HeaderItem[] {
  return persistList(next, (item) => Boolean(item.key || item.value), emptyHeader);
}

function persistFormFields(next: FormField[]): FormField[] {
  return persistList(
    next,
    (item) => Boolean(item.key || item.value || item.fileName || item.contentType),
    emptyFormField,
  );
}

function persistExtractors(next: ExtractRule[]): ExtractRule[] {
  return persistList(next, (item) => Boolean(item.path || item.variable), emptyExtractRule);
}

function persistUrlEncoded(next: UrlEncodedField[]): UrlEncodedField[] {
  return persistList(next, (item) => Boolean(item.key || item.value), emptyUrlEncodedField);
}

function persistCookieRows(next: StoredCookie[]): StoredCookie[] {
  return persistList(next, (item) => Boolean(item.name || item.value), emptyStoredCookie);
}

function editorJar(jar: CookieJar): CookieJar {
  return { enabled: jar.enabled !== false, items: persistCookieRows(jar.items) };
}

function savedJar(jar: CookieJar): CookieJar {
  return {
    enabled: jar.enabled !== false,
    items: jar.items
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        domain: item.domain.trim().toLowerCase(),
        path: item.path.trim() || "/",
        hostOnly: item.domain.trim() ? item.hostOnly : true,
      })),
  };
}

function App() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("{{baseUrl}}/api/health");
  const [queryParams, setQueryParams] = useState<QueryItem[]>(() => queryFromUrl("{{baseUrl}}/api/health"));
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: "Accept", value: "application/json", enabled: true },
    emptyHeader(),
  ]);
  const [body, setBody] = useState("");
  const [bodyMode, setBodyMode] = useState<BodyMode>("raw");
  const [formFields, setFormFields] = useState<FormField[]>([emptyFormField()]);
  const [urlencodedFields, setUrlEncodedFields] = useState<UrlEncodedField[]>([emptyUrlEncodedField()]);
  const [extractors, setExtractors] = useState<ExtractRule[]>([emptyExtractRule()]);
  const [auth, setAuth] = useState<AuthConfig>(defaultAuth());
  const [insecure, setInsecure] = useState(DEFAULT_SETTINGS.insecure);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_SETTINGS.timeoutMs);
  const [followRedirects, setFollowRedirects] = useState(DEFAULT_SETTINGS.followRedirects);
  const [settingsReady, setSettingsReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [composerTab, setComposerTab] = useState<ComposerTab>("headers");
  const [responseTab, setResponseTab] = useState<"body" | "headers" | "redirects">("body");
  const [responsePretty, setResponsePretty] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"collections" | "history">("collections");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [extractNotice, setExtractNotice] = useState<ExtractionHit[]>([]);

  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [savedRequests, setSavedRequests] = useState<SavedRequestRow[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<number[]>([]);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [editingEnvId, setEditingEnvId] = useState<number | null>(null);
  const [envName, setEnvName] = useState("");
  const [envVars, setEnvVars] = useState<VariableItem[]>([emptyVariable()]);
  const [envTls, setEnvTls] = useState<TlsConfig>(emptyTls());
  const [envCookies, setEnvCookies] = useState<CookieJar>(emptyCookieJar());
  const [envPassphrase, setEnvPassphrase] = useState("");
  const [tlsPassphrases, setTlsPassphrases] = useState<Record<number, string>>({});
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [curlDraft, setCurlDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);
  const [currentCollectionId, setCurrentCollectionId] = useState<number | null>(null);
  const [currentSavedName, setCurrentSavedName] = useState("");

  const toastTimer = useRef<number | null>(null);
  const actionsRef = useRef({
    send: () => {},
    save: () => {},
    saveEnv: () => {},
    importCurl: () => {},
    showEnv: false,
    showCurl: false,
  });

  const activeEnv = useMemo(
    () => environments.find((env) => env.is_active === 1) || environments[0] || null,
    [environments],
  );
  const activeVars = useMemo(
    () => variablesToMap(parseVariablesJson(activeEnv?.variables || "[]")),
    [activeEnv],
  );
  const canSend = useMemo(() => url.trim().length > 0 && !sending, [url, sending]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  async function refreshAll() {
    const [envs, cols, reqs, hist] = await Promise.all([
      ensureDefaultEnvironment(),
      listCollections(),
      listSavedRequests(),
      listHistory(),
    ]);
    setEnvironments(envs);
    setCollections(cols);
    setSavedRequests(reqs);
    setHistory(hist);
    setExpandedCollections((prev) => (prev.length > 0 ? prev : cols.slice(0, 3).map((item) => item.id)));
  }

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getSettings();
        setTimeoutMs(settings.timeoutMs);
        setInsecure(settings.insecure);
        setFollowRedirects(settings.followRedirects);
        setSettingsReady(true);
        await refreshAll();
      } catch (e) {
        console.error(e);
        setSettingsReady(true);
      }
    })();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    void saveSettings({ timeoutMs, insecure, followRedirects }).catch((e) => console.error(e));
  }, [timeoutMs, insecure, followRedirects, settingsReady]);

  useEffect(() => {
    if (!sending) {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setElapsedMs(Date.now() - started), 80);
    return () => window.clearInterval(id);
  }, [sending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "enter") {
        event.preventDefault();
        if (actionsRef.current.showEnv || actionsRef.current.showCurl) return;
        actionsRef.current.send();
      } else if (key === "s") {
        event.preventDefault();
        if (actionsRef.current.showCurl) actionsRef.current.importCurl();
        else if (actionsRef.current.showEnv) actionsRef.current.saveEnv();
        else actionsRef.current.save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function updateHeader(index: number, patch: Partial<HeaderItem>) {
    setHeaders((prev) => persistHeaders(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))));
  }

  function removeHeader(index: number) {
    setHeaders((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? persistHeaders(next) : [emptyHeader()];
    });
  }

  function applyQueryItems(next: QueryItem[]) {
    const padded = withTrailingEmpty(next);
    setQueryParams(padded);
    setUrl((prev) => buildUrl(prev, padded));
  }

  function updateQuery(index: number, patch: Partial<QueryItem>) {
    applyQueryItems(queryParams.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeQuery(index: number) {
    applyQueryItems(queryParams.filter((_, i) => i !== index));
  }

  function updateFormField(index: number, patch: Partial<FormField>) {
    setFormFields((prev) =>
      persistFormFields(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    );
  }

  function removeFormField(index: number) {
    setFormFields((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? persistFormFields(next) : [emptyFormField()];
    });
  }

  function updateUrlEncodedField(index: number, patch: Partial<UrlEncodedField>) {
    setUrlEncodedFields((prev) =>
      persistUrlEncoded(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    );
  }

  function removeUrlEncodedField(index: number) {
    setUrlEncodedFields((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? persistUrlEncoded(next) : [emptyUrlEncodedField()];
    });
  }

  function updateExtractor(index: number, patch: Partial<ExtractRule>) {
    setExtractors((prev) =>
      persistExtractors(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    );
  }

  function removeExtractor(index: number) {
    setExtractors((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? persistExtractors(next) : [emptyExtractRule()];
    });
  }

  function updateEnvVar(index: number, patch: Partial<VariableItem>) {
    setEnvVars((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      if (index === next.length - 1 && (patch.key || patch.value)) next.push(emptyVariable());
      return next;
    });
  }

  function setComposerUrl(next: string) {
    setUrl(next);
    setQueryParams((prev) => mergeQueryFromUrl(next, prev));
  }

  function bindSaved(saved?: { id: number; collectionId: number | null; name: string } | null) {
    setCurrentSavedId(saved?.id ?? null);
    setCurrentCollectionId(saved?.collectionId ?? null);
    setCurrentSavedName(saved?.name ?? "");
  }

  function loadQueryState(urlValue: string, rawQuery?: string) {
    const stored = parseQueryJson(rawQuery);
    if (stored) {
      setQueryParams(stored);
      setUrl(buildUrl(urlValue, stored));
      return;
    }
    setUrl(urlValue);
    setQueryParams(queryFromUrl(urlValue));
  }

  function loadRequestState(input: {
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    auth?: AuthConfig;
    query?: string;
    meta?: string;
    response?: HttpResponsePayload | null;
    saved?: { id: number; collectionId: number | null; name: string } | null;
    tab?: ComposerTab;
  }) {
    setMethod((input.method.toUpperCase() as HttpMethod) || "GET");
    loadQueryState(input.url, input.query);
    setHeaders(input.headers.length ? persistHeaders(input.headers) : [emptyHeader()]);
    setBody(input.body || "");
    const meta = parseRequestMeta(input.meta);
    setBodyMode(meta.bodyMode);
    setFormFields(meta.formFields.length ? persistFormFields(meta.formFields) : [emptyFormField()]);
    setUrlEncodedFields(
      meta.urlencodedFields.length ? persistUrlEncoded(meta.urlencodedFields) : [emptyUrlEncodedField()],
    );
    setExtractors(meta.extractors.length ? persistExtractors(meta.extractors) : [emptyExtractRule()]);
    setAuth(input.auth || defaultAuth());
    setResponse(input.response ?? null);
    setError(null);
    setExtractNotice([]);
    setComposerTab(input.tab ?? "headers");
    setResponseTab("body");
    setResponsePretty(true);
    bindSaved(input.saved ?? null);
  }

  function loadHistoryItem(item: HistoryRow) {
    loadRequestState({
      method: item.method,
      url: item.url,
      headers: parseHeadersJson(item.request_headers),
      body: item.request_body || "",
      auth: parseAuthJson(item.auth),
      query: item.query,
      meta: item.meta,
      response: {
        status: item.status ?? 0,
        statusText: "",
        headers: parseResponseHeaders(item.response_headers),
        body: item.response_body || "",
        durationMs: item.duration_ms ?? 0,
        sizeBytes: new Blob([item.response_body || ""]).size,
      },
    });
  }

  function loadSavedRequest(item: SavedRequestRow) {
    loadRequestState({
      method: item.method,
      url: item.url,
      headers: parseHeadersJson(item.headers),
      body: item.body || "",
      auth: parseAuthJson(item.auth),
      query: item.query,
      meta: item.meta,
      response: null,
      saved: { id: item.id, collectionId: item.collection_id, name: item.name },
    });
  }

  function composerPayload() {
    return {
      method,
      url,
      headers: headers.filter((header) => header.key.trim()),
      body,
      auth,
      query: serializeQuery(queryParams),
      meta: serializeRequestMeta({
        bodyMode,
        formFields: compactFormFields(formFields),
        urlencodedFields: compactUrlEncodedFields(urlencodedFields),
        extractors: compactExtractors(extractors),
      }),
    };
  }

  function resolvedCurl(): string {
    const cleanedHeaders = headers
      .filter((header) => header.key.trim() && isRowEnabled(header))
      .map((header) => ({
        key: substituteVars(header.key, activeVars),
        value: substituteVars(header.value, activeVars),
        enabled: true,
      }));
    const skipBody = method === "GET" || method === "HEAD";
    return buildCurl({
      method,
      url: substituteVars(url.trim(), activeVars),
      headers: applyAuth(cleanedHeaders, auth, activeVars),
      body: skipBody ? "" : substituteVars(body, activeVars),
      bodyMode: skipBody ? "raw" : bodyMode,
      formFields: skipBody
        ? []
        : formFields
            .filter((field) => isRowEnabled(field) && field.key.trim())
            .map((field) => ({
              ...field,
              key: substituteVars(field.key, activeVars),
              value: substituteVars(field.value, activeVars),
              fileName: field.fileName ? substituteVars(field.fileName, activeVars) : field.fileName,
              contentType: field.contentType
                ? substituteVars(field.contentType, activeVars)
                : field.contentType,
            })),
      urlencodedFields: skipBody
        ? []
        : urlencodedFields
            .filter((field) => isRowEnabled(field) && field.key.trim())
            .map((field) => ({
              key: substituteVars(field.key, activeVars),
              value: substituteVars(field.value, activeVars),
              enabled: true,
            })),
    });
  }

  function activeTlsPayload(): TlsRequestConfig | undefined {
    if (!activeEnv) return undefined;
    const tls = parseTls(activeEnv.tls);
    const passphrase = tlsPassphrases[activeEnv.id] || "";
    if (!tls.certPath && !tls.keyPath && !tls.caPath && !passphrase) return undefined;
    return { ...tls, passphrase: passphrase || undefined };
  }

  async function writeVariables(updates: Array<{ key: string; value: string }>) {
    if (!activeEnv) {
      showToast("没有活动环境");
      return false;
    }
    const current = parseVariablesJson(activeEnv.variables);
    for (const update of updates) {
      const index = current.findIndex((item) => item.key === update.key);
      if (index >= 0) current[index] = { key: update.key, value: update.value };
      else current.push(update);
    }
    await upsertEnvironment({
      id: activeEnv.id,
      name: activeEnv.name,
      variables: current,
      tls: parseTls(activeEnv.tls),
    });
    const envs = await ensureDefaultEnvironment();
    setEnvironments(envs);
    if (showEnvEditor && editingEnvId === activeEnv.id) {
      const fresh = envs.find((env) => env.id === activeEnv.id);
      const vars = parseVariablesJson(fresh?.variables || "[]");
      setEnvVars(vars.length ? [...vars, emptyVariable()] : [emptyVariable()]);
    }
    return true;
  }

  async function applyHits(hits: ExtractionHit[]) {
    const writable = hits.filter((hit) => hit.ok && hit.value !== undefined);
    if (writable.length === 0) {
      setExtractNotice(hits);
      return;
    }
    const wrote = await writeVariables(
      writable.map((hit) => ({ key: hit.variable, value: hit.value || "" })),
    );
    setExtractNotice(
      wrote ? hits : hits.map((hit) => (hit.ok ? { ...hit, ok: false, error: "没有活动环境" } : hit)),
    );
  }

  async function sendRequest() {
    if (!canSend) return;
    if (bodyMode === "form-data" && method !== "GET" && method !== "HEAD") {
      for (const field of formFields) {
        if (!isRowEnabled(field) || !field.key.trim()) continue;
        if (field.type === "file" && !field.value.trim()) {
          setError(`请为「${field.key}」选择文件`);
          return;
        }
      }
    }

    setSending(true);
    setError(null);
    setResponse(null);
    setExtractNotice([]);

    const cleanedHeaders = headers.filter((header) => header.key.trim() && isRowEnabled(header));
    const resolvedUrl = substituteVars(url.trim(), activeVars);
    const resolvedHeaders = cleanedHeaders.map((header) => ({
      key: substituteVars(header.key, activeVars),
      value: substituteVars(header.value, activeVars),
      enabled: true,
    }));
    const resolvedBody = substituteVars(body, activeVars);
    const finalHeaders = applyAuth(resolvedHeaders, auth, activeVars);
    const jar = activeEnv ? parseCookieJar(activeEnv.cookies) : emptyCookieJar();
    if (jar.enabled && !finalHeaders.some((header) => header.key.toLowerCase() === "cookie")) {
      const cookie = cookieHeaderValue(jar, resolvedUrl);
      if (cookie) finalHeaders.push({ key: "Cookie", value: cookie, enabled: true });
    }
    const sendMultipart = bodyMode === "form-data" && method !== "GET" && method !== "HEAD";
    const sendUrlEncoded = bodyMode === "urlencoded" && method !== "GET" && method !== "HEAD";
    const encodedBody = sendUrlEncoded
      ? encodeUrlEncoded(
          urlencodedFields
            .filter((field) => isRowEnabled(field) && (field.key.trim() || field.value.trim()))
            .map((field) => ({
              key: substituteVars(field.key, activeVars),
              value: substituteVars(field.value, activeVars),
            })),
        )
      : undefined;
    const multipart: MultipartPartPayload[] | undefined = sendMultipart
      ? formFields
          .filter((field) => isRowEnabled(field) && field.key.trim())
          .map((field) => ({
            name: substituteVars(field.key, activeVars),
            text: field.type === "text" ? substituteVars(field.value, activeVars) : undefined,
            filePath: field.type === "file" ? substituteVars(field.value, activeVars) : undefined,
            fileName: field.fileName ? substituteVars(field.fileName, activeVars) : undefined,
            contentType: field.contentType ? substituteVars(field.contentType, activeVars) : undefined,
          }))
      : undefined;

    try {
      const result = await window.tinypost.httpSend({
        method,
        url: resolvedUrl,
        headers: finalHeaders,
        body:
          method === "GET" || method === "HEAD" || sendMultipart
            ? undefined
            : sendUrlEncoded
              ? encodedBody
              : resolvedBody,
        multipart: multipart && multipart.length > 0 ? multipart : undefined,
        urlencoded: sendUrlEncoded,
        tls: activeTlsPayload(),
        insecure,
        timeoutMs,
        followRedirects,
        requestId: COMPOSER_REQUEST_ID,
      });

      setResponse(result);
      setResponseTab("body");
      const payload = composerPayload();
      const historyResponse = result.binary
        ? {
            ...result,
            body: binaryHistoryNote(result.contentType, result.sizeBytes ?? 0),
            binary: false,
            setCookies: undefined,
          }
        : result;
      await saveHistory({ ...payload, response: historyResponse });
      setHistory(await listHistory());
      if (jar.enabled && result.setCookies?.length && activeEnv) {
        const nextJar = mergeSetCookies(jar, result.setCookies);
        await upsertEnvironment({
          id: activeEnv.id,
          name: activeEnv.name,
          variables: parseVariablesJson(activeEnv.variables),
          tls: parseTls(activeEnv.tls),
          cookies: nextJar,
        });
        const envs = await ensureDefaultEnvironment();
        setEnvironments(envs);
        if (showEnvEditor && editingEnvId === activeEnv.id) {
          setEnvCookies({
            ...nextJar,
            items: persistCookieRows(nextJar.items),
          });
        }
      }
      if (result.status >= 200 && result.status < 300 && !result.binary) {
        const rules = compactExtractors(extractors);
        if (rules.length > 0) {
          const hits = extractByRules(result.body, rules);
          await applyHits(hits);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (message !== "已取消") setResponse(null);
    } finally {
      setSending(false);
    }
  }

  async function cancelRequest() {
    await httpCancel(COMPOSER_REQUEST_ID);
  }

  async function onClearHistory() {
    await clearHistory();
    setHistory([]);
  }

  async function onChangeEnvironment(id: number) {
    await setActiveEnvironment(id);
    setEnvironments(await ensureDefaultEnvironment());
  }

  function openEnvEditor(env?: EnvironmentRow) {
    if (env) {
      setEditingEnvId(env.id);
      setEnvName(env.name);
      const vars = parseVariablesJson(env.variables);
      setEnvVars(vars.length ? [...vars, emptyVariable()] : [emptyVariable()]);
      setEnvTls(parseTls(env.tls));
      setEnvCookies(editorJar(parseCookieJar(env.cookies)));
      setEnvPassphrase(tlsPassphrases[env.id] || "");
    } else {
      setEditingEnvId(null);
      setEnvName("新环境");
      setEnvVars([
        { key: "baseUrl", value: "http://127.0.0.1:8080" },
        { key: "token", value: "" },
        emptyVariable(),
      ]);
      setEnvTls(emptyTls());
      setEnvCookies(editorJar(emptyCookieJar()));
      setEnvPassphrase("");
    }
    setShowEnvEditor(true);
  }

  async function saveEnvEditor() {
    const name = envName.trim();
    if (!name) {
      showToast("请填写环境名称");
      return;
    }
    const variables = envVars.filter((item) => item.key.trim());
    const id = await upsertEnvironment({
      id: editingEnvId ?? undefined,
      name,
      variables,
      tls: envTls,
      cookies: savedJar(envCookies),
      makeActive: true,
    });
    setTlsPassphrases((prev) => ({ ...prev, [id]: envPassphrase }));
    setShowEnvEditor(false);
    await setActiveEnvironment(id);
    setEnvironments(await ensureDefaultEnvironment());
    showToast("环境已保存");
  }

  async function onDeleteEnvironment() {
    if (!editingEnvId) return;
    if (environments.length <= 1) {
      showToast("至少保留一个环境");
      return;
    }
    await deleteEnvironment(editingEnvId);
    setTlsPassphrases((prev) => {
      const next = { ...prev };
      delete next[editingEnvId];
      return next;
    });
    setShowEnvEditor(false);
    setEnvironments(await ensureDefaultEnvironment());
    showToast("环境已删除");
  }

  async function onCreateCollection() {
    const name = window.prompt("集合名称", "我的接口");
    if (!name?.trim()) return;
    const id = await createCollection(name.trim());
    setCollections(await listCollections());
    setExpandedCollections((prev) => [...prev, id]);
    showToast("集合已创建");
  }

  async function persistCurrentRequest(input: { id?: number; collectionId: number; name: string }) {
    const payload = composerPayload();
    const id = await saveRequest({
      id: input.id,
      collectionId: input.collectionId,
      name: input.name,
      ...payload,
    });
    setSavedRequests(await listSavedRequests());
    bindSaved({ id, collectionId: input.collectionId, name: input.name });
    setExpandedCollections((prev) =>
      prev.includes(input.collectionId) ? prev : [...prev, input.collectionId],
    );
    setSidebarTab("collections");
    return id;
  }

  async function onOverwriteSave() {
    if (!currentSavedId || currentCollectionId == null) {
      await onSaveAs();
      return;
    }
    await persistCurrentRequest({
      id: currentSavedId,
      collectionId: currentCollectionId,
      name: currentSavedName || `${method} ${url}`,
    });
    showToast("已覆盖保存");
  }

  async function onSaveAs() {
    if (collections.length === 0) {
      const name = window.prompt("先创建一个集合", "我的接口");
      if (!name?.trim()) return;
      await createCollection(name.trim());
    }
    const latest = await listCollections();
    setCollections(latest);
    if (latest.length === 0) return;

    const collectionNameList = latest.map((item, index) => `${index + 1}. ${item.name}`).join("\n");
    const pick = window.prompt(`保存到哪个集合？输入序号：\n${collectionNameList}`, "1");
    const index = Number(pick) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= latest.length) {
      showToast("无效的集合序号");
      return;
    }
    const reqName = window.prompt("请求名称", currentSavedName || `${method} ${url}`) || `${method} ${url}`;
    await persistCurrentRequest({ collectionId: latest[index].id, name: reqName.trim() });
    showToast("已保存到集合");
  }

  async function onRenameCollection(collection: CollectionRow) {
    const name = window.prompt("集合名称", collection.name);
    if (!name?.trim() || name.trim() === collection.name) return;
    await renameCollection(collection.id, name.trim());
    setCollections(await listCollections());
    showToast("集合已重命名");
  }

  async function onRenameSavedRequest(item: SavedRequestRow) {
    const name = window.prompt("请求名称", item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    await renameSavedRequest(item.id, name.trim());
    setSavedRequests(await listSavedRequests());
    if (currentSavedId === item.id) setCurrentSavedName(name.trim());
    showToast("请求已重命名");
  }

  async function onDeleteCollection(id: number) {
    if (!window.confirm("删除该集合及其全部请求？")) return;
    await deleteCollection(id);
    setCollections(await listCollections());
    setSavedRequests(await listSavedRequests());
    if (currentCollectionId === id) bindSaved(null);
  }

  async function onDeleteSavedRequest(id: number) {
    await deleteSavedRequest(id);
    setSavedRequests(await listSavedRequests());
    if (currentSavedId === id) bindSaved(null);
  }

  async function saveNamedEnvironment(
    name: string,
    variables: VariableItem[],
    tls: TlsConfig = emptyTls(),
    makeActive = false,
    cookies: CookieJar = emptyCookieJar(),
  ) {
    try {
      return await upsertEnvironment({ name, variables, tls, cookies, makeActive });
    } catch {
      return await upsertEnvironment({
        name: `${name} ${Date.now()}`,
        variables,
        tls,
        cookies,
        makeActive,
      });
    }
  }

  async function importRequestList(name: string, requests: PortableRequest[]) {
    const collectionId = await createCollection(name);
    for (const req of requests) {
      const stored = req.query?.length ? req.query : queryFromUrl(req.url);
      await saveRequest({
        collectionId,
        name: req.name,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        auth: req.auth,
        query: serializeQuery(stored),
        meta: serializeRequestMeta({
          bodyMode: req.bodyMode || "raw",
          formFields: req.formFields || [],
          urlencodedFields: req.urlencodedFields || [],
          extractors: req.extractors || [],
        }),
      });
    }
    return collectionId;
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const imported = parseImportJson(text);
      if (imported.type === "postman-environment" || imported.type === "environment") {
        const tls = imported.type === "environment" ? imported.data.tls : emptyTls();
        const cookies = imported.type === "environment" ? imported.data.cookies : emptyCookieJar();
        await saveNamedEnvironment(imported.data.name, imported.data.variables, tls, false, cookies);
        await refreshAll();
        showToast(`已导入环境「${imported.data.name}」`);
        return;
      }
      if (imported.type === "backup") {
        if (
          !window.confirm("将导入备份中的集合和环境，不会删除现有数据。完整数据库请用「恢复」。继续？")
        ) {
          return;
        }
        for (const collection of imported.data.collections) {
          await importRequestList(collection.name, collection.requests);
        }
        for (const env of imported.data.environments) {
          const id = await saveNamedEnvironment(env.name, env.variables, env.tls, false, env.cookies);
          if (env.isActive) await setActiveEnvironment(id);
        }
        if (imported.data.settings) {
          setTimeoutMs(imported.data.settings.timeoutMs);
          setInsecure(imported.data.settings.insecure);
          setFollowRedirects(imported.data.settings.followRedirects);
        }
        await refreshAll();
        showToast("已导入备份中的集合和环境");
        return;
      }

      const collectionName =
        imported.type === "collection" ? imported.data.name : imported.data.collectionName;
      const requests: PortableRequest[] =
        imported.type === "collection"
          ? imported.data.requests
          : imported.data.requests.map((req) => ({
              name: req.name,
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: req.body,
              auth: req.auth,
              query: [],
              bodyMode: "raw" as const,
              formFields: [],
              urlencodedFields: [],
              extractors: [],
            }));
      const collectionId = await importRequestList(collectionName, requests);
      if (imported.type === "postman-collection" && imported.data.variables.length > 0) {
        await saveNamedEnvironment(`${collectionName} 变量`, imported.data.variables, emptyTls(), false);
      }
      await refreshAll();
      setExpandedCollections((prev) => [...prev, collectionId]);
      setSidebarTab("collections");
      showToast(`已导入 ${requests.length} 个请求`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function onExportCollection(collection: CollectionRow) {
    const requests = savedRequests
      .filter((item) => item.collection_id === collection.id)
      .map((item) => {
        const meta = parseRequestMeta(item.meta);
        const stored = parseQueryJson(item.query);
        const query = (stored || queryFromUrl(item.url)).filter(
          (itemQuery) => itemQuery.key.trim() || itemQuery.value || itemQuery.enabled === false,
        );
        return {
          name: item.name,
          method: item.method,
          url: item.url,
          headers: parseHeadersJson(item.headers),
          body: item.body || "",
          auth: parseAuthJson(item.auth),
          query,
          bodyMode: meta.bodyMode,
          formFields: meta.formFields,
          urlencodedFields: meta.urlencodedFields,
          extractors: meta.extractors,
        };
      });
    const saved = await saveTextFile(
      JSON.stringify({ version: PORTABLE_VERSION, kind: "tinypost.collection", name: collection.name, requests }, null, 2),
      `${collection.name}.json`,
    );
    showToast(saved ? "集合已导出" : "已取消导出");
  }

  async function onExportEnvironment() {
    const name = envName.trim();
    if (!name) {
      showToast("请填写环境名称");
      return;
    }
    const saved = await saveTextFile(
      JSON.stringify(
        {
          version: PORTABLE_VERSION,
          kind: "tinypost.environment",
          name,
          variables: envVars.filter((item) => item.key.trim()),
          tls: envTls,
          cookies: savedJar(envCookies),
        },
        null,
        2,
      ),
      `${name}.json`,
    );
    showToast(saved ? "环境已导出" : "已取消导出");
  }

  async function onBackup() {
    try {
      const saved = await backupDatabase();
      showToast(saved ? "已备份全部数据" : "已取消备份");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "备份失败");
    }
  }

  async function onRestore() {
    if (!window.confirm("恢复将用备份覆盖当前全部本地数据（集合、环境、历史、设置），且不能撤销。确定继续？")) {
      return;
    }
    try {
      const restored = await restoreDatabase();
      if (!restored) {
        showToast("已取消恢复");
        return;
      }
      const settings = await getSettings();
      setTimeoutMs(settings.timeoutMs);
      setInsecure(settings.insecure);
      setFollowRedirects(settings.followRedirects);
      setTlsPassphrases({});
      bindSaved(null);
      await refreshAll();
      showToast("已从备份恢复");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "恢复失败");
    }
  }

  async function copyText(text: string, success = "已复制") {
    try {
      await navigator.clipboard.writeText(text);
      showToast(success);
    } catch {
      showToast("复制失败");
    }
  }

  function submitCurlImport() {
    try {
      const parsed = parseCurl(curlDraft);
      if (!METHODS.includes(parsed.method as HttpMethod)) {
        showToast(`不支持的方法：${parsed.method}`);
        return;
      }
      if (parsed.insecure) setInsecure(true);
      loadRequestState({
        method: parsed.method,
        url: parsed.url,
        headers: parsed.headers,
        body: parsed.body,
        auth: parsed.auth,
        meta: serializeRequestMeta({
          bodyMode: parsed.bodyMode,
          formFields: parsed.formFields,
          urlencodedFields: parsed.urlencodedFields,
          extractors: compactExtractors(extractors),
        }),
        saved:
          currentSavedId != null
            ? { id: currentSavedId, collectionId: currentCollectionId, name: currentSavedName }
            : null,
        tab: parsed.bodyMode !== "raw" || parsed.body ? "body" : "headers",
      });
      setShowCurlImport(false);
      showToast(parsed.insecure ? "已导入 cURL，并允许不安全证书" : "已导入 cURL");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "导入失败");
    }
  }

  async function onPickFormFile(index: number) {
    const picked = await pickFile();
    if (!picked) return;
    setFormFields((prev) =>
      persistFormFields(
        prev.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                type: "file",
                value: picked,
                fileName: item.fileName || fileBaseName(picked),
              }
            : item,
        ),
      ),
    );
  }

  async function onPickTls(field: keyof TlsConfig) {
    const picked = await pickFile([
      {
        name: field === "keyPath" ? "Private Key" : "Certificate",
        extensions: field === "keyPath" ? ["pem", "key"] : ["pem", "crt", "cer"],
      },
    ]);
    if (!picked) return;
    setEnvTls((prev) => ({ ...prev, [field]: picked }));
  }

  async function onManualExtract(path: string, variable: string) {
    if (!response) return;
    const hits = extractByRules(response.body, [{ path, variable, enabled: true }]);
    await applyHits(hits);
    const hit = hits[0];
    if (hit?.ok) showToast(`已写入 ${hit.variable}`);
  }

  async function onSaveResponseFile() {
    if (!response) return;
    if (response.binary) {
      const ext = extensionForContentType(response.contentType);
      const saved = await saveBinaryResponse(
        COMPOSER_REQUEST_ID,
        `tinypost-${response.status}-${Date.now()}.${ext}`,
      );
      showToast(saved ? "已保存原始响应" : "已取消保存");
      return;
    }
    const text = response.body || "";
    const ext = looksLikeJson(text) ? "json" : looksLikeXml(text) ? "xml" : "txt";
    const saved = await saveResponseBody(text, `tinypost-${response.status}-${Date.now()}.${ext}`);
    showToast(saved ? "已保存到文件" : "已取消保存");
  }

  actionsRef.current = {
    send: () => void sendRequest(),
    save: () => void onOverwriteSave(),
    saveEnv: () => void saveEnvEditor(),
    importCurl: () => submitCurlImport(),
    showEnv: showEnvEditor,
    showCurl: showCurlImport,
  };

  const savedLabel = currentSavedName
    ? `正在编辑：${currentSavedName}${
        currentCollectionId
          ? ` · ${collections.find((item) => item.id === currentCollectionId)?.name || "集合"}`
          : ""
      }`
    : "";
  const timeoutSeconds = Math.round(timeoutMs / 1000);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <TinyPostLogo className="brand-logo" />
          <div>
            <div className="brand-name">TinyPost</div>
            <div className="brand-sub">本地 · 离线 · 内网可用</div>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="env-picker">
            <span>环境</span>
            <select
              value={activeEnv?.id ?? ""}
              onChange={(e) => void onChangeEnvironment(Number(e.target.value))}
              aria-label="当前环境"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => openEnvEditor(activeEnv || undefined)}>
            编辑变量
          </button>
          <button type="button" className="ghost" onClick={() => openEnvEditor()}>
            新建环境
          </button>
          <label className="insecure timeout-field">
            <span>超时</span>
            <input
              type="number"
              min={1}
              max={300}
              value={timeoutSeconds}
              onChange={(e) => {
                const seconds = Number(e.target.value);
                if (!Number.isFinite(seconds)) return;
                setTimeoutMs(Math.min(300, Math.max(1, Math.round(seconds))) * 1000);
              }}
              aria-label="请求超时秒数"
            />
            <span>秒</span>
          </label>
          <label className="insecure">
            <input
              type="checkbox"
              checked={followRedirects}
              onChange={(e) => setFollowRedirects(e.target.checked)}
            />
            跟随重定向
          </label>
          <label className="insecure">
            <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} />
            允许不安全证书
          </label>
        </div>
      </header>

      <div className="layout">
        <Sidebar
          tab={sidebarTab}
          search={sidebarSearch}
          collections={collections}
          savedRequests={savedRequests}
          history={history}
          currentSavedId={currentSavedId}
          expanded={expandedCollections}
          onTab={setSidebarTab}
          onSearch={setSidebarSearch}
          onToggle={(id) =>
            setExpandedCollections((prev) =>
              prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
            )
          }
          onCreate={() => void onCreateCollection()}
          onImportFile={(file) => void onImportFile(file)}
          onBackup={() => void onBackup()}
          onRestore={() => void onRestore()}
          onExportCollection={(collection) => void onExportCollection(collection)}
          onRenameCollection={(collection) => void onRenameCollection(collection)}
          onDeleteCollection={(id) => void onDeleteCollection(id)}
          onLoadSaved={loadSavedRequest}
          onRenameSaved={(item) => void onRenameSavedRequest(item)}
          onDeleteSaved={(id) => void onDeleteSavedRequest(id)}
          onClearHistory={() => void onClearHistory()}
          onLoadHistory={loadHistoryItem}
        />
        <main className="main">
          <RequestEditor
            method={method}
            url={url}
            sending={sending}
            canSend={canSend}
            savedLabel={savedLabel}
            composerTab={composerTab}
            auth={auth}
            queryParams={queryParams}
            headers={headers}
            body={body}
            bodyMode={bodyMode}
            formFields={formFields}
            urlencodedFields={urlencodedFields}
            extractors={extractors}
            bodyDisabled={method === "GET" || method === "HEAD"}
            onMethod={setMethod}
            onUrl={setComposerUrl}
            onSend={() => void sendRequest()}
            onCancel={() => void cancelRequest()}
            onSave={() => void onOverwriteSave()}
            onSaveAs={() => void onSaveAs()}
            onCopyCurl={() => void copyText(resolvedCurl(), "已复制 cURL")}
            onOpenCurlImport={() => setShowCurlImport(true)}
            onTab={setComposerTab}
            onAuth={setAuth}
            onUpdateQuery={updateQuery}
            onRemoveQuery={removeQuery}
            onUpdateHeader={updateHeader}
            onRemoveHeader={removeHeader}
            onBody={setBody}
            onBodyMode={setBodyMode}
            onUpdateFormField={updateFormField}
            onRemoveFormField={removeFormField}
            onPickFormFile={(index) => void onPickFormFile(index)}
            onUpdateUrlEncoded={updateUrlEncodedField}
            onRemoveUrlEncoded={removeUrlEncodedField}
            onUpdateExtractor={updateExtractor}
            onRemoveExtractor={removeExtractor}
          />
          <ResponseView
            sending={sending}
            elapsedMs={elapsedMs}
            error={error}
            response={response}
            responsePretty={responsePretty}
            responseTab={responseTab}
            extractNotice={extractNotice}
            onTogglePretty={() => setResponsePretty((prev) => !prev)}
            onTab={setResponseTab}
            onCopy={(text) => void copyText(text)}
            onCopyCurl={() => void copyText(resolvedCurl(), "已复制 cURL")}
            onSaveFile={() => void onSaveResponseFile()}
            onExtract={(path, variable) => void onManualExtract(path, variable)}
          />
        </main>
      </div>

      {showEnvEditor && (
        <EnvEditor
          editing={editingEnvId != null}
          name={envName}
          vars={envVars}
          tls={envTls}
          cookies={envCookies}
          passphrase={envPassphrase}
          onName={setEnvName}
          onVar={updateEnvVar}
          onRemoveVar={(index) =>
            setEnvVars((prev) => {
              const next = prev.filter((_, i) => i !== index);
              return next.length ? next : [emptyVariable()];
            })
          }
          onTls={(patch) => setEnvTls((prev) => ({ ...prev, ...patch }))}
          onCookiesEnabled={(enabled) => setEnvCookies((prev) => ({ ...prev, enabled }))}
          onCookie={(index, patch) =>
            setEnvCookies((prev) => ({
              ...prev,
              items: persistCookieRows(prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item))),
            }))
          }
          onRemoveCookie={(index) =>
            setEnvCookies((prev) => {
              const next = prev.items.filter((_, i) => i !== index);
              return { ...prev, items: next.length ? persistCookieRows(next) : [emptyStoredCookie()] };
            })
          }
          onClearCookies={() => setEnvCookies((prev) => ({ ...prev, items: [emptyStoredCookie()] }))}
          onPassphrase={setEnvPassphrase}
          onPickTls={(field) => void onPickTls(field)}
          onClose={() => setShowEnvEditor(false)}
          onSave={() => void saveEnvEditor()}
          onDelete={() => void onDeleteEnvironment()}
          onExport={() => void onExportEnvironment()}
        />
      )}

      {showCurlImport && (
        <CurlImportDialog
          value={curlDraft}
          onChange={setCurlDraft}
          onClose={() => setShowCurlImport(false)}
          onSubmit={submitCurlImport}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
