# TinyPost PageSpec（交互设计文档）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 状态 | 稳定 |
| 最后更新 | 2026-10-27 |
| 用户类型 | API 调试者 |
| 模块 | tinypost（全产品） |
| 信息来源 | api-tinypost.md v1.1（唯一信息来源）+ 渲染层实装比对（as-built） |

> v1.1 说明：v1.0 复核发现多处描述为「理想化虚构」，本版逐项改为与渲染层实装一致（as-built）。随本轮代码修复新增的两项交互（insecure 警示条、清空历史/删除请求二次确认）按设计目标保留。组件映射不使用 ScmListPage 系（vue3-engine 参考实现），以本项目实际组件（Sidebar/RequestEditor/ResponseView/EnvEditor/CodeEditor）等价映射。

## 1. 模块元信息（FX-001~005）

| 项 | 值 |
|----|-----|
| 模块编码 | tinypost |
| App | TinyPost 桌面应用（单窗口**两栏**布局：280px 侧栏 + 主列；主列内请求编辑器与响应区上下堆叠） |
| 业务类型 | master_data（集合/环境/请求项数据生命周期管理）+ 工具执行（发送/运行，无审批流） |
| 页面类型 | **hybrid**：侧栏 Tab 切换（集合/历史）、编辑器五 Tab、拖拽排序（@dnd-kit）、弹窗（环境编辑/cURL 导入/提取到变量） |
| 顶栏 | 品牌标识 + 环境下拉 + 「编辑变量」「新建环境」按钮 + 超时数字框 + 「跟随重定向」「允许不安全证书」复选框（全部内联，即改即存；无菜单栏、无独立设置面板、无顶栏运行入口——「运行」在侧栏集合行） |
| 警示条 | insecure 勾选时顶栏下方显示常驻警示条（本轮新增，TP-BR-08） |

## 2. Action 定义（FX-006~016）

| Action | 触发点 | 调用通道 | 权限 key |
|--------|--------|----------|----------|
| send | 编辑器「发送」/ Ctrl+Enter | http:send | 无（单用户） |
| cancel | 「取消」/ 取消运行 | http:cancel（编辑器与运行各用固定 requestId） | 无 |
| saveRequest | 「保存」覆盖 / 「另存为」（prompt 选集合与命名） | db:saveRequest | 无 |
| runCollection | 侧栏集合行「运行」 | 渲染层串行编排：db:listSavedRequests + http:send + db:upsertEnvironment（回写）+ db:saveHistory | 无 |
| saveHistory | send/run 每步完成后自动 | db:saveHistory | 无（自动） |
| listHistory | 启动加载 / 发送后刷新 | db:listHistory（一次 50 条，无滚动分页） | 无 |
| clearHistory | 侧栏历史页签「清空」（**二次确认**，本轮新增） | db:clearHistory | 无 |
| envEditor / envUpsert / envActivate | 顶栏「编辑变量」「新建环境」打开 EnvEditor 弹窗；保存时 makeActive 并切换 | db:upsertEnvironment / db:setActiveEnvironment / db:deleteEnvironment / db:ensureDefaultEnvironment | 无 |
| collectionCreate | 侧栏「新建」（window.prompt 命名） | db:createCollection | 无 |
| collectionRename / collectionDelete | 集合头「重命名」按钮或双击集合名 / 「×」删除（**有确认**） | db:renameCollection / db:deleteCollection | 无 |
| requestLoad / requestRename / requestDuplicate / requestDelete / requestReorder | 点击加载；「重命名」按钮或双击行名；「复制」；「×」删除（**二次确认**，本轮新增）；拖拽把手排序 | db:listSavedRequests / db:renameSavedRequest / db:saveRequest / db:deleteSavedRequest / db:reorderSavedRequests | 无 |
| toggleRun | 请求行「参与运行」复选框（写入 meta.runEnabled） | db:saveRequest | 无 |
| exportCollection / exportEnvironment | 集合头「导出」 / EnvEditor「导出」 | dialog:saveText | 无 |
| importFile | 侧栏「导入」（文件选择 input，Postman/环境/备份 JSON） | dialog:pickFile（渲染层解析）+ db:createCollection + db:saveRequest + db:upsertEnvironment | 无 |
| curlImport | 编辑器「导入 cURL」弹窗 | 渲染层 parseCurl 回填（不落库） | 无 |
| backup / restore | 侧栏「备份」「恢复」（恢复**有确认**） | dialog:backupDatabase / dialog:restoreDatabase | 无 |
| settings | 顶栏内联控件即改即存 | db:getSettings / db:saveSettings | 无 |
| saveResponseFile | 响应区「存文件」（文本）/「保存原始响应」（二进制） | dialog:saveResponse / dialog:saveBinaryResponse | 无 |
| manualExtract | 响应区「提取到变量」弹窗（JSONPath→变量，写入当前环境） | 渲染层 extractByRules + db:upsertEnvironment | 无 |

