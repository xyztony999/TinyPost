import { useEffect, useMemo, useRef, useState } from "react";
import { TinyPostLogo } from "./components/TinyPostLogo";
import {
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
  renameCollection,
  renameSavedRequest,
  saveHistory,
  saveRequest,
  saveResponseBody,
  saveSettings,
  setActiveEnvironment,
  upsertEnvironment,
} from "./db";
import { applyAuth, parseAuthJson } from "./lib/auth";
import { formatBytes, looksLikeJson, statusTone, tryFormatJson } from "./lib/format";
import { parsePostmanCollection } from "./lib/postmanImport";
import {
  buildUrl,
  mergeQueryFromUrl,
  parseQueryJson,
  queryFromUrl,
  serializeQuery,
  withTrailingEmpty,
} from "./lib/query";
import { parseVariablesJson, substituteVars, variablesToMap } from "./lib/vars";
import type {
  AuthConfig,
  CollectionRow,
  EnvironmentRow,
  HeaderItem,
  HistoryRow,
  HttpMethod,
  HttpResponsePayload,
  QueryItem,
  SavedRequestRow,
  VariableItem,
} from "@shared/types";
import {
  DEFAULT_SETTINGS,
  defaultAuth,
  emptyHeader,
  emptyVariable,
  isRowEnabled,
} from "@shared/types";
import "./App.css";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

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

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function parseResponseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value ?? ""),
      ]),
    );
  } catch {
    return {};
  }
}

