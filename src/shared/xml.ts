type XmlToken =
  | { kind: "meta"; raw: string }
  | { kind: "comment" | "cdata"; raw: string }
  | { kind: "text"; text: string }
  | { kind: "open"; raw: string; name: string; selfClosing: boolean }
  | { kind: "close"; raw: string; name: string };

function readTag(input: string, start: number): { raw: string; next: number } {
  let quote: '"' | "'" | null = null;
  for (let i = start + 1; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return { raw: input.slice(start, i + 1), next: i + 1 };
  }
  if (quote) throw new Error("XML 标签引号未闭合");
  throw new Error("XML 标签未闭合");
}

function tagName(raw: string): string {
  const name = raw.split(/\s+/)[0] || "";
  if (!/^[:A-Za-z_][\w:.-]*$/.test(name)) throw new Error(`无法识别的 XML 标签：${raw}`);
  return name;
}

function classifyTag(raw: string): XmlToken {
  if (raw.startsWith("<?") || raw.startsWith("<!")) return { kind: "meta", raw };
  if (raw.startsWith("</")) {
    const name = raw.slice(2, -1).trim();
    if (!name) throw new Error("XML 结束标签缺少名称");
    if (!/^[:A-Za-z_][\w:.-]*$/.test(name)) throw new Error(`无法识别的 XML 标签：${raw}`);
    return { kind: "close", raw, name };
  }
  const selfClosing = /\/\s*>$/.test(raw);
  const inner = raw.slice(1, selfClosing ? raw.search(/\/\s*>$/) : -1).trim();
  return { kind: "open", raw, name: tagName(inner), selfClosing };
}

function tokenizeXml(input: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] !== "<") {
      const next = input.indexOf("<", i);
      const end = next < 0 ? input.length : next;
      const text = input.slice(i, end).trim();
      if (text) tokens.push({ kind: "text", text });
      i = end;
      continue;
    }
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      if (end < 0) throw new Error("XML 注释未闭合");
      tokens.push({ kind: "comment", raw: input.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", i)) {
      const end = input.indexOf("]]>", i + 9);
      if (end < 0) throw new Error("XML CDATA 未闭合");
      tokens.push({ kind: "cdata", raw: input.slice(i, end + 3) });
      i = end + 3;
      continue;
    }
    const tag = readTag(input, i);
    tokens.push(classifyTag(tag.raw));
    i = tag.next;
  }
  return tokens;
}

export function looksLikeXml(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">");
}

export function formatXml(input: string): string {
  const source = input.trim();
  if (!source) throw new Error("XML 为空");
  const tokens = tokenizeXml(source);
  if (tokens.length === 0) throw new Error("XML 为空");

  const lines: string[] = [];
  const stack: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const indent = "  ".repeat(stack.length);
    if (token.kind === "open") {
      const text = tokens[i + 1];
      const close = tokens[i + 2];
      if (
        text?.kind === "text" &&
        close?.kind === "close" &&
        close.name === token.name &&
        text.text.length <= 80 &&
        !text.text.includes("\n")
      ) {
        lines.push(`${indent}${token.raw.replace(/>$/, "")}>${text.text}${close.raw}`);
        i += 3;
        continue;
      }
      lines.push(`${indent}${token.raw}`);
      if (!token.selfClosing) stack.push(token.name);
      i += 1;
      continue;
    }
    if (token.kind === "close") {
      const expected = stack.pop();
      if (expected !== token.name) {
        throw new Error(`XML 标签不匹配：期望 </${expected || "?"}>，实际 ${token.raw}`);
      }
      lines.push(`${"  ".repeat(stack.length)}${token.raw}`);
      i += 1;
      continue;
    }
    lines.push(`${indent}${"raw" in token ? token.raw : token.text}`);
    i += 1;
  }
  if (stack.length > 0) throw new Error(`XML 标签未闭合：<${stack[stack.length - 1]}>`);
  return lines.join("\n");
}
