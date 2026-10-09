import { CodeEditor } from "./CodeEditor";
import { editorLanguage } from "../lib/format";
import type { AuthConfig, BodyMode, ExtractRule, FormField, HeaderItem, HttpMethod, QueryItem } from "@shared/types";
import { isRowEnabled } from "@shared/types";

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export type ComposerTab = "auth" | "query" | "headers" | "body" | "extract";

interface RequestEditorProps {
  method: HttpMethod;
  url: string;
  sending: boolean;
  canSend: boolean;
  savedLabel: string;
  composerTab: ComposerTab;
  auth: AuthConfig;
  queryParams: QueryItem[];
  headers: HeaderItem[];
  body: string;
  bodyMode: BodyMode;
  formFields: FormField[];
  extractors: ExtractRule[];
  bodyDisabled: boolean;
  onMethod: (method: HttpMethod) => void;
  onUrl: (url: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCopyCurl: () => void;
  onOpenCurlImport: () => void;
  onTab: (tab: ComposerTab) => void;
  onAuth: (auth: AuthConfig) => void;
  onUpdateQuery: (index: number, patch: Partial<QueryItem>) => void;
  onRemoveQuery: (index: number) => void;
  onUpdateHeader: (index: number, patch: Partial<HeaderItem>) => void;
  onRemoveHeader: (index: number) => void;
  onBody: (body: string) => void;
  onBodyMode: (mode: BodyMode) => void;
  onUpdateFormField: (index: number, patch: Partial<FormField>) => void;
  onRemoveFormField: (index: number) => void;
  onPickFormFile: (index: number) => void;
  onUpdateExtractor: (index: number, patch: Partial<ExtractRule>) => void;
  onRemoveExtractor: (index: number) => void;
}

export function RequestEditor(props: RequestEditorProps) {
  return (
    <section className="composer">
      <div className="url-row">
        <select
          value={props.method}
          onChange={(e) => props.onMethod(e.target.value as HttpMethod)}
          aria-label="请求方法"
        >
          {METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <input
          value={props.url}
          onChange={(e) => props.onUrl(e.target.value)}
          placeholder="支持变量，例如 {{baseUrl}}/api/users"
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onSend();
          }}
        />
        <button type="button" className="secondary" title="Ctrl+S / Cmd+S" onClick={props.onSave}>
          保存
        </button>
        <button type="button" className="ghost save-as" onClick={props.onSaveAs}>
          另存为
        </button>
        {props.sending ? (
          <button type="button" className="danger" onClick={props.onCancel}>
            取消
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            title="Ctrl+Enter / Cmd+Enter"
            disabled={!props.canSend}
            onClick={props.onSend}
          >
            发送
          </button>
        )}
      </div>
      {props.savedLabel && <div className="save-binding">{props.savedLabel}</div>}

      <div className="composer-toolbar">
        <div className="tabs composer-tabs">
          {(
            [
              ["auth", "Auth"],
              ["query", "Query"],
              ["headers", "Headers"],
              ["body", "Body"],
              ["extract", "Extract"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={props.composerTab === id ? "tab active" : "tab"}
              onClick={() => props.onTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="composer-extra">
          <button type="button" className="ghost" onClick={props.onOpenCurlImport}>
            导入 cURL
          </button>
          <button type="button" className="ghost" onClick={props.onCopyCurl}>
            复制 cURL
          </button>
          <span className="shortcut-hint">Ctrl/Cmd+Enter 发送 · Ctrl/Cmd+S 保存</span>
        </div>
      </div>

      {props.composerTab === "auth" && (
        <div className="auth-panel">
          <label className="field">
            <span>类型</span>
            <select
              value={props.auth.type}
              onChange={(e) =>
                props.onAuth({ ...props.auth, type: e.target.value as AuthConfig["type"] })
              }
            >
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="apikey">API Key</option>
            </select>
          </label>
          {props.auth.type === "bearer" && (
            <label className="field">
              <span>Token</span>
              <input
                value={props.auth.bearerToken || ""}
                onChange={(e) => props.onAuth({ ...props.auth, bearerToken: e.target.value })}
                placeholder="支持 {{token}}"
              />
            </label>
          )}
          {props.auth.type === "basic" && (
            <div className="auth-grid">
              <label className="field">
                <span>Username</span>
                <input
                  value={props.auth.basicUsername || ""}
                  onChange={(e) => props.onAuth({ ...props.auth, basicUsername: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={props.auth.basicPassword || ""}
                  onChange={(e) => props.onAuth({ ...props.auth, basicPassword: e.target.value })}
                />
              </label>
            </div>
          )}
          {props.auth.type === "apikey" && (
            <div className="auth-grid">
              <label className="field">
                <span>Key</span>
                <input
                  value={props.auth.apiKeyKey || ""}
                  onChange={(e) => props.onAuth({ ...props.auth, apiKeyKey: e.target.value })}
                  placeholder="X-API-Key"
                />
              </label>
              <label className="field">
                <span>Value</span>
                <input
                  value={props.auth.apiKeyValue || ""}
                  onChange={(e) => props.onAuth({ ...props.auth, apiKeyValue: e.target.value })}
                  placeholder="支持 {{token}}"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {props.composerTab === "query" && (
        <div className="headers">
          {props.queryParams.map((item, index) => (
            <div
              className={isRowEnabled(item) ? "header-row with-toggle" : "header-row with-toggle disabled"}
              key={index}
            >
              <input
                type="checkbox"
                checked={isRowEnabled(item)}
                onChange={(e) => props.onUpdateQuery(index, { enabled: e.target.checked })}
                aria-label="启用查询参数"
              />
              <input
                placeholder="Key"
                value={item.key}
                onChange={(e) => props.onUpdateQuery(index, { key: e.target.value })}
              />
              <input
                placeholder="Value，可用 {{var}}"
                value={item.value}
                onChange={(e) => props.onUpdateQuery(index, { value: e.target.value })}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => props.onRemoveQuery(index)}
                aria-label="删除查询参数"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {props.composerTab === "headers" && (
        <div className="headers">
          {props.headers.map((header, index) => (
            <div
              className={
                isRowEnabled(header) ? "header-row with-toggle" : "header-row with-toggle disabled"
              }
              key={index}
            >
              <input
                type="checkbox"
                checked={isRowEnabled(header)}
                onChange={(e) => props.onUpdateHeader(index, { enabled: e.target.checked })}
                aria-label="启用请求头"
              />
              <input
                placeholder="Key"
                value={header.key}
                onChange={(e) => props.onUpdateHeader(index, { key: e.target.value })}
              />
              <input
                placeholder="Value，可用 {{var}}"
                value={header.value}
                onChange={(e) => props.onUpdateHeader(index, { value: e.target.value })}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => props.onRemoveHeader(index)}
                aria-label="删除请求头"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {props.composerTab === "body" && (
        <div className="body-panel">
          <div className="tabs">
            <button
              type="button"
              className={props.bodyMode === "raw" ? "tab active" : "tab"}
              onClick={() => props.onBodyMode("raw")}
            >
              raw
            </button>
            <button
              type="button"
              className={props.bodyMode === "form-data" ? "tab active" : "tab"}
              onClick={() => props.onBodyMode("form-data")}
            >
              form-data
            </button>
          </div>
          {props.bodyMode === "raw" ? (
            <CodeEditor
              value={props.body}
              onChange={props.onBody}
              readOnly={props.bodyDisabled}
              language={editorLanguage(props.body)}
            />
          ) : (
            <div className="form-fields">
              <p className="empty">文件只保存本机路径，不会把文件内容写入数据库。</p>
              {props.formFields.map((field, index) => (
                <div className="form-field" key={index}>
                  <input
                    type="checkbox"
                    checked={isRowEnabled(field)}
                    disabled={props.bodyDisabled}
                    onChange={(e) => props.onUpdateFormField(index, { enabled: e.target.checked })}
                    aria-label="启用表单字段"
                  />
                  <input
                    placeholder="字段名"
                    value={field.key}
                    disabled={props.bodyDisabled}
                    onChange={(e) => props.onUpdateFormField(index, { key: e.target.value })}
                  />
                  <select
                    value={field.type}
                    disabled={props.bodyDisabled}
                    aria-label="字段类型"
                    onChange={(e) =>
                      props.onUpdateFormField(index, { type: e.target.value as FormField["type"] })
                    }
                  >
                    <option value="text">文本</option>
                    <option value="file">文件</option>
                  </select>
                  {field.type === "file" ? (
                    <>
                      <input value={field.value} readOnly placeholder="文件路径" />
                      <button
                        type="button"
                        className="ghost"
                        disabled={props.bodyDisabled}
                        onClick={() => props.onPickFormFile(index)}
                      >
                        选择
                      </button>
                      <input
                        value={field.fileName || ""}
                        disabled={props.bodyDisabled}
                        placeholder="文件名"
                        onChange={(e) => props.onUpdateFormField(index, { fileName: e.target.value })}
                      />
                      <input
                        value={field.contentType || ""}
                        disabled={props.bodyDisabled}
                        placeholder="Content-Type"
                        onChange={(e) =>
                          props.onUpdateFormField(index, { contentType: e.target.value })
                        }
                      />
                    </>
                  ) : (
                    <input
                      placeholder="值，可用 {{var}}"
                      value={field.value}
                      disabled={props.bodyDisabled}
                      onChange={(e) => props.onUpdateFormField(index, { value: e.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => props.onRemoveFormField(index)}
                    aria-label="删除表单字段"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {props.composerTab === "extract" && (
        <div className="headers">
          <p className="empty">响应成功且为 JSON 时，按 JSONPath 写入当前环境。例如 $.data.token</p>
          {props.extractors.map((rule, index) => (
            <div
              className={isRowEnabled(rule) ? "header-row with-toggle" : "header-row with-toggle disabled"}
              key={index}
            >
              <input
                type="checkbox"
                checked={isRowEnabled(rule)}
                onChange={(e) => props.onUpdateExtractor(index, { enabled: e.target.checked })}
                aria-label="启用提取规则"
              />
              <input
                placeholder="JSONPath，如 $.data.token"
                value={rule.path}
                onChange={(e) => props.onUpdateExtractor(index, { path: e.target.value })}
              />
              <input
                placeholder="变量名"
                value={rule.variable}
                onChange={(e) => props.onUpdateExtractor(index, { variable: e.target.value })}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => props.onRemoveExtractor(index)}
                aria-label="删除提取规则"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface CurlImportDialogProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CurlImportDialog(props: CurlImportDialogProps) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="导入 cURL"
      >
        <div className="modal-head">
          <h3>导入 cURL</h3>
          <button type="button" className="ghost" onClick={props.onClose}>
            ×
          </button>
        </div>
        <textarea
          className="curl-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="粘贴 curl 命令，支持 -X -H -d --data-raw -F 和反斜杠续行"
        />
        <div className="modal-actions">
          <button type="button" className="primary" onClick={props.onSubmit}>
            生成请求
          </button>
        </div>
      </div>
    </div>
  );
}
