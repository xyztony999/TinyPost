import { useMemo, useRef } from "react";
import { statusTone } from "../lib/format";
import type { CollectionRow, HistoryRow, SavedRequestRow } from "@shared/types";

interface SidebarProps {
  tab: "collections" | "history";
  search: string;
  collections: CollectionRow[];
  savedRequests: SavedRequestRow[];
  history: HistoryRow[];
  currentSavedId: number | null;
  expanded: number[];
  onTab: (tab: "collections" | "history") => void;
  onSearch: (value: string) => void;
  onToggle: (id: number) => void;
  onCreate: () => void;
  onImportFile: (file: File) => void;
  onBackup: () => void;
  onRestore: () => void;
  onExportCollection: (collection: CollectionRow) => void;
  onRenameCollection: (collection: CollectionRow) => void;
  onDeleteCollection: (id: number) => void;
  onLoadSaved: (item: SavedRequestRow) => void;
  onRenameSaved: (item: SavedRequestRow) => void;
  onDeleteSaved: (id: number) => void;
  onClearHistory: () => void;
  onLoadHistory: (item: HistoryRow) => void;
}

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export function Sidebar(props: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchNeedle = props.search.trim().toLowerCase();

  const filteredHistory = useMemo(() => {
    if (!searchNeedle) return props.history;
    return props.history.filter((item) =>
      [item.method, item.url, String(item.status ?? "")].some((part) => matchesQuery(part, searchNeedle)),
    );
  }, [props.history, searchNeedle]);

  const visibleCollections = useMemo(() => {
    if (!searchNeedle) return props.collections;
    return props.collections.filter((collection) => {
      if (matchesQuery(collection.name, searchNeedle)) return true;
      return props.savedRequests.some(
        (item) =>
          item.collection_id === collection.id &&
          [item.name, item.method, item.url].some((part) => matchesQuery(part, searchNeedle)),
      );
    });
  }, [props.collections, props.savedRequests, searchNeedle]);

  function requestsOf(collectionId: number): SavedRequestRow[] {
    return props.savedRequests.filter((item) => {
      if (item.collection_id !== collectionId) return false;
      if (!searchNeedle) return true;
      return [item.name, item.method, item.url].some((part) => matchesQuery(part, searchNeedle));
    });
  }

  function isCollectionExpanded(id: number): boolean {
    if (searchNeedle) return true;
    return props.expanded.includes(id);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          type="button"
          className={props.tab === "collections" ? "tab active" : "tab"}
          onClick={() => props.onTab("collections")}
        >
          集合
        </button>
        <button
          type="button"
          className={props.tab === "history" ? "tab active" : "tab"}
          onClick={() => props.onTab("history")}
        >
          历史
        </button>
      </div>

      <div className="sidebar-search-wrap">
        <input
          className="sidebar-search"
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
          placeholder={props.tab === "collections" ? "搜索集合或请求" : "搜索历史"}
          aria-label="侧栏搜索"
        />
      </div>

      {props.tab === "collections" ? (
        <>
          <div className="sidebar-head">
            <h2>集合</h2>
            <div className="sidebar-actions">
              <button type="button" className="ghost" onClick={props.onCreate}>
                新建
              </button>
              <button type="button" className="ghost" onClick={() => fileInputRef.current?.click()}>
                导入
              </button>
              <button type="button" className="ghost" onClick={props.onBackup}>
                备份
              </button>
              <button type="button" className="ghost" onClick={props.onRestore}>
                恢复
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
              if (file) props.onImportFile(file);
              e.target.value = "";
            }}
          />
          <div className="history-list">
            {props.collections.length === 0 && (
              <p className="empty">还没有集合。可新建，或导入 Postman / TinyPost JSON。</p>
            )}
            {props.collections.length > 0 && visibleCollections.length === 0 && (
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
                      onClick={() => props.onToggle(collection.id)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        props.onRenameCollection(collection);
                      }}
                    >
                      <span>{expanded ? "▾" : "▸"}</span>
                      <strong>{collection.name}</strong>
                      <em>{requests.length}</em>
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => props.onExportCollection(collection)}
                    >
                      导出
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => props.onRenameCollection(collection)}
                      aria-label="重命名集合"
                      title="重命名"
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => props.onDeleteCollection(collection.id)}
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
                          className={item.id === props.currentSavedId ? "history-item active" : "history-item"}
                          onClick={() => props.onLoadSaved(item)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            props.onRenameSaved(item);
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
                            onClick={() => props.onRenameSaved(item)}
                            aria-label="重命名请求"
                            title="重命名"
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => props.onDeleteSaved(item.id)}
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
            <button type="button" className="ghost" onClick={props.onClearHistory}>
              清空
            </button>
          </div>
          <div className="history-list">
            {props.history.length === 0 && <p className="empty">还没有请求记录，发一条试试。</p>}
            {props.history.length > 0 && filteredHistory.length === 0 && (
              <p className="empty">没有匹配的历史记录。</p>
            )}
            {filteredHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                className="history-item"
                onClick={() => props.onLoadHistory(item)}
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
  );
}
