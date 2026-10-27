# TinyPost IPC 契约设计（API 设计文档）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-10-27 |
| 覆盖模块 | tinypost |
| 接口形态 | Electron IPC（`ipcRenderer.invoke` → `ipcMain.handle`），**非 HTTP REST** |

> 适配说明：本项目无后端服务，应用自身的接口面 = 渲染进程与主进程之间的 IPC 契约。本文按 D3 模板组织，将「接口」实例化为 IPC 通道；无激活技术栈，故不引用栈级规约，规约以本档案 + shared/types.ts 为准。

## 1. 模块设计概述

### 1.1 业务背景及目标

内网/信创环境缺少离线 API 调试工具（详见 PRD §1）。本契约定义渲染进程（React UI）与主进程（Node：HTTP 传输 + SQLite 持久化 + 系统对话框）之间的全部交互接口，是 UI 与系统能力之间的唯一边界。

### 1.2 边界说明

| 边界 | 内容 |
|------|------|
| 做什么 | 定义 27 个 IPC 通道的入参/返回/异常/校验规则；定义 SQLite 5 表结构与不变量；定义枚举与公共约定 |
| 不做什么 | 不定义渲染进程内部组件结构（见 D4 PageSpec）；不定义与外部目标系统之间的 HTTP 协议细节（那是被调试对象）；不涉及打包与平台适配（工程层） |

### 1.3 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 通信机制 | contextBridge 白名单 IPC（非 nodeIntegration 直曝） | 最小暴露面（D-06） |
| 通道命名 | `域:动作` 两段式（http:/db:/dialog:） | 语义分组，便于审计（D-06） |
| 调用风格 | 全部 request/response（invoke/handle），无事件推送 | 调试工具无服务端推送诉求；取消以 requestId 显式表达 |
| 持久化 | 主进程独占 SQLite（sql.js WASM） | 单写者避免竞争（D-02） |
| 管理模式 | **全自管（SELF_MANAGED）**：无外部系统同步数据，混合模式退化为纯自管 | 单机工具（TP-BR-01） |
| 序列化 | 复杂结构（headers/auth/meta 等）以 JSON 列存储 | schema 演进靠 ensureColumn 增列（D-02） |

### 1.4 领域对象总览

见 [tinypost-domain-model.md](../prd/tinypost-domain-model.md)。角色标注：聚合根=集合/环境/历史条目；实体=请求项、Cookie 罐；值对象=认证/头/查询/表单字段/提取规则/变量/TLS 配置；子流程=请求执行、集合运行；过程数据七类。

### 1.5 上下文映射

| 本方上下文 | 对方上下文 | 关系 |
|-----------|-----------|------|
| 渲染进程（UI 编排） | 主进程（本契约 IPC） | 遵奉者：渲染层完全遵循本契约，不感知 SQL/Node 细节 |
| 主进程 | 外部目标系统（被调试 API） | 单向出站调用，载荷为过程数据，无模型侵入 |
| 渲染进程 | shared 纯函数层 | 共享内核：types.ts 与解析/渲染逻辑两侧共用 |

## 2. 跨聚合根设计

### 2.1 聚合根关系图

```
Collection（集合聚合）
   │ 1:N 请求项(实体, sort_order/skip)
   │ 被引用
   ▼
CollectionRun（子流程，编排）──提取回写──▶ Environment（环境聚合）
                                            │ 1:1 CookieJar/TlsConfig，1:N Variable
                                            │ 被请求执行读取
                                            ▼
RequestExecution（子流程）──快照──▶ HistoryEntry（历史聚合，不可变）
```

### 2.2 跨聚合根不变量

| # | 不变量 | 保证机制 |
|---|--------|---------|
| INV-01 | 全局至多一个 Environment.is_active=1 | setActiveEnvironment 事务内先清后置 |
| INV-02 | 集合内 sort_order 无重复且连续（重排原子） | reorderSavedRequests 单事务批量更新 |
| INV-03 | HistoryEntry 创建后任何字段不可变 | 仅 insert，无 update 通道 |
| INV-04 | 删除集合级联删除其请求项，不得残留孤儿 | deleteCollection 事务内两表删除 |
| INV-05 | 参与运行标记（runEnabled）/提取规则只存在于请求项 meta，运行时只读 | saveRequest 是唯一写入口 |