去重后 Action 共 21 个，引用 IPC 通道 21 个（另 db:getSettings/db:listEnvironments 为启动加载通道），全部存在于 api-tinypost.md v1.1 §5.1 的 27 通道清单内，无未定义通道调用。

## 3. 字典 Key 清单（FX-017~020）

| 字典 key | 来源 | 使用处 |
|----------|------|--------|
| HttpMethod | 公共枚举（常量） | 方法选择器、列表徽标 |
| AuthType | 公共枚举（常量） | 认证 Tab |
| BodyMode | 公共枚举（常量） | Body Tab |
| RunEnabledFlag | 业务枚举池（meta.runEnabled） | 请求行「参与运行」复选框、运行过滤 |
| HistoryStatus | 业务枚举池（status 派生） | 历史与运行步骤状态徽标底色 |
| ResponseBodyKind | 业务枚举池（binary 派生） | 二进制说明卡 vs 文本编辑器 |

无后端 dict 接口（枚举为本地常量，与选择服务池登记一致）。

## 4. 列表页（FX-021~051）

### 4.1 集合树（Sidebar 集合页签）

| 项 | 值 |
|----|-----|
| 查询条件 | 侧栏搜索框（按集合名/请求名/method/url 过滤；搜索时强制展开且禁用拖拽） |
| 结构 | 集合行（展开箭头+名称+计数）+ 请求项行（拖拽把手 ⋮⋮、method 徽标、名称、URL 副文本、「参与运行」复选框） |
| 集合行操作 | 「运行」「导出」「重命名」按钮与「×」删除；双击集合名重命名 |
| 请求项行操作 | 点击加载到编辑器；「重命名」「复制」「×」（删除**二次确认**，本轮新增）；双击重命名；拖拽排序 |
| 工具栏 | 新建 / 导入 / 备份 / 恢复 |
| 空态 | 「还没有集合。可新建，或导入 Postman / TinyPost JSON。」 |

### 4.2 历史列表（Sidebar 历史页签）

| 项 | 值 |
|----|-----|
| 查询条件 | 侧栏搜索框（按 method/url/status 过滤）；启动时一次拉取最近 50 条（无滚动分页） |
| 行结构 | 单按钮行：method 徽标 + URL + （compact 状态徽标 tone 着色 + 耗时 ms）；**无序号/时间/操作列** |
| 行操作 | 整行点击回填编辑器（含当时响应快照回显） |
| 工具栏 | 「清空」（**二次确认**，本轮新增） |

### 4.3 运行结果面板（ResponseView 内嵌卡片，运行时出现）

| 项 | 值 |
|----|-----|
| 头部 | runSummary 摘要文案（运行中/已取消/已停止/已跑完）+「关闭」按钮（结束后） |
| 步骤行 | 单按钮行：method 徽标 + 步骤名 + 状态徽标（tone 着色）+ 耗时；二进制步骤附媒体类型与大小；**无序号列、无逐步「提取结果」列** |
| 提取反馈 | 面板上方全局通知条（extract-notice）：「已写入 变量 = 值」或失败原因，非按步骤分列 |
| 行操作 | 点击步骤行将该请求项回填编辑器（仅定义，不展示该步响应） |
| 中止 | 顶栏「取消」按钮同时取消编辑器与运行中的在途请求 |

## 5. 表单页（FX-052~112）

### 5.1 请求编辑器（主列上半部，单卡片五 Tab）

| Tab | 内容 |
|-----|------|
| Auth | 类型选择（AuthType）+ 对应凭据字段 |
| Params | key/value/启用 开关行编辑（与 URL 双向联动） |
| Headers | key/value/启用 行编辑（尾行自动补空） |
| Body | raw → CodeEditor（固定暗色主题）；form-data → 字段行（text 输入 / file 经 dialog:pickFile 选择，显示文件名）；urlencoded → 键值对行；GET/HEAD 时禁用 |
| Extract | 提取规则行编辑：JSONPath + 变量名 + 启用开关（存 meta.extractors） |

编辑器头部：方法下拉 + URL 输入（普通 input，`{{var}}` 无高亮）+ 发送/取消 + 保存（覆盖）/ 另存为 + 复制 cURL + 导入 cURL；「参与运行」开关（已保存请求联动 meta）。快捷键：Ctrl+Enter 发送、Ctrl+S 保存/导入/保存环境（按弹窗上下文）。另存为经 window.prompt 选集合序号与命名（非弹窗表单）。

