export interface RequestOrderRef {
  id: number;
  collectionId: number | null;
}

export interface AssignedRequestOrder extends RequestOrderRef {
  sortOrder: number;
}

/** 旧数据没有顺序时，按各集合内的 id 从小到大回填，从 0 起连续编号。 */
export function backfillSortOrder(rows: RequestOrderRef[]): AssignedRequestOrder[] {
  const groups = new Map<number | null, RequestOrderRef[]>();
  for (const row of rows) {
    const group = groups.get(row.collectionId);
    if (group) group.push(row);
    else groups.set(row.collectionId, [row]);
  }

  const assigned: AssignedRequestOrder[] = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => a.id - b.id);
    sorted.forEach((row, index) => {
      assigned.push({ id: row.id, collectionId: row.collectionId, sortOrder: index });
    });
  }
  return assigned;
}

/** 把 newId 插到 afterId 的下一行。afterId 不在列表中时接到末尾。 */
export function insertIdAfter(ids: number[], afterId: number, newId: number): number[] {
  const index = ids.indexOf(afterId);
  if (index < 0) return [...ids, newId];
  const next = ids.slice();
  next.splice(index + 1, 0, newId);
  return next;
}

/** 同一列表内把 activeId 移动到 overId 当前的位置。 */
export function moveId(ids: number[], activeId: number, overId: number): number[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids.slice();
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  if (moved == null) return next;
  next.splice(to, 0, moved);
  return next;
}

export function compareSavedRequestOrder(
  a: { sort_order: number; id: number },
  b: { sort_order: number; id: number },
): number {
  return a.sort_order - b.sort_order || a.id - b.id;
}