### 2.3 跨聚合根编排

| 编排 | 流程 | 一致性 |
|------|------|--------|
| 集合运行 | 读 Collection（顺序+跳过）→ 逐步：读 Environment 渲染/会话 → 执行 → 提取写回 Environment → 快照写 HistoryEntry | 步间最终一致（串行 UI 驱动，无并发写者）；中止保留已完成步 |
| 单请求发送 | 读 Environment/AppSettings → 执行 → Set-Cookie 写 Environment.cookies → 快照写 HistoryEntry | 同步顺序执行 |

## 3. 应用/基础设施层设计

### 3.1 接口规范

| 项 | 规范 |
|----|------|
| 通道格式 | `{domain}:{action}`，domain ∈ http / db / dialog |
| 调用方式 | `ipcRenderer.invoke(channel, ...args)` → Promise；preload 暴露白名单封装 |
| 返回格式 | 成功：业务值直返（无 Result 包装层，IPC 天然单调用方）；失败：Promise reject，`Error.message` 为用户可读错误（中文），主进程捕获异常后拒绝 |
| 取消语义 | 进行中操作以 `requestId`（UUID）标识，`http:cancel(requestId)` 取消；不可取消的持久化操作为原子事务 |
| 用户类型标注 | 单用户类型（API 调试者），全部通道可用，不再逐通道标注 |
| 权限守卫 | preload 白名单即守卫：未列入 contextBridge 的通道不可达（CH3-006 的本地化实现） |

### 3.2 依赖与约束

| 依赖方 | 被依赖方 | 依赖内容 |
|--------|---------|---------|
| 渲染层全部模块 | preload（window.tinypost 桥） | 通道白名单封装 |
| db 域通道 | 主进程 db.ts（sql.js） | 单例连接，写后 persist() 落盘 |
| http:send | 主进程 http.ts（Node http/https） | 传输与取消注册表 |
| dialog 域 | Electron dialog API | 父窗口绑定 |

约束：渲染进程不得绕过 preload 访问 Node/SQLite；shared 层禁止依赖 Electron API（架构分层选择）。

### 3.3 权限模型

单机单用户，无角色/操作权限矩阵/数据权限规则（CH3-010~012 本地化豁免：以 preload 白名单作为唯一能力边界，等价于「角色=API 调试者，权限=全通道」）。

### 3.4 公共规范

**枚举引用清单**（全部登记于 {conv.common_enums} 与 {conv.enum_pool}，无重复定义）：

| 枚举 | 来源池 | 使用通道 |
|------|--------|---------|
| HttpMethod / AuthType / BodyMode / FormFieldType | 公共枚举 | http:send、db:saveRequest、db:saveHistory |
| RequestSkipFlag / HistoryStatus / ResponseBodyKind / ImportFormat / EnvironmentStatus / BackupAction | 业务枚举池 | meta 解析、历史列表渲染、导入路由 |

**错误约定**：网络类错误 message 形如 `请求失败: <原因>`；持久化类形如 `保存失败: <原因>`；对话框取消不是错误（返回 null/false）。

**配置项**：AppSettings（settings 表 KV）：timeoutMs=60000、insecure=false、followRedirects=true。

## 4. 聚合根详细设计

### 4.1 集合（Collection）

#### 4.1.1 领域模型

表 `collections(id, name, created_at)`；子表 `saved_requests(id, collection_id, name, method, url, headers, body, auth, query, meta, sort_order, created_at)`。
复杂列 JSON 约定：headers=`HeaderItem[]`、query=`QueryItem[]`、auth=`AuthConfig`、meta=`{runEnabled?: boolean, extractors?: ExtractRule[], formFields?, urlencodedFields?, bodyMode?}`。
冗余策略：请求项冗余保存完整请求定义（非引用编辑器态），保证历史可复现。不变量见 INV-02/04/05。
标签池：无标签体系（豁免）。

#### 4.1.2 状态模型

无持久状态机。请求项仅有 meta.runEnabled 布尔与 sort_order 序号；集合无生命周期状态（存在即有效）。

#### 4.1.3 子流程设计

集合运行子流程 I/O 见领域模型；内部实现为渲染进程 lib/collectionRun.ts（串行循环 + 逐步回调），内部无独立接口。

