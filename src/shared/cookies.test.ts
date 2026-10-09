import { describe, expect, it } from "vitest";
import { cookieHeaderValue, emptyCookieJar, mergeSetCookies, parseCookieJar } from "./cookies";

const now = Date.parse("2026-01-01T00:00:00Z");

describe("cookies", () => {
  it("同名同路径覆盖，过期的丢掉，Secure 不发给 http", () => {
    const jar = mergeSetCookies(
      emptyCookieJar(),
      [
        { url: "https://example.com/login", line: "sid=old; Path=/" },
        { url: "https://example.com/login", line: "sid=new; Path=/; Secure" },
        { url: "https://example.com/login", line: "gone=1; Path=/; Max-Age=0" },
      ],
      now,
    );
    expect(jar.items.map((item) => item.name)).toEqual(["sid"]);
    expect(jar.items[0]?.value).toBe("new");
    expect(cookieHeaderValue(jar, "https://example.com/api", now)).toBe("sid=new");
    expect(cookieHeaderValue(jar, "http://example.com/api", now)).toBe("");
  });

  it("按 Path 匹配，Domain 覆盖子域", () => {
    const jar = mergeSetCookies(
      emptyCookieJar(),
      [
        { url: "https://example.com/app/login", line: "a=1; Path=/admin" },
        { url: "https://example.com/app/login", line: "b=2; Domain=example.com; Path=/" },
      ],
      now,
    );
    expect(cookieHeaderValue(jar, "https://example.com/admin/users", now)).toBe("a=1; b=2");
    expect(cookieHeaderValue(jar, "https://api.example.com/health", now)).toBe("b=2");
    expect(cookieHeaderValue(jar, "https://other.test/admin", now)).toBe("");
  });

  it("关闭开关后不再合并，损坏 JSON 回到空罐", () => {
    const off = mergeSetCookies(
      { enabled: false, items: [] },
      [{ url: "https://example.com/", line: "sid=1" }],
      now,
    );
    expect(off.items).toEqual([]);
    expect(parseCookieJar("{")).toEqual(emptyCookieJar());
  });
});