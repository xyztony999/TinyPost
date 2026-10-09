import { describe, expect, it } from "vitest";
import { buildCurl, parseCurl } from "./curl";

describe("parseCurl", () => {
  it("解析方法、URL、请求头、body 和续行", () => {
    const parsed = parseCurl(`curl -X POST 'https://example.com/v1' \\
  -H 'Accept: application/json' \\
  -H "X-Name: a\\"b" \\
  --data-raw '{"a":1}'`);
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://example.com/v1");
    expect(parsed.headers.map((header) => [header.key, header.value])).toEqual([
      ["Accept", "application/json"],
      ["X-Name", 'a"b'],
      ["Content-Type", "application/x-www-form-urlencoded"],
    ]);
    expect(parsed.body).toBe('{"a":1}');
    expect(parsed.bodyMode).toBe("raw");
  });

  it("支持 --url、单引号转义和 -F 文件字段", () => {
    const parsed = parseCurl(
      "curl --url https://up.example/file -u 'ann:p'\\''w' -F 'title=hi' -F 'file=@\"C:/a b.txt\";type=text/plain;filename=b.txt'",
    );
    expect(parsed.url).toBe("https://up.example/file");
    expect(parsed.method).toBe("POST");
    expect(parsed.auth).toMatchObject({ type: "basic", basicUsername: "ann", basicPassword: "p'w" });
    expect(parsed.bodyMode).toBe("form-data");
    expect(parsed.formFields).toEqual([
      { key: "title", type: "text", value: "hi", enabled: true },
      {
        key: "file",
        type: "file",
        value: "C:/a b.txt",
        fileName: "b.txt",
        contentType: "text/plain",
        enabled: true,
      },
    ]);
  });

  it("无 -X 的 -d 默认为 POST，-G 把数据放到查询串", () => {
    expect(parseCurl("curl https://example.com -d a=1").method).toBe("POST");
    const got = parseCurl("curl -G https://example.com/search -d q=tinypost");
    expect(got.method).toBe("GET");
    expect(got.url).toBe("https://example.com/search?q=tinypost");
    expect(got.body).toBe("");
  });

  it("无效命令给出明确错误", () => {
    expect(() => parseCurl("wget https://example.com")).toThrow(/curl/);
    expect(() => parseCurl("curl -X POST")).toThrow(/没有 URL/);
    expect(() => parseCurl("curl https://example.com -d a=1 -F b=2")).toThrow(/不能同时使用/);
    expect(() => parseCurl("curl https://example.com --unknown")).toThrow(/不支持的 curl 参数/);
    expect(() => parseCurl("curl 'https://example.com")).toThrow(/单引号未闭合/);
  });
});

describe("buildCurl", () => {
  it("导出替换后的请求，multipart 使用 -F", () => {
    const curl = buildCurl({
      method: "POST",
      url: "https://example.com/up",
      headers: [
        { key: "Accept", value: "application/json" },
        { key: "Content-Type", value: "multipart/form-data; boundary=x" },
      ],
      bodyMode: "form-data",
      formFields: [
        { key: "title", type: "text", value: "a'b" },
        { key: "file", type: "file", value: "D:\\a.txt", fileName: "a.txt", contentType: "text/plain" },
      ],
    });
    expect(curl).toContain("curl -X POST 'https://example.com/up'");
    expect(curl).toContain("-H 'Accept: application/json'");
    expect(curl).not.toContain("multipart/form-data");
    expect(curl).toContain("-F 'title=a'\\''b'");
    expect(curl).toContain("-F 'file=@D:\\a.txt;filename=a.txt;type=text/plain'");
  });

  it("GET 不带 body", () => {
    const curl = buildCurl({
      method: "GET",
      url: "https://example.com",
      headers: [],
      body: "ignored",
    });
    expect(curl).toBe("curl -X GET 'https://example.com'");
  });
});
