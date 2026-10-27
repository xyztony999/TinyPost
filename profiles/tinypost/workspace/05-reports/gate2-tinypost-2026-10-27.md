# Gate 2 验证报告 — 代码→交付门控 — tinypost

| 属性 | 值 |
|------|-----|
| 扫描时间 | 2026-10-27 |
| 扫描路径 | src/（main + preload + renderer + shared）、package.json、profiles/tinypost/ |
| 检查链 | 引擎机制（编译/测试/对齐）⊕ React 栈规则（.claude/rules/frontend-rules.md，项目预置）⊕ 业务规则 TP-BR-01~10 |
| 栈清单说明 | BE-xx/FE-xx 属激活栈执行清单——本项目无激活栈，不适用；对齐检查（AL）按 IPC 契约形态执行 |
| **总体判定** | **PASS（附 3 项披露，均为 notCovered/note，非违规）** |

## 1. 业务规则扫描（TP-BR-01~10）

| # | 规则 | 结果 | 证据 |
|---|------|------|------|
| TP-BR-01 | 离线优先零外发 | ✅ | grep telemetry/analytics/sentry/trackEvent/autoUpdater = **0 命中**；出网代码仅 src/main/http.ts（用户显式发起的目标请求）；无 autoUpdater |
| TP-BR-02 | 敏感数据不出本机 | ✅ | 主进程+preload console.* = **0 处**（token/cookie 无日志泄漏面）；文件写入仅 3 类：SQLite 落盘（db.ts:33）、用户另存路径（ipc.ts:151/162）、无其他出口 |
| TP-BR-03 | 双平台等价 | ✅ | 依赖全为纯 JS/WASM（sql.js/codemirror/dnd-kit/react，零原生模块）；process.platform 仅 2 处且为 darwin 窗口生命周期（src/main/index.ts:22/84），无功能级平台分支 |
| TP-BR-04 | 环境互斥 | ✅ | setActiveEnvironment 事务内先清后置（db.ts，本轮修复）；verify-crosscheck #3 |
| TP-BR-05 | Cookie 按环境隔离 | ✅ | 罐随环境存取（App.tsx:618/764 parseCookieJar(env.cookies)），合并经 advanceEnvironment/mergeSetCookies |
| TP-BR-06 | 集合运行语义 | ✅ | 按 compareSavedRequestOrder 串行 + runEnabled 过滤（App.tsx:731-738）+ 非 2xx/二进制停止（:861）；失败语义已全链记载（本轮文档修复） |
| TP-BR-07 | 变量渲染 | ✅ | substituteVars 未定义变量原样保留 `{{key}}`（vars.ts:49-54）；渲染发生在发出前（prepareRequest） |
| TP-BR-08 | insecure 默认关+可见 | ✅ | DEFAULT_SETTINGS.insecure=false（types.ts:97）+ 常驻警示条（App.tsx，本轮新增）；verify-crosscheck #9 |
| TP-BR-09 | 二进制不进文本管线 | ✅ | http.ts binary 标记 + ResponseView 二进制说明卡 + saveBinaryResponse 落盘；历史仅存说明注记（binaryHistoryNote） |
| TP-BR-10 | 物理删除 | ✅ | clearHistory=DELETE 全表、集合删除级联（事务内，本轮修复）；无软删残留 |

## 2. React 栈规则（frontend-rules.md R1-R4，项目预置）

| # | 规则 | 结果 | 证据 |
|---|------|------|------|
| R1 | typecheck 必过 | ✅ | `npm run typecheck` 通过（CI 同款）；lint：仓库未配置 lint script（note，非违规） |
| R2 | 禁止组件内硬编码地址/密钥 | ✅ | 组件无密钥；默认 URL 走 `{{baseUrl}}` 变量；`http://127.0.0.1:8080` 仅为默认环境**数据值**（用户可在 UI 改），非代码配置 |
| R3 | 异步两态反馈 | ✅ | 发送中 spinner + elapsed、error-box、toast（2.6s）；运行面板逐步反馈 |
| R4 | 暗色默认适配 | ✅/note | 页面 chrome 跟随系统（prefers-color-scheme）；CodeEditor 固定暗色主题——已知限制，已在 PageSpec §8 如实标注 |

## 3. 引擎机制与接口对齐

| 项 | 结果 | 证据 |
|----|------|------|
| 编译必过 | ✅ | typecheck node+web 双通过 |
| 测试必跑 | ✅ | vitest 55/55（16 文件） |
| E2E 必补 | ⬚ notCovered | 仓库无 E2E 基建（无 Playwright 等依赖）；引入属新依赖决策，未擅动 |
| AL-001/002 对齐（IPC 版） | ✅ | api 文档 27 通道 ↔ ipc.ts 一一对应（缺失 0/多余 0）；PageSpec 21 Action/26 通道引用全部真实 |
| AL-004 枚举一致 | ✅ | HttpMethod/AuthType/BodyMode/RunEnabledFlag 文档↔types.ts 一致 |
| AL-005 错误可识别 | ✅ | 错误为用户可读中文消息，UI error-box/toast 直呈；对话框取消非错误（null/false） |
| 覆盖率 | ⬚ notCovered | 未安装 coverage provider（@vitest/coverage-v8 属新依赖，未擅动）；现有 55 用例覆盖 shared 纯函数与 lib 逻辑 |

## 4. 判定与披露

**PASS**——CRITICAL 层（业务红线 TP-BR-01/02/03 + 机制编译/测试/对齐）全部通过。

披露（不阻塞）：
1. E2E 与覆盖率工具未配置（需新增依赖，留待用户决策）
2. CodeEditor 固定暗色主题（PageSpec 已标注的已知限制）
3. lint 未配置

## 交付物

- 代码：src/（本轮修复 8 项，见 gate1-tinypost-2026-10-27-v2.md）
- 设计档案：profiles/tinypost/（D0-D4 全部 v1.1 + 复核报告 + Gate1/Gate2 报告 + verify-crosscheck.mjs）
- 待跟进：W-1 UI 形态新需求（用户未勾选，未实现）；git 提交由用户执行
