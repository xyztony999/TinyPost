import { describe, expect, it } from "vitest";
import { parsePortable } from "./portable";

describe("parsePortable", () => {
  it("校验集合", () => {
    const doc = parsePortable(
      JSON.stringify({
        version: 1,
        kind: "tinypost.collection",
        name: "演示",
        requests: [
          {
            name: "登录",
            method: "POST",
            url: "{{baseUrl}}/login",
            headers: [{ key: "Accept", value: "application/json" }],
            body: "{}",
            bodyMode: "form-data",
            formFields: [{ key: "file", type: "file", value: "D:/a.txt" }],
            extractors: [{ path: "$.token", variable: "token" }],
          },
        ],
      }),
    );
    expect(doc.kind).toBe("tinypost.collection");
    if (doc.kind !== "tinypost.collection") return;
    expect(doc.requests[0]?.bodyMode).toBe("form-data");
    expect(doc.requests[0]?.auth.type).toBe("none");
    expect(doc.requests[0]?.formFields[0]?.value).toBe("D:/a.txt");
  });

  it("校验环境", () => {
    const doc = parsePortable(
      JSON.stringify({
        version: 1,
        kind: "tinypost.environment",
        name: "本地",
        variables: [{ key: "baseUrl", value: "http://127.0.0.1" }],
        tls: { certPath: "c.pem", keyPath: "k.pem" },
      }),
    );
    expect(doc.kind).toBe("tinypost.environment");
    if (doc.kind !== "tinypost.environment") return;
    expect(doc.variables).toEqual([{ key: "baseUrl", value: "http://127.0.0.1" }]);
    expect(doc.tls.caPath).toBe("");
  });

  it("拒绝缺版本、错误版本、错误 kind 和非法 JSON", () => {
    expect(() => parsePortable("{")).toThrow(/JSON/);
    expect(() => parsePortable(JSON.stringify({ kind: "tinypost.collection", name: "a", requests: [] }))).toThrow(
      /version/,
    );
    expect(() =>
      parsePortable(JSON.stringify({ version: 2, kind: "tinypost.collection", name: "a", requests: [] })),
    ).toThrow(/不支持的文件版本/);
    expect(() => parsePortable(JSON.stringify({ version: 1, kind: "other" }))).toThrow(/kind/);
    expect(() =>
      parsePortable(
        JSON.stringify({
          version: 1,
          kind: "tinypost.collection",
          name: "a",
          requests: [{ name: "x", method: "GET" }],
        }),
      ),
    ).toThrow(/缺少 URL/);
  });
});
