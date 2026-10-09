import { describe, expect, it } from "vitest";
import { parseVariablesJson, substituteVars, variablesToMap } from "./vars";

describe("vars", () => {
  it("解析数组和对象两种变量 JSON", () => {
    expect(parseVariablesJson('[{"key":"baseUrl","value":"http://a"}]')).toEqual([
      { key: "baseUrl", value: "http://a" },
    ]);
    expect(parseVariablesJson('{"token":"abc"}')).toEqual([{ key: "token", value: "abc" }]);
    expect(parseVariablesJson("nope")).toEqual([]);
  });

  it("替换变量，缺失时保留占位", () => {
    const map = variablesToMap([
      { key: "baseUrl", value: "http://127.0.0.1" },
      { key: "", value: "skip" },
      { key: "empty", value: "" },
    ]);
    expect(substituteVars("{{ baseUrl }}/{{missing}}/{{empty}}", map)).toBe(
      "http://127.0.0.1/{{missing}}/",
    );
    expect(substituteVars("", map)).toBe("");
  });
});