#### 4.1.4 接口设计（通道清单）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| db:listCollections | — | CollectionRow[] | 按 id 倒序（新建在前，与 created_at 同向） |
| db:createCollection | name: string | number（新集合 id） | name 非空（通道级校验）；重名允许 |
| db:renameCollection | id, name | void | 目标存在，name 非空 |
| db:deleteCollection | id | void | INV-04 级联删除 |
| db:listSavedRequests | collectionId?: number | SavedRequestRow[] | 按 sort_order 升序；无参返回全部 |
| db:saveRequest | SaveRequestInput | number（请求项 id） | id 有值=更新，无值=新增；insertAfterId 支持插入定位后整体重排 |
| db:renameSavedRequest | id, name | void | — |
| db:deleteSavedRequest | id | void | — |
| db:reorderSavedRequests | collectionId, orderedIds: number[] | void | INV-02：orderedIds 必须与集合内请求项集合一致，单事务 |

#### 4.1.5 领域事件与集成

无领域事件/MQ（单进程）；变更即时反映于下一次 list 调用（UI 拉模式）。

### 4.2 环境（Environment）

#### 4.2.1 领域模型

表 `environments(id, name UNIQUE, variables, tls, cookies, is_active, created_at)`；variables=`VariableItem[]`、tls=`TlsConfig`、cookies=`CookieJar{enabled, items[]}`。
不变量：name 全局唯一（UNIQUE 约束）；INV-01 激活唯一；Cookie 条目含过期与域属性（shared/cookies.ts 解析 Set-Cookie 行）。

#### 4.2.2 状态模型

数据生命周期状态：EnvironmentStatus（未激活/激活），由 INV-01 保证全局唯一；无其他流转。

#### 4.2.3 子流程设计

请求执行子流程对环境的读写：发送前读 variables/tls/cookies（渲染与携带）；响应后 Set-Cookie 合并写回 cookies（同事务 persist）。

#### 4.2.4 接口设计（通道清单）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| db:ensureDefaultEnvironment | — | EnvironmentRow[] | 首启无环境时创建默认环境（name=本地），连同全量列表返回 |
| db:listEnvironments | — | EnvironmentRow[] | — |
| db:setActiveEnvironment | id | void | INV-01：事务内清零后置位 |
| db:upsertEnvironment | UpsertEnvironmentInput | number（环境 id） | id 有值=更新；makeActive=true 时履行 INV-01；name 唯一冲突报错 |
| db:deleteEnvironment | id | void | 不允许删除唯一环境（保底一个）；删除激活环境时默认环境接管激活 |

#### 4.2.5 领域事件与集成

无事件；激活切换后由 UI 重新拉取 list 并刷新全局上下文。

### 4.3 历史条目（HistoryEntry）

#### 4.3.1 领域模型

表 `request_history(id, method, url, request_headers, request_body, status, response_headers, response_body, duration_ms, created_at, auth, query, meta)`。
不可变聚合（INV-03）；status 可空（网络失败=null，HistoryStatus=失败）。

#### 4.3.2 状态模型

无状态机（创建即终态）。

#### 4.3.3 子流程设计

由请求执行子流程在完成（含失败）时创建快照；无独立接口。

#### 4.3.4 接口设计（通道清单）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| db:saveHistory | SaveHistoryInput | void | 仅插入；失败请求也留档（status=null） |
| db:listHistory | limit?: number | HistoryRow[] | 按写入序倒序（id DESC，与时间同向）；默认 50 条 |
| db:clearHistory | — | void | 全量物理删除（TP-BR-10），UI 侧二次确认 |

### 4.4 请求执行与传输（http 域，子流程接口化）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| http:send | HttpRequestPayload | HttpResponsePayload | 渲染由渲染层先完成（vars.ts），本通道收到的是就绪载荷；multipart/urlencoded 编码在主进程；tls/insecure/timeoutMs/followRedirects 可逐请求覆盖；返回 status/headers/body/durationMs/sizeBytes/redirects/binary/setCookies |
| http:cancel | requestId?: string | boolean | 无 requestId 取消最近一个进行中请求 |

