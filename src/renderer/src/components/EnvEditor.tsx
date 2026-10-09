import type { TlsConfig, VariableItem } from "@shared/types";

interface EnvEditorProps {
  editing: boolean;
  name: string;
  vars: VariableItem[];
  tls: TlsConfig;
  passphrase: string;
  onName: (value: string) => void;
  onVar: (index: number, patch: Partial<VariableItem>) => void;
  onRemoveVar: (index: number) => void;
  onTls: (patch: Partial<TlsConfig>) => void;
  onPassphrase: (value: string) => void;
  onPickTls: (field: keyof TlsConfig) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onExport: () => void;
}

export function EnvEditor(props: EnvEditorProps) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="编辑环境"
      >
        <div className="modal-head">
          <h3>{props.editing ? "编辑环境" : "新建环境"}</h3>
          <button type="button" className="ghost" onClick={props.onClose}>
            ×
          </button>
        </div>
        <label className="field">
          <span>名称</span>
          <input value={props.name} onChange={(e) => props.onName(e.target.value)} />
        </label>
        <div className="panel-title">变量</div>
        <div className="headers">
          {props.vars.map((item, index) => (
            <div className="header-row" key={index}>
              <input
                placeholder="key，如 baseUrl"
                value={item.key}
                onChange={(e) => props.onVar(index, { key: e.target.value })}
              />
              <input
                placeholder="value"
                value={item.value}
                onChange={(e) => props.onVar(index, { value: e.target.value })}
              />
              <button type="button" className="ghost" onClick={() => props.onRemoveVar(index)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="panel-title">客户端证书</div>
        <p className="empty">证书路径会随环境保存。口令只留在本次运行的内存里，不会写入数据库。</p>
        <TlsPath
          label="证书 cert"
          value={props.tls.certPath}
          onChange={(certPath) => props.onTls({ certPath })}
          onPick={() => props.onPickTls("certPath")}
        />
        <TlsPath
          label="私钥 key"
          value={props.tls.keyPath}
          onChange={(keyPath) => props.onTls({ keyPath })}
          onPick={() => props.onPickTls("keyPath")}
        />
        <TlsPath
          label="CA（可选）"
          value={props.tls.caPath}
          onChange={(caPath) => props.onTls({ caPath })}
          onPick={() => props.onPickTls("caPath")}
        />
        <label className="field">
          <span>私钥口令（可选，不落盘）</span>
          <input
            type="password"
            value={props.passphrase}
            onChange={(e) => props.onPassphrase(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          {props.editing && (
            <button type="button" className="ghost" onClick={props.onDelete}>
              删除环境
            </button>
          )}
          <button type="button" className="ghost" onClick={props.onExport}>
            导出
          </button>
          <button type="button" className="primary" onClick={props.onSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function TlsPath(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: () => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="tls-path">
        <input value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder="文件路径" />
        <button type="button" className="ghost" onClick={props.onPick}>
          选择
        </button>
      </div>
    </label>
  );
}
