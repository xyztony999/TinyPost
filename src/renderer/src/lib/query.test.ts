import { describe, expect, it } from "vitest";
import { buildUrl, mergeQueryFromUrl, parseQueryJson, queryFromUrl, serializeQuery, splitUrl } from "./query";

describe("query", () => {
  it("拆分 hash 和查询串", () => {
    expect(splitUrl("https://example.com/a?q=1#top")).toEqual({
      base: "https://example.com/a",
      query: "q=1",
      hash: "#top",
    });
  });

  it("编码普通值，保留变量占位", () => {
    const url = buildUrl("https://example.com/a#top", [
      { key: "q", value: "a b", enabled: true },
      { key: "token", value: "{{token}}", enabled: true },
      { key: "off", value: "x", enabled: false },
    ]);
    expect(url).toBe("https://example.com/a?q=a%20b&token={{token}}#top");
  });

  it("从 URL 回填时保留已禁用的参数", () => {
    const merged = mergeQueryFromUrl("https://example.com?q=1", [
      { key: "q", value: "old", enabled: true },
      { key: "off", value: "x", enabled: false },
    ]);
    expect(merged.map((item) => [item.key, item.value, item.enabled])).toEqual([
      ["q", "1", true],
      ["off", "x", false],
      ["", "", true],
    ]);
  });

  it("解析和序列化查询 JSON", () => {
    expect(parseQueryJson("")).toBeNull();
    expect(parseQueryJson("[]")).toBeNull();
    const items = parseQueryJson('[{"key":"a","value":"b","enabled":false}]');
    expect(items?.[0]).toMatchObject({ key: "a", value: "b", enabled: false });
    expect(serializeQuery(queryFromUrl("https://example.com?a=b"))).toContain('"key":"a"');
  });
});
