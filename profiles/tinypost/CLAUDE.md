# TinyPost 业务知识注入

> 本文件由 `/profile use tinypost` 挂载到根 CLAUDE.md「Profile 绑定」区。

## 一句话定位

轻量本地 API 客户端：不上云、可内网离线使用，数据存本机 SQLite，面向 Windows x64 与银河麒麟桌面 V10 SP3（arm64）双平台。

## 技术栈事实

- 桌面壳 Electron 32 + electron-vite + electron-builder；前端 React 19 + TypeScript；编辑器 CodeMirror 5；拖拽 @dnd-kit
- 存储 sql.js（SQLite 编译为 WASM，无原生模块）；HTTP 由主进程 Node http/https 发出
- 无后端服务、无云同步——「API」指被调试的目标系统，应用自身的接口面是 Electron IPC（`http:` / `db:` / `dialog:` 三组通道）

## 知识库入口

- 业务概念与模块清单：knowledge/business-concepts/index.md
- 设计决策（含理由）：knowledge/design-decisions/index.md
- IPC 服务池：knowledge/service-pool/index.md
- 架构分层选择：knowledge/architecture-choices/index.md

## 槽位速查

| 槽位 | 值 |
|------|-----|
| {ws.architecture} | profiles/tinypost/workspace/00-architecture |
| {ws.prd} | profiles/tinypost/workspace/02-detailed/prd |
| {ws.api} | profiles/tinypost/workspace/02-detailed/api |
| {ws.interaction} | profiles/tinypost/workspace/02-detailed/interaction |
| {ws.reports} | profiles/tinypost/workspace/05-reports |
| {ws.index} | profiles/tinypost/workspace/INDEX.md |
| {conv.enum_pool} | profiles/tinypost/workspace/01-solution/common-spec/04-business-enum.md |
| {conv.common_enums} | profiles/tinypost/workspace/01-solution/common-spec/03-common-enums.md |
| {conv.select_pool} | profiles/tinypost/workspace/01-solution/common-spec/05-select-service-pool.md |
