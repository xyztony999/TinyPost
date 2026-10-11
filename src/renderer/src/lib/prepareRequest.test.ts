import { describe, expect, it } from "vitest";
import { emptyCookieJar } from "@shared/cookies";
import { defaultRequestMeta } from "@shared/requestMeta";
import { defaultAuth } from "@shared/types";
import { prepareHttpRequest } from "./prepareRequest";

const base = {
  method: "POST",
  url: "{{baseUrl}}/login",
  headers: [{ key: "Accept", value: "application/json", enabled: true }],
  body: "",
  auth: defaultAuth(),
  variables: { baseUrl: "http://127.0.0.1:8080" },
  jar: emptyCookieJar(),
  insecure: false,
  timeoutMs: 1000,
  followRedirects: true,
  requestId: "test",
};

describe("prepareHttpRequest", () => {
  it("替换变量、编码 urlencoded，并带上 Cookie", () => {
    const jar = {
      enabled: true,
      items: [
        {
          name: "sid",
          value: "abc",
          domain: "127.0.0.1",
          path: "/",
          expires: null,
          secure: false,
          hostOnly: true,
        },
      ],
    };
    const prepared = prepareHttpRequest({
      ...base,
      jar,
      meta: {
        ...defaultRequestMeta(),
        bodyMode: "urlencoded",
        urlencodedFields: [{ key: "user", value: "{{name}}", enabled: true }],
      },
      variables: { ...base.variables, name: "ann" },
    });
    expect(prepared.error).toBeNull();
    expect(prepared.payload?.url).toBe("http://127.0.0.1:8080/login");
    expect(prepared.payload?.body).toBe("user=ann");
    expect(prepared.payload?.urlencoded).toBe(true);
    expect(prepared.payload?.headers.some((header) => header.key === "Cookie" && header.value === "sid=abc")).toBe(
      true,
    );
  });

  it("手写 Cookie 优先，缺文件时不发送", () => {
    const withCookie = prepareHttpRequest({
      ...base,
      headers: [{ key: "Cookie", value: "hand=1", enabled: true }],
      jar: {
        enabled: true,
        items: [
          {
            name: "sid",
            value: "abc",
            domain: "127.0.0.1",
            path: "/",
            expires: null,
            secure: false,
            hostOnly: true,
          },
        ],
      },
      meta: defaultRequestMeta(),
    });
    expect(withCookie.payload?.headers.filter((header) => header.key.toLowerCase() === "cookie")).toEqual([
      { key: "Cookie", value: "hand=1", enabled: true },
    ]);

    const missing = prepareHttpRequest({
      ...base,
      meta: {
        ...defaultRequestMeta(),
        bodyMode: "form-data",
        formFields: [{ key: "file", type: "file", value: "", enabled: true }],
      },
    });
    expect(missing.payload).toBeNull();
    expect(missing.error).toMatch(/选择文件/);
  });
});
