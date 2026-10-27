# TinyPost 领域模型（D2-2 领域建模）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-10-27 |
| 输入 | tinypost-prd.md v1.0 |

## Step 0：PRD 范围判定

PRD 标注模块 `tinypost`（全产品）→ **范围明确**，跳过 Step 1~3 战略设计（业务域划分已在 AA 的 DDD 四层归类完成：核心=请求构建与发送/集合运行，支撑=集合/环境/会话/历史/导入导出）。直接进入战术设计。

## 本域信息

| 项目 | 内容 |
|------|------|
| 本域名称 | tinypost（本地 API 调试域） |
| 领域分层 | 单一上下文（全产品建档：三个聚合根按 AA 归类主要落在支撑业务域模块；AA 核心业务域两个模块以子流程形态建模，不持久化） |
| 聚合根 | 集合 Collection、环境 Environment、历史条目 HistoryEntry |

## 聚合根识别（A1-A4 测试）

| 候选 | A1 一致性边界 | A2 全局引用 | A3 生命周期入口 | A4 规则驱动 | 结论 |
|------|--------------|------------|----------------|------------|------|
| 集合 | ✅ 请求项归属与排序整体一致（删除级联、重排原子） | ✅ 集合运行/导入以集合 id 引用 | ✅ 请求项经集合创建/保存 | ✅ 顺序驱动链路执行 | 聚合根（4/4） |
| 环境 | ✅ 变量/证书/Cookie 罐随环境整体切换 | ✅ 请求执行/提取回写以环境 id 引用 | ✅ 变量、Cookie 经环境写入 | ✅ 激活互斥规则 | 聚合根（4/4） |
| 历史条目 | ✅ 快照不可变 | ⚠️ 仅回填引用 | ✅ 仅由发送完成事件创建 | ❌ 无 | 聚合根（2/4，A1 通过→聚合根） |
| 请求项 | ❌ 独立改动不破坏集合外一致性（但归属集合） | ✅ | ❌ 经集合入口 | ❌ | **域内实体**（G1 分区实体：状态由集合聚合托管） |
| 应用设置 | ❌ | ❌ | — | ❌ | 实体（全局单例、独立持久化；五类体系边界情形，不建聚合） |

## 领域对象清单（业务域内）

| 对象名 | 分类 | 与上级关系 | 核心业务字段 | 关键枚举字段 | 备注 |
|--------|------|-----------|------------|------------|------|
| Collection 集合 | 聚合根 | — | id, name, created_at | — | collections 表 |
| SavedRequest 请求项 | 实体 | N:1 Collection | id, name, method, url, headers, body, auth, query, meta, sort_order | RunEnabledFlag（meta.runEnabled） | saved_requests 表；G1 分区实体 |
| AuthConfig 认证 | 值对象 | 内嵌 请求项/历史 | type + bearer/basic/apikey 字段 | AuthType | 不可变，整体替换 |
| HeaderItem/QueryItem/FormField/UrlEncodedField | 值对象 | 内嵌 请求项 | key/value/enabled(/type/fileName/contentType) | FormFieldType | meta/列内 JSON |
| ExtractRule 提取规则 | 值对象 | 内嵌 请求项 meta | path, variable, enabled | — | 集合运行的输入之一 |
| Environment 环境 | 聚合根 | — | id, name, variables, tls, cookies, is_active | EnvironmentStatus | environments 表 |
| VariableItem 变量 | 值对象 | N:1 Environment | key, value | — | 值相等即等价 |
| CookieJar Cookie 罐 | 实体 | 1:1 Environment | enabled, items[]（含过期/域） | — | 有条目级增删，实体 |
| TlsConfig TLS 配置 | 值对象 | 1:1 Environment | certPath, keyPath, caPath | — | 整体替换 |
| HistoryEntry 历史条目 | 聚合根 | 独立 | id, method, url, 入参快照(headers/body/auth/query/meta), 出参快照(status/headers/body), duration_ms, created_at | HistoryStatus | request_history 表；不可变 |
| AppSettings 应用设置 | 域内对象（实体；边界情形：全局单例、独立持久化、不隶属任一聚合） | 独立 | timeoutMs, insecure, followRedirects | — | settings 表（KV） |

## 子流程 I/O 契约

| 子流程 | 触发条件 | 输入（来源） | 输出（去向） | 输出写入哪个对象 |
|--------|---------|------------------|------------------|---------------|
| 集合运行 CollectionRun | 用户对某集合启动运行 | Collection（请求项清单+顺序+跳过标记）、Environment（渲染变量/会话） | 每步执行结果（呈现即弃）、提取值 | Environment.variables（提取回写） |
| 请求执行 RequestExecution | 单击发送或链路某步 | 请求定义要素（渲染后）、Environment 会话/证书、AppSettings 执行选项 | 响应载荷 + 快照 | HistoryEntry（新建）、Environment.cookies（Set-Cookie） |

> 注：两个子流程均为跨聚合编排（输入来自多个聚合或未保存的临时请求），无单一父聚合根；RequestExecution 输出为新建 HistoryEntry 聚合根——这是对技能模板「父聚合根」措辞的显式偏差声明（工具型应用，编排无持久化宿主）。
>
> 两个子流程均不持久化过程数据（运行进度/结果面板为 UI 态）；内部建模在渲染进程 lib/（collectionRun/prepareRequest/vars）。

## 关联领域对象（只列边界说明，不展开内部模型）

| 关联领域对象 | 所属业务域 | 当前域关联字段 | 需获取信息 | 触发关系 | 映射模式 |
|------------|-------------|-------------|----------|---------|---------|
| （无） | — | — | — | — | — |

> 说明：TinyPost 为单机工具，无跨业务域引用。外部目标系统仅为 HTTP 传输终点（载荷归过程数据 P4），不建引用模型。

## 过程数据分类表

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| 历史列表筛选/limit | P1 查询条件 | 不持久化 |
| 响应格式化视图（JSON/XML/HTML 高亮） | P2 展示数据 | 派生值，随响应缓存于内存 |
| 运行进度/逐步结果面板 | P3 UI 交互状态 | 运行结束即弃 |
| HttpRequestPayload/HttpResponsePayload | P4 请求/响应结构 | 传输载体；快照落历史时序列化 |
| cURL/Postman 导入中间结构 | P5 集成载荷 | 解析后即转请求定义 |
| 响应二进制缓冲（requestId→bytes） | P7 计算中间值 | 仅供 saveBinaryResponse 取用，不落库 |

## 跨业务域集成

无（单进程内 IPC 调用，见 D3 接口设计；无 MQ/领域事件，跨聚合一致性由串行 UI 操作 + 事务化 SQL 保证）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-10-27 | 初始生成：3 聚合根 + 2 子流程 + 过程数据七类归档 |
| v1.1 | 2026-10-27 | 复核修复：领域分层口径、AppSettings 归类为实体（边界声明）、P4/P5 统一、子流程契约去「父聚合根」措辞并显式声明偏差 |