### 4.5 系统对话框（dialog 域）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| dialog:saveResponse | body: string, suggestedName | boolean | 文本响应另存 |
| dialog:saveBinaryResponse | requestId, suggestedName | boolean | 从二进制缓冲取字节落盘（TP-BR-09）；缓冲缺失返回 false |
| dialog:pickFile | filters?: FileFilter[] | string \| null | 导入/证书/multipart 文件选择；取消=null |
| dialog:saveText | contents, suggestedName | boolean | 通用文本导出（JSON 过滤器） |
| dialog:backupDatabase | — | boolean | 整库导出单文件（tinypost-backup-<stamp>.db） |
| dialog:restoreDatabase | — | boolean | 选备份文件整库恢复；UI 侧覆盖前二次确认 |

### 4.6 应用设置（D-01，基础数据）

#### 4.6.1 领域模型

表 settings(key PRIMARY KEY, value)；AppSettings 序列化为 KV 行。无状态机、无子流程、无领域事件。

#### 4.6.2 接口设计（通道清单）

| 通道 | 入参 | 返回 | 业务规则/校验 |
|------|------|------|--------------|
| db:getSettings | — | AppSettings | 缺省键回填默认值（timeoutMs=60000、insecure=false、followRedirects=true） |
| db:saveSettings | settings: AppSettings | void | 整体覆盖写；insecure 开启后 UI 须可见（TP-BR-08） |

## 5. 模块清单汇总

### 5.1 对外服务清单（渲染进程可调用全集）

http 域 2：send / cancel；db 域 19：saveHistory, listHistory, clearHistory, ensureDefaultEnvironment, listEnvironments, setActiveEnvironment, upsertEnvironment, deleteEnvironment, listCollections, createCollection, renameCollection, deleteCollection, listSavedRequests, saveRequest, renameSavedRequest, deleteSavedRequest, reorderSavedRequests, getSettings, saveSettings；dialog 域 6：saveResponse, saveBinaryResponse, pickFile, saveText, backupDatabase, restoreDatabase。**合计 27 通道**。

### 5.2 SQL 清单

按聚合分组：集合（collections/saved_requests 两表 CRUD + reorder 批量 UPDATE + 级联 DELETE）、环境（environments CRUD + 激活先清后置 + 默认环境保障）、历史（insert/倒序 select/全删）、设置（KV upsert）。全部经 db.ts 封装，参数化查询，无拼接。

### 5.3 DDL（v0.2.0 实际，含迁移列）

```sql
CREATE TABLE IF NOT EXISTS request_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  request_headers TEXT NOT NULL DEFAULT '[]',
  request_body TEXT NOT NULL DEFAULT '',
  status INTEGER,
  response_headers TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  auth TEXT NOT NULL DEFAULT '{"type":"none"}',   -- 迁移列
  query TEXT NOT NULL DEFAULT '[]',               -- 迁移列
  meta TEXT NOT NULL DEFAULT '{}'                 -- 迁移列
);
CREATE TABLE IF NOT EXISTS environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  variables TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  tls TEXT NOT NULL DEFAULT '{}',                 -- 迁移列
  cookies TEXT NOT NULL DEFAULT '{"enabled":true,"items":[]}'  -- 迁移列
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS saved_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '{"type":"none"}',
  query TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  meta TEXT NOT NULL DEFAULT '{}',                -- 迁移列
  sort_order INTEGER NOT NULL DEFAULT 0           -- 迁移列（首增时回填）
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 说明 |
|------|------|---------|------|
| v1.0 | 2026-10-27 | initial | 首次生成：27 IPC 通道 + 5 表 DDL + 跨聚合不变量 INV-01~05，与代码 v0.2.0 对齐 |
| v1.1 | 2026-10-27 | field_changed/interface_changed | 复核修复：四通道返回类型对齐实现（number/数组）、listCollections/listHistory 排序口径、meta 里 runEnabled/extractors、默认环境名「本地」；INV-01/02/04 由代码修复落地为真（见代码变更） |

### 变更类型词汇表适用说明

initial/structural/table_added/field_added/interface_added 等类型继续适用于本档案后续演进（如新增通道=interface_added，新增 meta 子键=field_added）。

### 版本号规则

主文档 v{major}.{minor}：结构性重组进 major，通道/字段增改进 minor 并在更新记录登记目标节号。
