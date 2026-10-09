import { describe, expect, it } from "vitest";
import { parsePostmanCollection, parsePostmanEnvironment } from "./postmanImport";

describe("parsePostmanCollection", () => {
  it("导入嵌套请求、认证和变量", () => {
    const result = parsePostmanCollection(
      JSON.stringify({
        info: {
          name: "Demo",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
        variable: [{ key: "baseUrl", value: "http://localhost" }],
        item: [
          {
            name: "用户",
            item: [
              {
                name: "登录",
                request: {
                  method: "post",
                  header: [
                    { key: "Accept", value: "application/json" },
                    { key: "X-Skip", value: "0", disabled: true },
                  ],
                  body: { mode: "raw", raw: "{\"a\":1}" },
                  url: "{{baseUrl}}/login",
                },
              },
            ],
          },
        ],
      }),
    );
    expect(result.collectionName).toBe("Demo");
    expect(result.variables).toEqual([{ key: "baseUrl", value: "http://localhost" }]);
    expect(result.requests[0]).toMatchObject({
      name: "用户 / 登录",
      method: "POST",
      url: "{{baseUrl}}/login",
      body: "{\"a\":1}",
      auth: { type: "bearer", bearerToken: "{{token}}" },
    });
    expect(result.requests[0]?.headers[1]?.enabled).toBe(false);
  });

  it("拒绝环境和空集合", () => {
    expect(() =>
      parsePostmanCollection(
        JSON.stringify({
          info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/environment.json" },
        }),
      ),
    ).toThrow(/Environment/);
    expect(() =>
      parsePostmanCollection(JSON.stringify({ info: { name: "空" }, item: [] })),
    ).toThrow(/没有可导入的请求/);
  });
});

describe("parsePostmanEnvironment", () => {
  it("读取 values，并跳过未启用项", () => {
    const result = parsePostmanEnvironment(
      JSON.stringify({
        name: "本地",
        values: [
          { key: "baseUrl", value: "http://127.0.0.1", enabled: true },
          { key: "token", value: "secret", enabled: false },
          { key: "empty", value: "" },
        ],
      }),
    );
    expect(result).toEqual({
      name: "本地",
      variables: [
        { key: "baseUrl", value: "http://127.0.0.1" },
        { key: "empty", value: "" },
      ],
    });
  });

  it("拒绝集合文件", () => {
    expect(() =>
      parsePostmanEnvironment(
        JSON.stringify({
          info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
          item: [],
        }),
      ),
    ).toThrow(/Collection/);
  });
});
