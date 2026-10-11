import { describe, expect, it } from "vitest";
import { emptyCookieJar } from "@shared/cookies";
import { advanceEnvironment, runSummary, type RunReport } from "./collectionRun";

describe("advanceEnvironment", () => {
  it("2xx 时提取变量并合并 Cookie，非 2xx 只合并 Cookie 并停止", () => {
    const ok = advanceEnvironment({
      variables: [{ key: "token", value: "" }],
      jar: emptyCookieJar(),
      status: 200,
      body: JSON.stringify({ data: { token: "abc" } }),
      binary: false,
      setCookies: [{ url: "http://127.0.0.1/login", line: "sid=1; Path=/" }],
      extractors: [{ path: "$.data.token", variable: "token", enabled: true }],
    });
    expect(ok.proceed).toBe(true);
    expect(ok.variables).toEqual([{ key: "token", value: "abc" }]);
    expect(ok.jar.items[0]?.name).toBe("sid");

    const denied = advanceEnvironment({
      variables: [{ key: "token", value: "keep" }],
      jar: emptyCookieJar(),
      status: 401,
      body: JSON.stringify({ data: { token: "nope" } }),
      binary: false,
      setCookies: [{ url: "http://127.0.0.1/login", line: "sid=2; Path=/" }],
      extractors: [{ path: "$.data.token", variable: "token", enabled: true }],
    });
    expect(denied.proceed).toBe(false);
    expect(denied.variables).toEqual([{ key: "token", value: "keep" }]);
    expect(denied.jar.items[0]?.value).toBe("2");
  });

  it("二进制成功响应不提取正文", () => {
    const next = advanceEnvironment({
      variables: [],
      jar: emptyCookieJar(),
      status: 200,
      body: "",
      binary: true,
      extractors: [{ path: "$.token", variable: "token", enabled: true }],
    });
    expect(next.proceed).toBe(true);
    expect(next.variables).toEqual([]);
    expect(next.hits).toEqual([]);
  });
});

describe("runSummary", () => {
  const report: RunReport = {
    collectionId: 1,
    collectionName: "登录",
    running: false,
    cancelled: false,
    steps: [
      {
        savedId: 1,
        name: "取令牌",
        method: "POST",
        status: 500,
        durationMs: 12,
        error: null,
        stopped: true,
        binary: false,
      },
    ],
  };

  it("标出停止的那一条", () => {
    expect(runSummary(report)).toBe("已停止：取令牌（500）");
    expect(runSummary({ ...report, cancelled: true, running: false })).toBe("已取消「登录」");
  });
});
