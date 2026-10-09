import { describe, expect, it } from "vitest";
import { buildMultipart, withMultipartContentType } from "./multipart";

const decoder = new TextDecoder();

describe("buildMultipart", () => {
  it("组装文本字段和二进制文件", () => {
    const binary = new Uint8Array([0, 255, 10, 13]);
    const built = buildMultipart(
      [
        { name: "title", data: "你好" },
        {
          name: 'file"1',
          filename: "a.bin",
          contentType: "application/octet-stream",
          data: binary,
        },
      ],
      "BOUND",
    );
    const text = decoder.decode(built.body);
    expect(built.contentType).toBe("multipart/form-data; boundary=BOUND");
    expect(text).toContain('Content-Disposition: form-data; name="title"');
    expect(text).toContain("你好");
    expect(text).toContain('name="file%221"; filename="a.bin"');
    expect(text).toContain("Content-Type: application/octet-stream");
    expect(text.endsWith("--BOUND--\r\n")).toBe(true);

    const marker = new TextEncoder().encode("\r\n\r\n");
    const body = built.body;
    const fileHeader = indexOfBytes(body, new TextEncoder().encode('filename="a.bin"'), 0);
    expect(fileHeader).toBeGreaterThan(0);
    const headerEnd = indexOfBytes(body, marker, fileHeader);
    expect(headerEnd).toBeGreaterThan(0);
    const fileBytes = body.slice(headerEnd + marker.length, headerEnd + marker.length + binary.length);
    expect(Array.from(fileBytes)).toEqual(Array.from(binary));
  });

  it("内容含 boundary 时拒绝固定 boundary", () => {
    expect(() => buildMultipart([{ name: "a", data: "xxBOUNDyy" }], "BOUND")).toThrow(
      /boundary/,
    );
  });
});

describe("withMultipartContentType", () => {
  it("覆盖用户手写的 Content-Type，保留 boundary", () => {
    const headers = withMultipartContentType(
      {
        Accept: "application/json",
        "content-type": "multipart/form-data",
        "Content-Type": "text/plain",
      },
      "multipart/form-data; boundary=BOUND",
    );
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("multipart/form-data; boundary=BOUND");
    expect(headers["content-type"]).toBeUndefined();
  });
});

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  for (let i = from; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}
