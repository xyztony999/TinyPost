export interface TextSpan {
  from: number;
  to: number;
}

export interface TextPos {
  line: number;
  ch: number;
}

export function findTextSpans(text: string, query: string): TextSpan[] {
  if (!query) return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const spans: TextSpan[] = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    spans.push({ from: found, to: found + needle.length });
    cursor = found + needle.length;
  }
  return spans;
}

export function indexToPos(text: string, offset: number): TextPos {
  let line = 0;
  let lineStart = 0;
  const end = Math.max(0, Math.min(offset, text.length));
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, ch: end - lineStart };
}
