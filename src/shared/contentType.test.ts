import { describe, expect, it } from "vitest";
import { binaryHistoryNote, extensionForContentType, isTextContentType } from "./contentType";

describe("contentType", () => {
  it("文本和 JSON 进编辑器，PDF 保留为二进制", () => {
    expect(isTextContentType(undefined)).toBe(true);
    expect(isTextContentType("application/json; charset=utf-8")).toBe(true);
    expect(isTextContentType("text/html")).toBe(true);
    expect(isTextContentType("application/xml")).toBe(true);
    expect(isTextContentType("application/pdf")).toBe(false);
    expect(isTextContentType("application/octet-stream")).toBe(false);
  });

  it("给出扩展名和历史说明", () => {
    expect(extensionForContentType("application/pdf")).toBe("pdf");
    expect(extensionForContentType("image/png")).toBe("png");
    expect(binaryHistoryNote("application/pdf", 12)).toBe("[二进制响应 application/pdf，12 字节]");
  });
});
