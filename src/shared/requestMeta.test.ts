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
    });
    expect(parseRequestMeta(raw)).toEqual({
      bodyMode: "form-data",
      formFields: [
        { key: "note", type: "text", value: "hi", enabled: true },
        { key: "file", type: "file", value: "D:/a.txt", fileName: "a.txt", enabled: true },
      ],
      urlencodedFields: [{ key: "user", value: "ann", enabled: true }],
      extractors: [{ path: "$.token", variable: "token", enabled: true }],
    });
  });

  it("损坏或空数据回到 raw", () => {
    expect(parseRequestMeta("")).toEqual({
      bodyMode: "raw",
      formFields: [],
      urlencodedFields: [],
      extractors: [],
    });
    expect(parseRequestMeta("{")).toEqual({
      bodyMode: "raw",
      formFields: [],
      urlencodedFields: [],
      extractors: [],
    });
  });
});
