import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TinyPostLogo } from "./components/TinyPostLogo";
import {
  clearHistory,
  createCollection,
  deleteCollection,
  deleteEnvironment,
  deleteSavedRequest,
  ensureDefaultEnvironment,
  listCollections,
  listHistory,
  listSavedRequests,
  saveHistory,
  saveRequest,
  setActiveEnvironment,
  upsertEnvironment,
} from "./db";
import { applyAuth, parseAuthJson } from "./lib/auth";
import { parsePostmanCollection } from "./lib/postmanImport";
import { parseVariablesJson, substituteVars, variablesToMap } from "./lib/vars";
import type {
  AuthConfig,
  CollectionRow,
  EnvironmentRow,
  HeaderItem,
  HistoryRow,
  HttpMethod,
  HttpResponsePayload,
  SavedRequestRow,
  VariableItem,
} from "./types";
import { defaultAuth, emptyHeader, emptyVariable } from "./types";
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

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function App() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("{{baseUrl}}/api/health");
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: "Accept", value: "application/json" },
    emptyHeader(),
  ]);
  const [body, setBody] = useState("");
  const [auth, setAuth] = useState<AuthConfig>(defaultAuth());
  const [insecure, setInsecure] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [composerTab, setComposerTab] = useState<"auth" | "headers" | "body">(
    "headers",
  );
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [sidebarTab, setSidebarTab] = useState<"collections" | "history">(
    "collections",
  );

  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [savedRequests, setSavedRequests] = useState<SavedRequestRow[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<number[]>([]);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [editingEnvId, setEditingEnvId] = useState<number | null>(null);
  const [envName, setEnvName] = useState("");
  const [envVars, setEnvVars] = useState<VariableItem[]>([emptyVariable()]);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeEnv = useMemo(
    () => environments.find((e) => e.is_active === 1) || environments[0] || null,
    [environments],
  );

  const activeVars = useMemo(
    () => variablesToMap(parseVariablesJson(activeEnv?.variables || "[]")),
    [activeEnv],
  );

  const canSend = useMemo(() => url.trim().length > 0 && !sending, [url, sending]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
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
    void refreshAll().catch((e) => console.error(e));
  }, []);

  function updateHeader(index: number, patch: Partial<HeaderItem>) {
    setHeaders((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      if (index === next.length - 1 && (patch.key || patch.value)) {
        next.push(emptyHeader());
      }
      return next;
    });
  }

  function removeHeader(index: number) {
    setHeaders((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [emptyHeader()];
    });
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

  function loadRequestState(input: {
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    auth?: AuthConfig;
    response?: HttpResponsePayload | null;
  }) {
    setMethod((input.method.toUpperCase() as HttpMethod) || "GET");
    setUrl(input.url);
    setHeaders(input.headers.length ? [...input.headers, emptyHeader()] : [emptyHeader()]);
    setBody(input.body || "");
    setAuth(input.auth || defaultAuth());
    setResponse(input.response ?? null);
    setError(null);
    setComposerTab("headers");
    setResponseTab("body");
  }

  function loadHistoryItem(item: HistoryRow) {
    let parsedHeaders: HeaderItem[] = [];
    try {
      parsedHeaders = JSON.parse(item.request_headers) as HeaderItem[];
    } catch {
      parsedHeaders = [];
    }
    loadRequestState({
      method: item.method,
      url: item.url,
      headers: parsedHeaders,
      body: item.request_body || "",
      response: {
        status: item.status ?? 0,
        statusText: "",
        headers: JSON.parse(item.response_headers || "{}"),
        body: item.response_body || "",
        durationMs: item.duration_ms ?? 0,
      },
    });
  }

  function loadSavedRequest(item: SavedRequestRow) {
    let parsedHeaders: HeaderItem[] = [];
    try {
      parsedHeaders = JSON.parse(item.headers) as HeaderItem[];
    } catch {
      parsedHeaders = [];
    }
    loadRequestState({
      method: item.method,
      url: item.url,
      headers: parsedHeaders,
      body: item.body || "",
      auth: parseAuthJson(item.auth),
      response: null,
    });
  }

  async function sendRequest() {
    if (!canSend) return;
    setSending(true);
    setError(null);

    const cleanedHeaders = headers.filter((h) => h.key.trim());
    const resolvedUrl = substituteVars(url.trim(), activeVars);
    const resolvedHeaders = cleanedHeaders.map((h) => ({
      key: substituteVars(h.key, activeVars),
      value: substituteVars(h.value, activeVars),
    }));
    const resolvedBody = substituteVars(body, activeVars);
    const finalHeaders = applyAuth(resolvedHeaders, auth, activeVars);

    try {
      const result = await invoke<HttpResponsePayload>("http_send", {
        payload: {
          method,
          url: resolvedUrl,
          headers: finalHeaders,
          body: ["GET", "HEAD"].includes(method) ? undefined : resolvedBody,
          insecure,
        },
      });

      setResponse(result);
      await saveHistory({
        method,
        url: resolvedUrl,
        headers: finalHeaders,
        body: resolvedBody,
        response: result,
      });
      setHistory(await listHistory());
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setResponse(null);
    } finally {
      setSending(false);
    }
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
    setEnvironments(await ensureDefaultEnvironment());
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

  async function onSaveToCollection() {
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

    const reqName = window.prompt("请求名称", `${method} ${url}`) || `${method} ${url}`;
    await saveRequest({
      collectionId: latest[index].id,
      name: reqName.trim(),
      method,
      url,
      headers: headers.filter((h) => h.key.trim()),
      body,
      auth,
    });
    setSavedRequests(await listSavedRequests());
    setExpandedCollections((prev) =>
      prev.includes(latest[index].id) ? prev : [...prev, latest[index].id],
    );
    setSidebarTab("collections");
    showToast("已保存到集合");
  }

  async function onDeleteCollection(id: number) {
    if (!window.confirm("删除该集合及其全部请求？")) return;
    await deleteCollection(id);
    setCollections(await listCollections());
    setSavedRequests(await listSavedRequests());
  }

  async function onDeleteSavedRequest(id: number) {
    await deleteSavedRequest(id);
    setSavedRequests(await listSavedRequests());
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

  const prettyBody = response ? tryFormatJson(response.body) : "";

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
                {collections.map((collection) => {
                  const requests = savedRequests.filter(
                    (r) => r.collection_id === collection.id,
                  );
                  const expanded = expandedCollections.includes(collection.id);
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
                        >
                          <span>{expanded ? "▾" : "▸"}</span>
                          <strong>{collection.name}</strong>
                          <em>{requests.length}</em>
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
                              className="history-item"
                              onClick={() => loadSavedRequest(item)}
                            >
                              <span className="method">{item.method}</span>
                              <span className="history-url">{item.name}</span>
                              <span className="history-meta">{item.url}</span>
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
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="history-item"
                    onClick={() => loadHistoryItem(item)}
                  >
                    <span className="method">{item.method}</span>
                    <span className="history-url">{item.url}</span>
                    <span className="history-meta">
                      {item.status ?? "-"} · {item.duration_ms ?? "-"}ms
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
                onChange={(e) => setUrl(e.target.value)}
                placeholder="支持变量，例如 {{baseUrl}}/api/users"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendRequest();
                }}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => void onSaveToCollection()}
              >
                保存
              </button>
              <button
                type="button"
                className="primary"
                disabled={!canSend}
                onClick={() => void sendRequest()}
              >
                {sending ? "发送中…" : "发送"}
              </button>
            </div>

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

            {composerTab === "headers" && (
              <div className="headers">
                {headers.map((header, index) => (
                  <div className="header-row" key={index}>
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

          <section className="response">
            <div className="response-head">
              <h2>响应</h2>
              {response && (
                <div className="response-meta">
                  <span className={response.status < 400 ? "ok" : "bad"}>
                    {response.status} {response.statusText}
                  </span>
                  <span>{response.durationMs} ms</span>
                </div>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

            {!error && !response && (
              <p className="empty">
                响应显示在这里。可用 {"{{baseUrl}}"} / {"{{token}}"}，数据仅存本机。
              </p>
            )}

            {response && (
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
                </div>
                {responseTab === "body" ? (
                  <pre className="code-block">{prettyBody}</pre>
                ) : (
                  <pre className="code-block">
                    {Object.entries(response.headers)
                      .map(([k, v]) => `${k}: ${v}`)
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
