import { useEffect, useMemo, useRef, useState } from "react";
import type { ExtractionHit } from "@shared/jsonpath";
import { formatBytes, presentBody, statusTone } from "../lib/format";
import { mediaType } from "@shared/contentType";
import type { HttpResponsePayload } from "@shared/types";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";

interface ResponseViewProps {
  sending: boolean;
  elapsedMs: number;
  error: string | null;
  response: HttpResponsePayload | null;
  responsePretty: boolean;
  responseTab: "body" | "headers" | "redirects";
  extractNotice: ExtractionHit[];
  onTogglePretty: () => void;
  onTab: (tab: "body" | "headers" | "redirects") => void;
  onCopy: (text: string) => void;
  onCopyCurl: () => void;
  onSaveFile: () => void;
  onExtract: (path: string, variable: string) => void;
}

export function ResponseView(props: ResponseViewProps) {
  const editorRef = useRef<CodeEditorHandle>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState({ current: 0, total: 0 });
  const [showExtract, setShowExtract] = useState(false);
  const [path, setPath] = useState("$.token");
  const [variable, setVariable] = useState("");
  const presented = useMemo(
    () => (props.response ? presentBody(props.response.body, props.responsePretty) : null),
    [props.response, props.responsePretty],
  );
  const responseSize = props.response
    ? (props.response.sizeBytes ?? new Blob([props.response.body || ""]).size)
    : 0;

  useEffect(() => {
    if (props.responseTab !== "body" || !presented) return;
    const result = editorRef.current?.search(query, "refresh") ?? { current: 0, total: 0 };
    setCursor(result);
  }, [query, presented, props.responseTab]);

  return (
    <section
      className={
        props.sending
          ? "response is-loading"
          : props.response
            ? `response tone-${statusTone(props.response.status)}`
            : "response"
      }
    >
      <div className="response-head">
        <h2>响应</h2>
        {props.sending && (
          <div className="response-meta">
            <span className="status-badge tone-pending">发送中</span>
            <span>{props.elapsedMs} ms</span>
          </div>
        )}
        {props.response && !props.sending && (
          <div className="response-meta">
            <span className={`status-badge tone-${statusTone(props.response.status)}`}>
              {props.response.status} {props.response.statusText}
            </span>
            <span>{props.response.durationMs} ms</span>
            <span>{formatBytes(responseSize)}</span>
            {props.response.url && (
              <span className="final-url" title={props.response.url}>
                {props.response.url}
              </span>
            )}
          </div>
        )}
        {props.response && !props.sending && (
          <div className="response-tools">
            {!props.response.binary && (
              <button type="button" className="ghost" onClick={props.onTogglePretty}>
                {props.responsePretty ? "Raw" : "Pretty"}
              </button>
            )}
            {!props.response.binary && (
              <button type="button" className="ghost" onClick={() => props.onCopy(presented?.text || "")}>
                复制
              </button>
            )}
            <button type="button" className="ghost" onClick={props.onCopyCurl}>
              复制 cURL
            </button>
            <button type="button" className="ghost" onClick={props.onSaveFile}>
              {props.response.binary ? "保存原始响应" : "存文件"}
            </button>
            {!props.response.binary && (
              <button type="button" className="ghost" onClick={() => setShowExtract(true)}>
                提取到变量
              </button>
            )}
          </div>
        )}
      </div>

      {props.error && !props.sending && <div className="error-box">{props.error}</div>}
      {presented?.error && !props.sending && <div className="error-box">{presented.error}</div>}

      {props.extractNotice.length > 0 && !props.sending && (
        <div className="extract-notice">
          {props.extractNotice.map((hit, index) => (
            <div key={`${hit.variable}-${index}`} className={hit.ok ? "extract-ok" : "extract-fail"}>
              {hit.ok ? `已写入 ${hit.variable} = ${hit.value}` : `${hit.variable || hit.path}：${hit.error}`}
            </div>
          ))}
        </div>
      )}

      {props.sending && (
        <div className="response-loading" aria-live="polite" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>请求发送中…</strong>
            <p>等待服务器返回，已用时 {props.elapsedMs} ms</p>
          </div>
        </div>
      )}

      {!props.error && !props.response && !props.sending && (
        <p className="empty">响应显示在这里。可用 {"{{baseUrl}}"} / {"{{token}}"}，数据仅存本机。</p>
      )}

      {props.response && !props.sending && (
        <>
          <div className="tabs">
            <button
              type="button"
              className={props.responseTab === "body" ? "tab active" : "tab"}
              onClick={() => props.onTab("body")}
            >
              Body
            </button>
            <button
              type="button"
              className={props.responseTab === "headers" ? "tab active" : "tab"}
              onClick={() => props.onTab("headers")}
            >
              Headers
            </button>
            {props.response.redirects?.length ? (
              <button
                type="button"
                className={props.responseTab === "redirects" ? "tab active" : "tab"}
                onClick={() => props.onTab("redirects")}
              >
                Redirects ({props.response.redirects.length})
              </button>
            ) : null}
          </div>
          {props.responseTab === "body" && props.response.binary ? (
            <div className="binary-note">
              <strong>二进制响应</strong>
              <p>
                {mediaType(props.response.contentType) || "application/octet-stream"} ·{" "}
                {formatBytes(responseSize)}
              </p>
              <p>内容不会在编辑器里打开，也不会写入历史数据库。可以保存原始字节。</p>
            </div>
          ) : props.responseTab === "body" ? (
            <>
              <div className="response-search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索响应"
                  aria-label="搜索响应"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const result = editorRef.current?.search(query, e.shiftKey ? "prev" : "next");
                    if (result) setCursor(result);
                  }}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const result = editorRef.current?.search(query, "prev");
                    if (result) setCursor(result);
                  }}
                >
                  上一个
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const result = editorRef.current?.search(query, "next");
                    if (result) setCursor(result);
                  }}
                >
                  下一个
                </button>
                <span className="shortcut-hint">
                  {cursor.total ? `${cursor.current}/${cursor.total}` : "0/0"}
                </span>
              </div>
              <CodeEditor
                ref={editorRef}
                value={presented?.text || ""}
                readOnly
                language={presented?.language || "text"}
                variant="response"
              />
            </>
          ) : props.responseTab === "headers" ? (
            <pre className="code-block">
              {Object.entries(props.response.headers)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
            </pre>
          ) : (
            <pre className="code-block">
              {(props.response.redirects || [])
                .map((hop, index) => `${index + 1}. ${hop.status} ${hop.url}\n   → ${hop.location}`)
                .join("\n")}
            </pre>
          )}
        </>
      )}

      {showExtract && (
        <div className="modal-backdrop" onClick={() => setShowExtract(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="提取到变量"
          >
            <div className="modal-head">
              <h3>提取到变量</h3>
              <button type="button" className="ghost" onClick={() => setShowExtract(false)}>
                ×
              </button>
            </div>
            <label className="field">
              <span>JSONPath</span>
              <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="$.data.token" />
            </label>
            <label className="field">
              <span>变量名</span>
              <input
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                placeholder="token"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  props.onExtract(path, variable);
                  setShowExtract(false);
                }}
              >
                写入当前环境
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
