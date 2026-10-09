import { describe, expect, it } from "vitest";
import { extractByRules, queryJsonPath } from "./jsonpath";

const data = {
  a: { b: "token", items: [{ name: "first" }, { name: "second" }] },
  list: [1, { ok: true }],
};

describe("queryJsonPath", () => {
  it("读取对象路径和数组下标", () => {
    expect(queryJsonPath(data, "$.a.b")).toBe("token");
    expect(queryJsonPath(data, "$.a.items[0].name")).toBe("first");
    expect(queryJsonPath(data, "$.list[1].ok")).toBe(true);
    expect(queryJsonPath(data, "$['a']['b']")).toBe("token");
    expect(queryJsonPath(data, "$")).toBe(data);
  });

  it("不支持的表达式给出明确错误", () => {
    expect(() => queryJsonPath(data, "a.b")).toThrow(/必须以 \$ 开头/);
    expect(() => queryJsonPath(data, "$..a")).toThrow(/递归下降/);
    expect(() => queryJsonPath(data, "$.*")).toThrow(/通配符/);
    expect(() => queryJsonPath(data, "$.a[?(@.b)]")).toThrow(/过滤/);
    expect(() => queryJsonPath(data, "$.a.items[-1]")).toThrow(/负数/);
    expect(() => queryJsonPath(data, "$.missing")).toThrow(/属性不存在/);
    expect(() => queryJsonPath(data, "$.list[9]")).toThrow(/越界/);
    expect(() => queryJsonPath(data, "$.a.b.c")).toThrow(/非对象/);
  });
});

describe("extractByRules", () => {
  it("成功取值并报告失败原因", () => {
    const hits = extractByRules(JSON.stringify(data), [
      { path: "$.a.b", variable: "token" },
      { path: "$.a.items[1].name", variable: "second" },
      { path: "$.nope", variable: "missing" },
      { path: "", variable: "blank" },
      { path: "$.a.b", variable: "off", enabled: false },
    ]);
    expect(hits.map((hit) => [hit.variable, hit.ok, hit.value, hit.error])).toEqual([
      ["token", true, "token", undefined],
      ["second", true, "second", undefined],
      ["missing", false, undefined, "属性不存在：nope"],
      ["blank", false, undefined, "JSONPath 为空"],
    ]);
  });

  it("非 JSON 不静默失败", () => {
    const hits = extractByRules("not-json", [{ path: "$.a", variable: "a" }]);
    expect(hits[0]?.ok).toBe(false);
    expect(hits[0]?.error).toBe("响应不是合法 JSON");
  });

  it("对象值序列化为 JSON 字符串", () => {
    const hits = extractByRules(JSON.stringify({ user: { id: 1 } }), [
      { path: "$.user", variable: "user" },
    ]);
    expect(hits[0]?.value).toBe('{"id":1}');
  });
});
