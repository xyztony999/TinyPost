import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import CodeMirror from "codemirror";
import { findTextSpans, indexToPos } from "@shared/textSearch";
import type { BodyLanguage } from "../lib/format";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/xml/xml";

export interface CodeEditorHandle {
  search: (query: string, direction: "next" | "prev" | "refresh") => { current: number; total: number };
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language: BodyLanguage;
  variant?: "body" | "response";
}

function cmMode(language: BodyLanguage): CodeMirror.EditorConfiguration["mode"] {
  if (language === "json") return { name: "javascript", json: true };
  if (language === "xml") return "xml";
  return null;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, readOnly = false, language, variant = "body" },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cmRef = useRef<CodeMirror.Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const marksRef = useRef<CodeMirror.TextMarker[]>([]);
  const queryRef = useRef("");
  const indexRef = useRef(-1);
  onChangeRef.current = onChange;

  function clearMarks() {
    for (const mark of marksRef.current) mark.clear();
    marksRef.current = [];
  }

  useImperativeHandle(ref, () => ({
    search(query: string, direction: "next" | "prev" | "refresh") {
      const cm = cmRef.current;
      if (!cm) return { current: 0, total: 0 };
      clearMarks();
      if (!query) {
        queryRef.current = "";
        indexRef.current = -1;
        return { current: 0, total: 0 };
      }
      const text = cm.getValue();
      const matches = findTextSpans(text, query).map((span) => ({
        from: indexToPos(text, span.from),
        to: indexToPos(text, span.to),
      }));
      if (!matches.length) {
        queryRef.current = query;
        indexRef.current = -1;
        return { current: 0, total: 0 };
      }
      if (query !== queryRef.current || direction === "refresh") {
        queryRef.current = query;
        indexRef.current = 0;
      } else if (direction === "next") {
        indexRef.current = (indexRef.current + 1) % matches.length;
      } else {
        indexRef.current = (indexRef.current - 1 + matches.length) % matches.length;
      }
      matches.forEach((match, matchIndex) => {
        marksRef.current.push(
          cm.markText(match.from, match.to, {
            className: matchIndex === indexRef.current ? "cm-search-hit-active" : "cm-search-hit",
          }),
        );
      });
      cm.scrollIntoView(matches[indexRef.current].from, 40);
      return { current: indexRef.current + 1, total: matches.length };
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const cm = CodeMirror(host, {
      value,
      mode: cmMode(language),
      theme: "material-darker",
      readOnly,
      lineWrapping: true,
      lineNumbers: false,
    });
    cmRef.current = cm;
    cm.on("change", () => {
      onChangeRef.current?.(cm.getValue());
    });
    const refresh = () => {
      if (variant === "response") cm.setSize("100%", "100%");
      cm.refresh();
    };
    const frame = requestAnimationFrame(refresh);
    const observer = new ResizeObserver(refresh);
    observer.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearMarks();
      cm.getWrapperElement().remove();
      cmRef.current = null;
    };
    // Mount once; later effects sync value, mode, and readOnly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cm = cmRef.current;
    if (!cm || cm.getValue() === value) return;
    const cursor = cm.getCursor();
    cm.setValue(value);
    if (!readOnly) {
      cm.setCursor({ line: Math.min(cursor.line, cm.lineCount() - 1), ch: cursor.ch });
    }
  }, [value, readOnly]);

  useEffect(() => {
    cmRef.current?.setOption("mode", cmMode(language));
  }, [language]);

  useEffect(() => {
    cmRef.current?.setOption("readOnly", readOnly);
  }, [readOnly]);

  return <div ref={hostRef} className={variant === "response" ? "code-editor response-editor" : "code-editor"} />;
});
