import { describe, expect, it } from "vitest";
import { parseRequestMeta, serializeRequestMeta } from "./requestMeta";

describe("requestMeta", () => {
  it("往返保存 multipart 字段和提取规则，并丢掉空行", () => {
    const raw = serializeRequestMeta({
      bodyMode: "form-data",
      formFields: [
        { key: "note", type: "text", value: "hi", enabled: true },
        { key: "", type: "text", value: "", enabled: true },
        { key: "file", type: "file", value: "D:/a.txt", fileName: "a.txt", enabled: true },
      ],
      urlencodedFields: [
        { key: "user", value: "ann", enabled: true },
        { key: "", value: "", enabled: true },
      ],
      extractors: [
        { path: "$.token", variable: "token", enabled: true },
        { path: "", variable: "", enabled: true },
      ],
      runEnabled: true,
    });
    expect(parseRequestMeta(raw)).toEqual({
      bodyMode: "form-data",
      formFields: [
        { key: "note", type: "text", value: "hi", enabled: true },
        { key: "file", type: "file", value: "D:/a.txt", fileName: "a.txt", enabled: true },
      ],
      urlencodedFields: [{ key: "user", value: "ann", enabled: true }],
      extractors: [{ path: "$.token", variable: "token", enabled: true }],
      runEnabled: true,
    });
  });

  it("损坏或空数据回到 raw", () => {
    expect(parseRequestMeta("")).toEqual({
      bodyMode: "raw",
      formFields: [],
      urlencodedFields: [],
      extractors: [],
      runEnabled: true,
    });
    expect(parseRequestMeta("{")).toEqual({
      bodyMode: "raw",
      formFields: [],
      urlencodedFields: [],
      extractors: [],
      runEnabled: true,
    });
  });

  it("缺省 runEnabled 时参与运行，显式关闭后保持关闭", () => {
    expect(parseRequestMeta(JSON.stringify({ bodyMode: "raw" })).runEnabled).toBe(true);
    expect(parseRequestMeta("{}").runEnabled).toBe(true);
    const raw = serializeRequestMeta({
      bodyMode: "raw",
      formFields: [],
      urlencodedFields: [],
      extractors: [],
      runEnabled: false,
    });
    expect(JSON.parse(raw).runEnabled).toBe(false);
    expect(parseRequestMeta(raw).runEnabled).toBe(false);
  });
});
