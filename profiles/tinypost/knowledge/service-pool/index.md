# IPC 服务池

> 跨模块可复用的 IPC 能力清单（v0.2.0 实测，来源 src/main/ipc.ts）。新增功能优先复用本池，避免新增语义重复通道。

## http 域（请求执行）

| 通道 | 语义 | 备注 |
|------|------|------|
| `http:send` | 发送一次 HTTP 请求（主进程 Node http/https） | 入参 HttpRequestPayload，返回 HttpResponsePayload；支持 multipart/urlencoded/tls/insecure/timeout/followRedirects |
| `http:cancel` | 取消进行中的请求 | 按 requestId |

## db 域（持久化）

| 通道 | 语义 | 消费模块 |
|------|------|---------|
| `db:saveHistory` / `db:listHistory` / `db:clearHistory` | 历史写入/倒序列出/清空 | 历史记录 |
| `db:ensureDefaultEnvironment` / `db:listEnvironments` / `db:setActiveEnvironment` / `db:upsertEnvironment` / `db:deleteEnvironment` | 环境全生命周期 + 激活切换 | 环境与变量、会话保持 |
| `db:listCollections` / `db:createCollection` / `db:renameCollection` / `db:deleteCollection` | 集合增删改名 | 集合管理 |
| `db:listSavedRequests` / `db:saveRequest` / `db:renameSavedRequest` / `db:deleteSavedRequest` / `db:reorderSavedRequests` | 请求项 CRUD + 拖拽排序落库 | 集合管理 |
| `db:getSettings` / `db:saveSettings` | 应用设置读写 | 应用设置 |

## dialog 域（系统能力）

| 通道 | 语义 | 消费模块 |
|------|------|---------|
| `dialog:saveResponse` / `dialog:saveBinaryResponse` | 文本响应另存 / 二进制响应按 requestId 落盘 | 请求构建与发送（二进制/大响应） |
| `dialog:pickFile` | 选择文件并返回路径（不读内容；内容装载在 http:send 的 multipart 处理） | 导入导出、multipart 文件字段、TLS 证书 |
| `dialog:saveText` | 通用文本导出（集合/环境导出 JSON） | 导入导出 |
| `dialog:backupDatabase` / `dialog:restoreDatabase` | 整库备份/恢复（便携单文件） | 导入导出 |