function App() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("{{baseUrl}}/api/health");
  const [queryParams, setQueryParams] = useState<QueryItem[]>(() =>
    queryFromUrl("{{baseUrl}}/api/health"),
  );
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: "Accept", value: "application/json", enabled: true },
    emptyHeader(),
  ]);
  const [body, setBody] = useState("");
  const [auth, setAuth] = useState<AuthConfig>(defaultAuth());
  const [insecure, setInsecure] = useState(DEFAULT_SETTINGS.insecure);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_SETTINGS.timeoutMs);
  const [followRedirects, setFollowRedirects] = useState(
    DEFAULT_SETTINGS.followRedirects,
  );
  const [settingsReady, setSettingsReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [composerTab, setComposerTab] = useState<
    "auth" | "query" | "headers" | "body"
  >("headers");
  const [responseTab, setResponseTab] = useState<"body" | "headers" | "redirects">(
    "body",
  );
  const [responsePretty, setResponsePretty] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"collections" | "history">(
    "collections",
  );
  const [sidebarSearch, setSidebarSearch] = useState("");

  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [savedRequests, setSavedRequests] = useState<SavedRequestRow[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<number[]>([]);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [editingEnvId, setEditingEnvId] = useState<number | null>(null);
  const [envName, setEnvName] = useState("");
  const [envVars, setEnvVars] = useState<VariableItem[]>([emptyVariable()]);
  const [toast, setToast] = useState<string | null>(null);
  const [currentSavedId, setCurrentSavedId] = useState<number | null>(null);
  const [currentCollectionId, setCurrentCollectionId] = useState<number | null>(
    null,
  );
  const [currentSavedName, setCurrentSavedName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const activeEnv = useMemo(
    () => environments.find((e) => e.is_active === 1) || environments[0] || null,
    [environments],
  );

  const activeVars = useMemo(
    () => variablesToMap(parseVariablesJson(activeEnv?.variables || "[]")),
    [activeEnv],
  );

  const canSend = useMemo(() => url.trim().length > 0 && !sending, [url, sending]);
  const searchNeedle = sidebarSearch.trim().toLowerCase();

  const filteredHistory = useMemo(() => {
    if (!searchNeedle) return history;
    return history.filter((item) =>
      [item.method, item.url, String(item.status ?? "")].some((part) =>
        matchesQuery(part, searchNeedle),
      ),
    );
  }, [history, searchNeedle]);

  const visibleCollections = useMemo(() => {
    if (!searchNeedle) return collections;
    return collections.filter((collection) => {
      if (matchesQuery(collection.name, searchNeedle)) return true;
      return savedRequests.some(
        (item) =>
          item.collection_id === collection.id &&
          [item.name, item.method, item.url].some((part) =>
            matchesQuery(part, searchNeedle),
          ),
      );
    });
  }, [collections, savedRequests, searchNeedle]);

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
    setExpandedCollections((prev) => {
      if (prev.length > 0) return prev;
      return cols.slice(0, 3).map((c) => c.id);
    });
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
    void saveSettings({ timeoutMs, insecure, followRedirects }).catch((e) =>
      console.error(e),
    );
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

  function persistHeaders(next: HeaderItem[]): HeaderItem[] {
    if (next.length === 0) return [emptyHeader()];
    const last = next[next.length - 1];
    if (last.key || last.value) return [...next, emptyHeader()];
    return next;
  }

  function updateHeader(index: number, patch: Partial<HeaderItem>) {
    setHeaders((prev) =>
      persistHeaders(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    );
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
    applyQueryItems(
      queryParams.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeQuery(index: number) {
    applyQueryItems(queryParams.filter((_, i) => i !== index));
  }

  function updateEnvVar(index: number, patch: Partial<VariableItem>) {
    setEnvVars((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      if (index === next.length - 1 && (patch.key || patch.value)) {
        next.push(emptyVariable());
      }
      return next;
    });
  }

  function setComposerUrl(next: string) {
    setUrl(next);
    setQueryParams((prev) => mergeQueryFromUrl(next, prev));
  }

  function bindSaved(saved?: {
    id: number;
    collectionId: number | null;
    name: string;
  } | null) {
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
    response?: HttpResponsePayload | null;
    saved?: { id: number; collectionId: number | null; name: string } | null;
  }) {
    setMethod((input.method.toUpperCase() as HttpMethod) || "GET");
    loadQueryState(input.url, input.query);
    setHeaders(
      input.headers.length ? persistHeaders(input.headers) : [emptyHeader()],
    );
    setBody(input.body || "");
    setAuth(input.auth || defaultAuth());
    setResponse(input.response ?? null);
    setError(null);
    setComposerTab("headers");
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
      response: null,
      saved: {
        id: item.id,
        collectionId: item.collection_id,
        name: item.name,
      },
    });
  }

  function composerPayload() {
    return {
      method,
      url,
      headers: headers.filter((h) => h.key.trim()),
      body,
      auth,
      query: serializeQuery(queryParams),
    };
  }

  async function sendRequest() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setResponse(null);

    const cleanedHeaders = headers.filter((h) => h.key.trim() && isRowEnabled(h));
    const resolvedUrl = substituteVars(url.trim(), activeVars);
    const resolvedHeaders = cleanedHeaders.map((h) => ({
      key: substituteVars(h.key, activeVars),
      value: substituteVars(h.value, activeVars),
      enabled: true,
    }));
    const resolvedBody = substituteVars(body, activeVars);
    const finalHeaders = applyAuth(resolvedHeaders, auth, activeVars);

    try {
      const result = await window.tinypost.httpSend({
        method,
        url: resolvedUrl,
        headers: finalHeaders,
        body: ["GET", "HEAD"].includes(method) ? undefined : resolvedBody,
        insecure,
        timeoutMs,
        followRedirects,
        requestId: COMPOSER_REQUEST_ID,
      });

      setResponse(result);
      setResponseTab("body");
      const payload = composerPayload();
      await saveHistory({
        method: payload.method,
        url: payload.url,
        headers: payload.headers,
        body: payload.body,
        auth: payload.auth,
        query: payload.query,
        response: result,
      });
      setHistory(await listHistory());
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
    } else {
      setEditingEnvId(null);
      setEnvName("新环境");
      setEnvVars([
        { key: "baseUrl", value: "http://127.0.0.1:8080" },
        { key: "token", value: "" },
        emptyVariable(),
      ]);
    }
    setShowEnvEditor(true);
  }

  async function saveEnvEditor() {
    const name = envName.trim();
    if (!name) {
      showToast("请填写环境名称");
      return;
    }
    const variables = envVars.filter((v) => v.key.trim());
    const id = await upsertEnvironment({
      id: editingEnvId ?? undefined,
      name,
      variables,
      makeActive: true,
    });
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

  async function persistCurrentRequest(input: {
    id?: number;
    collectionId: number;
    name: string;
  }) {
    const payload = composerPayload();
    const id = await saveRequest({
      id: input.id,
      collectionId: input.collectionId,
      name: input.name,
      method: payload.method,
      url: payload.url,
      headers: payload.headers,
      body: payload.body,
      auth: payload.auth,
      query: payload.query,
    });
    setSavedRequests(await listSavedRequests());
    bindSaved({
      id,
      collectionId: input.collectionId,
      name: input.name,
    });
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

    const collectionNameList = latest.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const pick = window.prompt(
      `保存到哪个集合？输入序号：\n${collectionNameList}`,
      "1",
    );
    const index = Number(pick) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= latest.length) {
      showToast("无效的集合序号");
      return;
    }

    const reqName =
      window.prompt("请求名称", currentSavedName || `${method} ${url}`) ||
      `${method} ${url}`;
    await persistCurrentRequest({
      collectionId: latest[index].id,
      name: reqName.trim(),
    });
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

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const imported = parsePostmanCollection(text);
      const collectionId = await createCollection(imported.collectionName);

      for (const req of imported.requests) {
        await saveRequest({
          collectionId,
          name: req.name,
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: req.body,
          auth: req.auth,
          query: serializeQuery(queryFromUrl(req.url)),
        });
      }

      if (imported.variables.length > 0) {
        try {
          await upsertEnvironment({
            name: `${imported.collectionName} 变量`,
            variables: imported.variables,
            makeActive: false,
          });
        } catch {
          await upsertEnvironment({
            name: `${imported.collectionName} 变量 ${Date.now()}`,
            variables: imported.variables,
            makeActive: false,
          });
        }
      }

      await refreshAll();
      setExpandedCollections((prev) => [...prev, collectionId]);
      setSidebarTab("collections");
      showToast(`已导入 ${imported.requests.length} 个请求`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function copyResponse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("已复制");
    } catch {
      showToast("复制失败");
    }
  }

  async function onSaveResponseFile() {
    if (!response) return;
    const ext = looksLikeJson(response.body) ? "json" : "txt";
    const suggested = `tinypost-${response.status}-${Date.now()}.${ext}`;
    const saved = await saveResponseBody(
      responsePretty ? tryFormatJson(response.body) : response.body,
      suggested,
    );
    showToast(saved ? "已保存到文件" : "已取消保存");
  }

  const displayBody = response
    ? responsePretty
      ? tryFormatJson(response.body)
      : response.body
    : "";
  const responseSize = response
    ? (response.sizeBytes ?? new Blob([response.body || ""]).size)
    : 0;
  const timeoutSeconds = Math.round(timeoutMs / 1000);

  function requestsOf(collectionId: number): SavedRequestRow[] {
    return savedRequests.filter((item) => {
      if (item.collection_id !== collectionId) return false;
      if (!searchNeedle) return true;
      return [item.name, item.method, item.url].some((part) =>
        matchesQuery(part, searchNeedle),
      );
    });
  }

  function isCollectionExpanded(id: number): boolean {
    if (searchNeedle) return true;
    return expandedCollections.includes(id);
  }

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
            <input
              type="checkbox"
              checked={insecure}
              onChange={(e) => setInsecure(e.target.checked)}
            />
            允许不安全证书
          </label>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              type="button"
              className={sidebarTab === "collections" ? "tab active" : "tab"}
              onClick={() => setSidebarTab("collections")}
            >
              集合
            </button>
            <button
              type="button"
              className={sidebarTab === "history" ? "tab active" : "tab"}
              onClick={() => setSidebarTab("history")}
            >
              历史
            </button>
          </div>

          <div className="sidebar-search-wrap">
            <input
              className="sidebar-search"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder={sidebarTab === "collections" ? "搜索集合或请求" : "搜索历史"}
              aria-label="侧栏搜索"
            />
          </div>

          {sidebarTab === "collections" ? (
            <>
              <div className="sidebar-head">
                <h2>集合</h2>
                <div className="sidebar-actions">
                  <button type="button" className="ghost" onClick={() => void onCreateCollection()}>
                    新建
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    导入
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImportFile(file);
                }}
              />
              <div className="history-list">
                {collections.length === 0 && (
                  <p className="empty">还没有集合。可新建，或导入 Postman Collection。</p>
                )}
                {collections.length > 0 && visibleCollections.length === 0 && (
                  <p className="empty">没有匹配的集合或请求。</p>
                )}
                {visibleCollections.map((collection) => {
                  const requests = requestsOf(collection.id);
                  const expanded = isCollectionExpanded(collection.id);
                  return (
                    <div key={collection.id} className="collection-block">
                      <div className="collection-head">
                        <button
                          type="button"
                          className="collection-toggle"
                          onClick={() =>
                            setExpandedCollections((prev) =>
                              prev.includes(collection.id)
                                ? prev.filter((id) => id !== collection.id)
                                : [...prev, collection.id],
                            )
                          }
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            void onRenameCollection(collection);
                          }}
                        >
                          <span>{expanded ? "▾" : "▸"}</span>
                          <strong>{collection.name}</strong>
                          <em>{requests.length}</em>
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void onRenameCollection(collection)}
                          aria-label="重命名集合"
                          title="重命名"
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void onDeleteCollection(collection.id)}
                          aria-label="删除集合"
                        >
                          ×
                        </button>
                      </div>
                      {expanded &&
                        requests.map((item) => (
                          <div key={item.id} className="saved-row">
                            <button
                              type="button"
                              className={
                                item.id === currentSavedId
                                  ? "history-item active"
                                  : "history-item"
                              }
                              onClick={() => loadSavedRequest(item)}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                void onRenameSavedRequest(item);
                              }}
                            >
                              <span className="method">{item.method}</span>
                              <span className="history-url">{item.name}</span>
                              <span className="history-meta">{item.url}</span>
                            </button>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => void onRenameSavedRequest(item)}
                                aria-label="重命名请求"
                                title="重命名"
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => void onDeleteSavedRequest(item.id)}
                                aria-label="删除请求"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="sidebar-head">
                <h2>历史</h2>
                <button type="button" className="ghost" onClick={() => void onClearHistory()}>
                  清空
                </button>
              </div>
              <div className="history-list">
                {history.length === 0 && (
                  <p className="empty">还没有请求记录，发一条试试。</p>
                )}
                {history.length > 0 && filteredHistory.length === 0 && (
                  <p className="empty">没有匹配的历史记录。</p>
                )}
                {filteredHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="history-item"
                    onClick={() => loadHistoryItem(item)}
                  >
                    <span className="method">{item.method}</span>
                    <span className="history-url">{item.url}</span>
                    <span className="history-meta">
                      <span className={`status-badge compact tone-${statusTone(item.status)}`}>
                        {item.status ?? "-"}
                      </span>
                      {item.duration_ms ?? "-"}ms
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="main">
          <section className="composer">
            <div className="url-row">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                aria-label="请求方法"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                value={url}
                onChange={(e) => setComposerUrl(e.target.value)}
                placeholder="支持变量，例如 {{baseUrl}}/api/users"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendRequest();
                }}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => void onOverwriteSave()}
              >
                保存
              </button>
              <button type="button" className="ghost save-as" onClick={() => void onSaveAs()}>
                另存为
              </button>
              {sending ? (
                <button type="button" className="danger" onClick={() => void cancelRequest()}>
                  取消
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!canSend}
                  onClick={() => void sendRequest()}
                >
                  发送
                </button>
              )}
            </div>
            {currentSavedName && (
              <div className="save-binding">
                正在编辑：{currentSavedName}
                {currentCollectionId
                  ? ` · ${collections.find((c) => c.id === currentCollectionId)?.name || "集合"}`
                  : ""}
              </div>
            )}

            <div className="tabs composer-tabs">
              <button
                type="button"
                className={composerTab === "auth" ? "tab active" : "tab"}
                onClick={() => setComposerTab("auth")}
              >
                Auth
              </button>
              <button
                type="button"
                className={composerTab === "query" ? "tab active" : "tab"}
                onClick={() => setComposerTab("query")}
              >
                Query
              </button>
              <button
                type="button"
                className={composerTab === "headers" ? "tab active" : "tab"}
                onClick={() => setComposerTab("headers")}
              >
                Headers
              </button>
              <button
                type="button"
                className={composerTab === "body" ? "tab active" : "tab"}
                onClick={() => setComposerTab("body")}
              >
                Body
              </button>
            </div>

            {composerTab === "auth" && (
              <div className="auth-panel">
                <label className="field">
                  <span>类型</span>
                  <select
                    value={auth.type}
                    onChange={(e) =>
                      setAuth((prev) => ({
                        ...prev,
                        type: e.target.value as AuthConfig["type"],
                      }))
                    }
                  >
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="apikey">API Key</option>
                  </select>
                </label>

                {auth.type === "bearer" && (
                  <label className="field">
                    <span>Token</span>
                    <input
                      value={auth.bearerToken || ""}
                      onChange={(e) =>
                        setAuth((prev) => ({ ...prev, bearerToken: e.target.value }))
                      }
                      placeholder="支持 {{token}}"
                    />
                  </label>
                )}

                {auth.type === "basic" && (
                  <div className="auth-grid">
                    <label className="field">
                      <span>Username</span>
                      <input
                        value={auth.basicUsername || ""}
                        onChange={(e) =>
                          setAuth((prev) => ({
                            ...prev,
                            basicUsername: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        type="password"
                        value={auth.basicPassword || ""}
                        onChange={(e) =>
                          setAuth((prev) => ({
                            ...prev,
                            basicPassword: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                )}

                {auth.type === "apikey" && (
                  <div className="auth-grid">
                    <label className="field">
                      <span>Key</span>
                      <input
                        value={auth.apiKeyKey || ""}
                        onChange={(e) =>
                          setAuth((prev) => ({ ...prev, apiKeyKey: e.target.value }))
                        }
                        placeholder="X-API-Key"
                      />
                    </label>
                    <label className="field">
                      <span>Value</span>
                      <input
                        value={auth.apiKeyValue || ""}
                        onChange={(e) =>
                          setAuth((prev) => ({ ...prev, apiKeyValue: e.target.value }))
                        }
                        placeholder="支持 {{token}}"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {composerTab === "query" && (
              <div className="headers">
                {queryParams.map((item, index) => (
                  <div
                    className={isRowEnabled(item) ? "header-row with-toggle" : "header-row with-toggle disabled"}
                    key={index}
                  >
                    <input
                      type="checkbox"
                      checked={isRowEnabled(item)}
                      onChange={(e) => updateQuery(index, { enabled: e.target.checked })}
                      aria-label="启用查询参数"
                    />
                    <input
                      placeholder="Key"
                      value={item.key}
                      onChange={(e) => updateQuery(index, { key: e.target.value })}
                    />
                    <input
                      placeholder="Value，可用 {{var}}"
                      value={item.value}
                      onChange={(e) => updateQuery(index, { value: e.target.value })}
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeQuery(index)}
                      aria-label="删除查询参数"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {composerTab === "headers" && (
              <div className="headers">
                {headers.map((header, index) => (
                  <div
                    className={isRowEnabled(header) ? "header-row with-toggle" : "header-row with-toggle disabled"}
                    key={index}
                  >
                    <input
                      type="checkbox"
                      checked={isRowEnabled(header)}
                      onChange={(e) => updateHeader(index, { enabled: e.target.checked })}
                      aria-label="启用请求头"
                    />
                    <input
                      placeholder="Key"
                      value={header.key}
                      onChange={(e) => updateHeader(index, { key: e.target.value })}
                    />
                    <input
                      placeholder="Value，可用 {{var}}"
                      value={header.value}
                      onChange={(e) => updateHeader(index, { value: e.target.value })}
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeHeader(index)}
                      aria-label="删除请求头"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {composerTab === "body" && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='JSON / 文本，例如 {"name":"tinypost"}，也支持 {{var}}'
                disabled={method === "GET" || method === "HEAD"}
              />
            )}
          </section>

          <section
            className={
              sending
                ? "response is-loading"
                : response
                  ? `response tone-${statusTone(response.status)}`
                  : "response"
            }
          >
            <div className="response-head">
              <h2>响应</h2>
              {sending && (
                <div className="response-meta">
                  <span className="status-badge tone-pending">发送中</span>
                  <span>{elapsedMs} ms</span>
                </div>
              )}
              {response && !sending && (
                <div className="response-meta">
                  <span className={`status-badge tone-${statusTone(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span>{response.durationMs} ms</span>
                  <span>{formatBytes(responseSize)}</span>
                  {response.url && <span className="final-url" title={response.url}>{response.url}</span>}
                </div>
              )}
              {response && !sending && (
                <div className="response-tools">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setResponsePretty((prev) => !prev)}
                  >
                    {responsePretty ? "Raw" : "Pretty"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void copyResponse(displayBody)}
                  >
                    复制
                  </button>
                  <button type="button" className="ghost" onClick={() => void onSaveResponseFile()}>
                    存文件
                  </button>
                </div>
              )}
            </div>

            {error && !sending && <div className="error-box">{error}</div>}

            {sending && (
              <div className="response-loading" aria-live="polite" aria-busy="true">
                <span className="spinner" aria-hidden="true" />
                <div>
                  <strong>请求发送中…</strong>
                  <p>等待服务器返回，已用时 {elapsedMs} ms</p>
                </div>
              </div>
            )}

            {!error && !response && !sending && (
              <p className="empty">
                响应显示在这里。可用 {"{{baseUrl}}"} / {"{{token}}"}，数据仅存本机。
              </p>
            )}

            {response && !sending && (
              <>
                <div className="tabs">
                  <button
                    type="button"
                    className={responseTab === "body" ? "tab active" : "tab"}
                    onClick={() => setResponseTab("body")}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    className={responseTab === "headers" ? "tab active" : "tab"}
                    onClick={() => setResponseTab("headers")}
                  >
                    Headers
                  </button>
                  {response.redirects?.length ? (
                    <button
                      type="button"
                      className={responseTab === "redirects" ? "tab active" : "tab"}
                      onClick={() => setResponseTab("redirects")}
                    >
                      Redirects ({response.redirects.length})
                    </button>
                  ) : null}
                </div>
                {responseTab === "body" ? (
                  <pre className="code-block">{displayBody}</pre>
                ) : responseTab === "headers" ? (
                  <pre className="code-block">
                    {Object.entries(response.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("\n")}
                  </pre>
                ) : (
                  <pre className="code-block">
                    {(response.redirects || [])
                      .map(
                        (hop, index) =>
                          `${index + 1}. ${hop.status} ${hop.url}\n   → ${hop.location}`,
                      )
                      .join("\n")}
                  </pre>
                )}
              </>
            )}
          </section>
        </main>
      </div>

      {showEnvEditor && (
        <div className="modal-backdrop" onClick={() => setShowEnvEditor(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="编辑环境"
          >
            <div className="modal-head">
              <h3>{editingEnvId ? "编辑环境" : "新建环境"}</h3>
              <button type="button" className="ghost" onClick={() => setShowEnvEditor(false)}>
                ×
              </button>
            </div>
            <label className="field">
              <span>名称</span>
              <input value={envName} onChange={(e) => setEnvName(e.target.value)} />
            </label>
            <div className="panel-title">变量</div>
            <div className="headers">
              {envVars.map((item, index) => (
                <div className="header-row" key={index}>
                  <input
                    placeholder="key，如 baseUrl"
                    value={item.key}
                    onChange={(e) => updateEnvVar(index, { key: e.target.value })}
                  />
                  <input
                    placeholder="value"
                    value={item.value}
                    onChange={(e) => updateEnvVar(index, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setEnvVars((prev) => {
                        const next = prev.filter((_, i) => i !== index);
                        return next.length ? next : [emptyVariable()];
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              {editingEnvId && (
                <button type="button" className="ghost" onClick={() => void onDeleteEnvironment()}>
                  删除环境
                </button>
              )}
              <button type="button" className="primary" onClick={() => void saveEnvEditor()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
