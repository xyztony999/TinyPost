import { describe, expect, it } from "vitest";
import { formatXml, looksLikeXml } from "./xml";

describe("formatXml", () => {
  it("缩进嵌套标签，短文本保持一行", () => {
    expect(formatXml('<?xml version="1.0"?><root><child id="1">hi</child><empty/></root>')).toBe(
      [
        '<?xml version="1.0"?>',
        "<root>",
        '  <child id="1">hi</child>',
        "  <empty/>",
        "</root>",
      ].join("\n"),
    );
  });

  it("标签不匹配或未闭合时报错", () => {
    expect(() => formatXml("<a></b>")).toThrow(/标签不匹配/);
    expect(() => formatXml("<a><b></b>")).toThrow(/未闭合/);
    expect(() => formatXml('<a title="oops></a>')).toThrow(/引号未闭合/);
  });

  it("识别看起来像 XML 的文本", () => {
    expect(looksLikeXml("  <root/>  ")).toBe(true);
    expect(looksLikeXml('{"a":1}')).toBe(false);
  });
});
