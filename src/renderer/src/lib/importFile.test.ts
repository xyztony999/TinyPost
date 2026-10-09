import { describe, expect, it } from "vitest";
import { parseImportJson } from "./importFile";

describe("parseImportJson", () => {
  it("按内容区分 TinyPost、Postman 集合和环境", () => {
    expect(
      parseImportJson(
        JSON.stringify({
          version: 1,
          kind: "tinypost.environment",
          name: "本地",
          variables: [{ key: "baseUrl", value: "http://a" }],
        }),
      ).type,
    ).toBe("environment");

    expect(
      parseImportJson(
        JSON.stringify({
          name: "Dev",
          values: [{ key: "baseUrl", value: "http://a", enabled: true }],
        }),
      ).type,
    ).toBe("postman-environment");

    expect(
      parseImportJson(
        JSON.stringify({
          info: { name: "C", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
          item: [{ name: "Ping", request: { method: "GET", url: "http://a" } }],
        }),
      ).type,
    ).toBe("postman-collection");
  });

  it("TinyPost 文件版本不对时失败", () => {
    expect(() => parseImportJson(JSON.stringify({ version: 9, kind: "tinypost.collection" }))).toThrow(
      /版本/,
    );
  });
});