### 5.2 环境编辑器（EnvEditor 弹窗）

| 字段 → 组件 |
|------------|
| 名称 → input（唯一性冲突由 DB UNIQUE 报错并 toast） |
| 变量列表 → key/value 行编辑（可增删） |
| TLS → cert/key/ca 路径只读 input + 选择按钮（dialog:pickFile，按类型过滤）+ passphrase 输入（会话内存保存） |
| Cookie 罐 → enabled 开关 + 条目**可编辑**行（name/value/domain/path；无过期列）；清空按钮 |
| 操作 | 保存（保存后即激活，makeActive 恒为 true）、删除（**「至少保留一个环境」守卫**：渲染层拦截 + 主进程同规则，本轮新增通道级守卫）、导出 |

### 5.3 应用设置（无独立面板，顶栏内联）

超时（数字框，秒，1-300）、「跟随重定向」复选框、「允许不安全证书」复选框——任一改动即自动持久化（settings effect）。insecure 勾选时顶栏下方显示常驻警示条「已允许不安全证书（TLS 校验已关闭）」（本轮新增，TP-BR-08）。主题跟随系统，无设置项。

### 5.4 按钮组合

编辑器：发送 / 取消（发送中）/ 保存 / 另存为；EnvEditor：保存 / 删除 / 导出 / 关闭。破坏性操作确认矩阵（本轮新增后）：删除集合 ✅、恢复数据库 ✅、导入备份合并 ✅、清空历史 ✅（新增）、删除请求 ✅（新增）、删除环境=守卫拦截。

## 6. 详情页（FX-113~121）

### 6.1 响应区（主列下半部）

| 区块 | 内容 |
|------|------|
| 概要行 | 状态徽标（tone 着色）+ 状态文本 + 耗时 + 大小 + 最终 URL（title 悬停全文） |
| 工具行 | Pretty/Raw 切换、复制、复制 cURL、存文件（文本）/ 保存原始响应（二进制）、「提取到变量」（弹窗：JSONPath + 变量名 → 写入当前环境） |
| Tab | Body / Headers / Redirects（仅有重定向时出现，逐跳 `状态 URL → Location`） |
| Body | 文本 → CodeEditor 只读（固定暗色主题）+ 响应内搜索（上一个/下一个/n/N）；二进制 → 二进制说明卡（媒体类型+大小，不入库不渲染）+ 保存原始响应 |
| 提取通知 | extract-notice 通知条（已写入/失败原因） |
| 错误 | error-box 展示网络/取消错误（「已取消」不清空上次响应） |

无 Set-Cookie 卡：setCookies 由渲染层合并写回环境 Cookie 罐（advanceEnvironment），不在响应区展示（可在 EnvEditor Cookie 罐中查看结果）。

### 6.2 历史/步骤详情

历史条目回填 = 请求定义 + 当时响应快照一并载入编辑器与响应区；运行步骤点击 = 仅回填请求定义（响应区清空）。

## 7. 路由定义（FX-122~125）

桌面单窗口，无 URL 路由；导航态 = 侧栏页签（集合/历史）。持久化仅限数据与环境/设置（SQLite），UI 态（展开、Tab、草稿）不持久化。

## 8. 全局一致性（FX-126~137）

- Action ↔ 通道一一对应（§2 与 api-tinypost.md v1.1 §5.1 的 27 通道一致，无未定义通道调用）
- 字典使用与 §3 清单一致，无游离枚举字面量
- 破坏性操作确认矩阵成立（§5.4）；insecure 警示条全局可见（本轮新增）
- 主题：页面 chrome 跟随系统明暗（prefers-color-scheme）；CodeEditor 固定暗色主题（已如实标注，非「跟随系统」）
- 双平台等价：无平台专属 UI 分支（TP-BR-03）

## 9. 文档版本与变更记录（FX-138~141）

| 版本 | 日期 | 变更 | 评审 |
|------|------|------|------|
| v1.0 | 2026-10-27 | 初始生成（API 文档 v1.0 驱动 + 既有 UI 结构对齐） | 自主执行 |
| v1.1 | 2026-10-27 | 复核修复：全部虚构 UI 描述改为 as-built（两栏布局、顶栏内联设置、无菜单、无右键菜单、历史/运行面板实结构、Cookie 可编辑、CodeEditor 固定主题、无 Set-Cookie 卡、无滚动分页）；新增交互按代码修复落地（insecure 警示条、清空历史/删除请求二次确认）；Action/通道重计（21/21） | 复核驱动修订 |
