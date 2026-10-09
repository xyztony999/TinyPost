import { describe, expect, it } from "vitest";
import { encodeUrlEncoded, parseUrlEncodedBody, withUrlEncodedContentType } from "./urlencoded";

describe("urlencoded", () => {
  it("把空格编成加号，并覆盖 Content-Type", () => {
    expect(encodeUrlEncoded([{ key: "user", value: "a b" }, { key: "n", value: "1" }])).toBe(
      "user=a+b&n=1",
    );
    expect(
      withUrlEncodedContentType({
        Accept: "application/json",
        "Content-Type": "text/plain",
      }),
    ).toEqual({
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("只把 key=value 正文还原成字段", () => {
    expect(parseUrlEncodedBody("a=1&b=hello+world")).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "hello world", enabled: true },
    ]);
    expect(parseUrlEncodedBody('{"a":1}')).toBeNull();
    expect(parseUrlEncodedBody("plain")).toBeNull();
  });
});
