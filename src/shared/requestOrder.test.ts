import { describe, expect, it } from "vitest";
import { backfillSortOrder, insertIdAfter, moveId } from "./requestOrder";

describe("backfillSortOrder", () => {
  it("按集合内的 id 从小到大回填，不把不同集合排到一起", () => {
    const assigned = backfillSortOrder([
      { id: 5, collectionId: 1 },
      { id: 2, collectionId: 1 },
      { id: 9, collectionId: 2 },
      { id: 4, collectionId: 2 },
      { id: 3, collectionId: 1 },
    ]);

    const orderIn = (collectionId: number) =>
      assigned
        .filter((row) => row.collectionId === collectionId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => row.id);

    expect(orderIn(1)).toEqual([2, 3, 5]);
    expect(orderIn(2)).toEqual([4, 9]);
    expect(assigned.filter((row) => row.collectionId === 1).map((row) => row.sortOrder).sort()).toEqual([
      0, 1, 2,
    ]);
  });

  it("没有集合的请求单独按 id 编号", () => {
    const assigned = backfillSortOrder([
      { id: 8, collectionId: null },
      { id: 1, collectionId: null },
      { id: 3, collectionId: 4 },
    ]);
    const loose = assigned
      .filter((row) => row.collectionId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(loose.map((row) => row.id)).toEqual([1, 8]);
    expect(loose.map((row) => row.sortOrder)).toEqual([0, 1]);
    expect(assigned.find((row) => row.id === 3)?.sortOrder).toBe(0);
  });
});

describe("insertIdAfter", () => {
  it("插在当前请求的下一行，末尾和找不到时接到最后", () => {
    expect(insertIdAfter([1, 2, 3], 1, 9)).toEqual([1, 9, 2, 3]);
    expect(insertIdAfter([1, 2, 3], 2, 9)).toEqual([1, 2, 9, 3]);
    expect(insertIdAfter([1, 2, 3], 3, 9)).toEqual([1, 2, 3, 9]);
    expect(insertIdAfter([1, 2, 3], 8, 9)).toEqual([1, 2, 3, 9]);
  });
});

describe("moveId", () => {
  it("在同一列表内移动，目标不存在时保持原顺序", () => {
    expect(moveId([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveId([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveId([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
});
