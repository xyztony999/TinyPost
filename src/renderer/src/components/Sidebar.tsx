import { useMemo, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { compareSavedRequestOrder, moveId } from "@shared/requestOrder";
import { parseRequestMeta } from "@shared/requestMeta";
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
  onDuplicateSaved: (item: SavedRequestRow) => void;
  onToggleRun: (item: SavedRequestRow, enabled: boolean) => void;
  onDeleteSaved: (id: number) => void;
  onReorderSaved: (collectionId: number, orderedIds: number[]) => void;
  onRunCollection: (collection: CollectionRow) => void;
  runningCollectionId: number | null;
  onClearHistory: () => void;
  onLoadHistory: (item: HistoryRow) => void;
}

function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function dragStyle(
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null,
  transition: string | undefined,
): { transform?: string; transition?: string } {
  if (!transform) return { transition };
  return {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scaleX}, ${transform.scaleY})`,
    transition,
  };
}

function SortableSavedRow(props: {
  item: SavedRequestRow;
  dragDisabled: boolean;
  active: boolean;
  onLoad: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  runEnabled: boolean;
  onToggleRun: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    disabled: props.dragDisabled,
  });
  const rowClass = ["saved-row", isDragging ? "is-dragging" : "", props.runEnabled ? "" : "is-skipped"]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} style={dragStyle(transform, transition)} className={rowClass}>
      <button
        type="button"
        className="drag-handle"
        aria-label="拖拽排序"
        title={props.dragDisabled ? "清除搜索后再排序" : "拖拽排序"}
        disabled={props.dragDisabled}
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
      >
        ⋮⋮
      </button>
      <div className="saved-main">
        <button
          type="button"
          className={props.active ? "history-item active" : "history-item"}
          onClick={props.onLoad}
          onDoubleClick={(e) => {
            e.preventDefault();
            props.onRename();
          }}
        >
          <span className="method">{props.item.method}</span>
          <span className="history-url">{props.item.name}</span>
          <span className="history-meta">{props.item.url}</span>
        </button>
        <label className="run-toggle" title="关闭后仍留在集合中，集合运行时跳过">
          <input
            type="checkbox"
            checked={props.runEnabled}
            aria-label={`${props.item.name} 参与运行`}
            onChange={(e) => props.onToggleRun(e.target.checked)}
          />
          参与运行
        </label>
      </div>
      <div className="row-actions">
        <button type="button" className="ghost" onClick={props.onRename} aria-label="重命名请求" title="重命名">
          重命名
        </button>
        <button type="button" className="ghost" onClick={props.onDuplicate} aria-label="复制请求" title="复制">
          复制
        </button>
        <button type="button" className="ghost" onClick={props.onDelete} aria-label="删除请求">
          ×
        </button>
      </div>
    </div>
  );
}

function CollectionRequestList(props: {
  collectionId: number;
  requests: SavedRequestRow[];
  dragDisabled: boolean;
  currentSavedId: number | null;
  onReorder: (collectionId: number, orderedIds: number[]) => void;
  onLoadSaved: (item: SavedRequestRow) => void;
  onRenameSaved: (item: SavedRequestRow) => void;
  onDuplicateSaved: (item: SavedRequestRow) => void;
  onToggleRun: (item: SavedRequestRow, enabled: boolean) => void;
  onDeleteSaved: (id: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = props.requests.map((item) => item.id);

  function onDragEnd(event: DragEndEvent) {
    if (props.dragDisabled) return;
    const overId = event.over?.id;
    if (overId == null || event.active.id === overId) return;
    props.onReorder(props.collectionId, moveId(ids, Number(event.active.id), Number(overId)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {props.requests.map((item) => (
          <SortableSavedRow
            key={item.id}
            item={item}
            dragDisabled={props.dragDisabled}
            active={item.id === props.currentSavedId}
            onLoad={() => props.onLoadSaved(item)}
            onRename={() => props.onRenameSaved(item)}
            onDuplicate={() => props.onDuplicateSaved(item)}
            onDelete={() => props.onDeleteSaved(item.id)}
            runEnabled={parseRequestMeta(item.meta).runEnabled}
            onToggleRun={(enabled) => props.onToggleRun(item, enabled)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
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
    return props.savedRequests
      .filter((item) => {
        if (item.collection_id !== collectionId) return false;
        if (!searchNeedle) return true;
        return [item.name, item.method, item.url].some((part) => matchesQuery(part, searchNeedle));
      })
      .sort(compareSavedRequestOrder);
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
                      disabled={props.runningCollectionId != null}
                      onClick={() => props.onRunCollection(collection)}
                    >
                      {props.runningCollectionId === collection.id ? "运行中" : "运行"}
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
                  {expanded && requests.length > 0 && (
                    <CollectionRequestList
                      collectionId={collection.id}
                      requests={requests}
                      dragDisabled={Boolean(searchNeedle)}
                      currentSavedId={props.currentSavedId}
                      onReorder={props.onReorderSaved}
                      onLoadSaved={props.onLoadSaved}
                      onRenameSaved={props.onRenameSaved}
                      onDuplicateSaved={props.onDuplicateSaved}
                      onToggleRun={props.onToggleRun}
                      onDeleteSaved={props.onDeleteSaved}
                    />
                  )}
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
