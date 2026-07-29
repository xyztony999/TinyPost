import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TinyPostLogo } from "./components/TinyPostLogo";
import { clearHistory, listHistory, saveHistory } from "./db";
import type {
  HeaderItem,
  HistoryRow,
  HttpMethod,
  HttpResponsePayload,
} from "./types";
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

function emptyHeader(): HeaderItem {
  return { key: "", value: "" };
}

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function App() {
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [headers, setHeaders] = useState<HeaderItem[]>([
    { key: "Accept", value: "application/json" },
    emptyHeader(),
  ]);
  const [body, setBody] = useState("");
  const [insecure, setInsecure] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<HttpResponsePayload | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [activeTab, setActiveTab] = useState<"body" | "headers">("body");

  const canSend = useMemo(() => url.trim().length > 0 && !sending, [url, sending]);

  async function refreshHistory() {
    try {
      setHistory(await listHistory());
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    void refreshHistory();
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

  function loadHistoryItem(item: HistoryRow) {
    setMethod((item.method.toUpperCase() as HttpMethod) || "GET");
    setUrl(item.url);
    try {
      const parsed = JSON.parse(item.request_headers) as HeaderItem[];
      setHeaders(parsed.length ? [...parsed, emptyHeader()] : [emptyHeader()]);
    } catch {
      setHeaders([emptyHeader()]);
    }
    setBody(item.request_body || "");
    setResponse({
      status: item.status ?? 0,
      statusText: "",
      headers: JSON.parse(item.response_headers || "{}"),
      body: item.response_body || "",
      durationMs: item.duration_ms ?? 0,
    });
    setError(null);
    setActiveTab("body");
  }

  async function sendRequest() {
    if (!canSend) return;
    setSending(true);
    setError(null);

    const cleanedHeaders = headers.filter((h) => h.key.trim());

    try {
      const result = await invoke<HttpResponsePayload>("http_send", {
        payload: {
          method,
          url: url.trim(),
          headers: cleanedHeaders,
          body: ["GET", "HEAD"].includes(method) ? undefined : body,
          insecure,
        },
      });

      setResponse(result);
      await saveHistory({
        method,
        url: url.trim(),
        headers: cleanedHeaders,
        body,
        response: result,
      });
      await refreshHistory();
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
    await refreshHistory();
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
        <label className="insecure">
          <input
            type="checkbox"
            checked={insecure}
            onChange={(e) => setInsecure(e.target.checked)}
          />
          允许不安全证书（内网自签）
        </label>
      </header>

      <div className="layout">
        <aside className="sidebar">
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
                <span className={`method method-${item.method.toLowerCase()}`}>
                  {item.method}
                </span>
                <span className="history-url">{item.url}</span>
                <span className="history-meta">
                  {item.status ?? "-"} · {item.duration_ms ?? "-"}ms
                </span>
              </button>
            ))}
          </div>
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
                placeholder="输入 URL，例如 http://192.168.1.10:8080/api/health"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendRequest();
                }}
              />
              <button
                type="button"
                className="primary"
                disabled={!canSend}
                onClick={() => void sendRequest()}
              >
                {sending ? "发送中…" : "发送"}
              </button>
            </div>

            <div className="editor-grid">
              <div className="panel">
                <div className="panel-title">请求头</div>
                <div className="headers">
                  {headers.map((header, index) => (
                    <div className="header-row" key={index}>
                      <input
                        placeholder="Key"
                        value={header.key}
                        onChange={(e) => updateHeader(index, { key: e.target.value })}
                      />
                      <input
                        placeholder="Value"
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
              </div>

              <div className="panel">
                <div className="panel-title">请求体</div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='JSON / 文本，例如 {"name":"tinypost"}'
                  disabled={method === "GET" || method === "HEAD"}
                />
              </div>
            </div>
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
              <p className="empty">响应会显示在这里。数据只存在本机 SQLite，不上云。</p>
            )}

            {response && (
              <>
                <div className="tabs">
                  <button
                    type="button"
                    className={activeTab === "body" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("body")}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    className={activeTab === "headers" ? "tab active" : "tab"}
                    onClick={() => setActiveTab("headers")}
                  >
                    Headers
                  </button>
                </div>
                {activeTab === "body" ? (
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
    </div>
  );
}

export default App;
