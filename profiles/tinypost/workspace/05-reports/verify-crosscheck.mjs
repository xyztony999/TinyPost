// Gate 交叉核对脚本（随仓库留存，可复现）—— node profiles/tinypost/workspace/05-reports/verify-crosscheck.mjs
// 核对：IPC 通道/表名↔api 文档、事务化、守卫、reorder 校验、confirm 矩阵、警示条、PageSpec 通道引用
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
  if (!cond) process.exitCode = 1;
};

const ipc = read("src/main/ipc.ts");
const db = read("src/main/db.ts");
const http = read("src/main/http.ts");
const app = read("src/renderer/src/App.tsx");
const doc = read("profiles/tinypost/workspace/02-detailed/api/api-tinypost.md");
const spec = read("profiles/tinypost/workspace/02-detailed/interaction/api-debugger/tinypost/tinypost.md");

// 1) 通道一致性
const ch = [...ipc.matchAll(/ipcMain\.handle\(\s*"([\w:]+)"/g)].map((m) => m[1]);
const docCh = [...new Set([...doc.matchAll(/\b(?:http|db|dialog):[A-Za-z]+/g)].map((m) => m[0]))];
ok("通道数=27", ch.length === 27, String(ch.length));
ok("api 文档无通道缺失", ch.every((c) => docCh.includes(c)));
ok("api 文档无未知通道", docCh.every((c) => ch.includes(c)));

// 2) 表
const tables = [...db.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
ok("5 张表均在文档", tables.length === 5 && tables.every((t) => doc.includes(t)));

// 3) 事务化（INV-01/04）
ok("setActiveEnvironment 事务化", /setActiveEnvironment[\s\S]{0,80}withTransaction/.test(db));
ok("deleteCollection 事务化", /deleteCollection[\s\S]{0,120}withTransaction/.test(db));

// 4) deleteEnvironment 守卫
ok("deleteEnvironment 保底守卫", /deleteEnvironment[\s\S]{0,120}至少保留一个环境/.test(db));

// 5) reorder 一致性校验（INV-02）
ok("reorder 校验 orderedIds 集合一致", /orderedIds 与集合内请求项不一致/.test(db));

// 6) 名称校验（通道级）
ok("createCollection/renameCollection 非空校验", (db.match(/集合名称不能为空/g) || []).length >= 2);
ok("renameCollection 目标存在校验", /目标集合不存在/.test(db));

// 7) http:cancel 无参取消最近在途
ok("httpCancel 支持无参取最近", /requestId \|\| \[\.\.\.inflight\.keys\(\)\]\.at\(-1\)/.test(http));

// 8) 破坏性操作确认矩阵（清空历史/删请求/删集合/恢复）
const confirms = (app.match(/window\.confirm/g) || []).length;
ok("App.tsx confirm≥5 处", confirms >= 5, String(confirms));
ok("清空历史有确认", /清空全部历史记录？/.test(app));
ok("删除请求有确认", /删除请求「/.test(app));

// 9) insecure 警示条（TP-BR-08）
ok("insecure 警示条存在", app.includes("insecure-banner") && app.includes("TLS 证书校验已关闭"));
ok("警示条样式存在", read("src/renderer/src/App.css").includes(".insecure-banner"));

// 10) PageSpec Action 通道全部真实
const specCh = [...new Set([...spec.matchAll(/\b(?:http|db|dialog):[A-Za-z]+/g)].map((m) => m[0]))];
ok("PageSpec 无未知通道", specCh.every((c) => ch.includes(c)), `${specCh.length} 通道`);

// 11) 文档口径：默认环境名/返回类型
ok("默认环境名=本地", doc.includes("name=本地") && db.includes('"本地"'));
ok("createCollection 返回 number", doc.includes("| db:createCollection | name: string | number（新集合 id） |"));
ok("meta 契约 runEnabled", doc.includes("meta=`{runEnabled?: boolean, extractors?: ExtractRule[]") && read("src/shared/requestMeta.ts").includes("runEnabled: row.runEnabled === false ? false : true"));

// 12) 集合运行失败语义已记载（TP-BR-06）
const rules = read("profiles/tinypost/rules/tinypost-business-rules.md");
ok("TP-BR-06 失败语义", rules.includes("任一步非 2xx 或二进制响应即停止推进且不做提取"));

console.log(process.exitCode ? "\n结果：FAIL" : "\n结果：ALL PASS");
