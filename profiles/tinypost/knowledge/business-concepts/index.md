# 业务概念与模块清单

> 来源：README「MVP 能力」、git 提交历史、src/ 代码结构逆向整理。状态：已确认（与 v0.2.0 代码一致）。

## 业务术语表

| 术语 | 定义 | 代码载体 |
|------|------|---------|
| 请求 | 一次完整的 HTTP 调用定义：方法 + URL + Headers + Body + Auth + Query + TLS/提取规则 | `SavedRequestRow` / `HttpRequestPayload` |
| 集合 | 一组有序请求的容器，用于组织接口（如「登录链路」「用户模块」） | `CollectionRow` |
| 请求项 | 集合内的单个请求及其排序（可拖拽排序、可标记不参与运行） | `SavedRequestRow.sort_order`、meta.runEnabled |
| 环境 | 一套命名变量 + TLS 客户端证书 + Cookie 罐的具名组合（如 dev/prod），同一时刻仅一个激活 | `EnvironmentRow` |
| 变量 | `{{key}}` 形式的模板变量，来自激活环境，渲染进 URL/Header/Body | `VariableItem`、lib/vars.ts |
| 历史 | 每次实际发出的请求/响应快照，本地持久化，可回放 | `HistoryRow`、request_history 表 |
| 提取规则 | 从响应中按 JSONPath 抽值写入环境变量的规则（token 提取） | `ExtractRule`、shared/jsonpath.ts |
| Cookie 罐 | 环境内共享的 Set-Cookie 存储，跨请求自动携带，形成会话 | `CookieJar`、shared/cookies.ts |
| 集合运行 | 按集合内顺序依次执行「参与运行」的请求，并把提取结果传给后续请求；任一步非 2xx 或二进制响应即停止推进且不做提取 | lib/collectionRun.ts |
| 便携备份 | 单文件数据库备份/恢复（portable），便于跨机器迁移 | shared/portable.ts、dialog:backupDatabase |
| 请求元数据 | 请求的扩展配置（body 模式、表单字段、提取规则、参与运行标记等），JSON 存于 meta 列 | `meta` 列、shared/requestMeta.ts |

## 模块清单（L3 粒度，供 D1 使用）

| 模块 | 需求描述 |
|------|---------|
| 请求构建与发送 | 编辑方法/URL/Headers/Query/Body（raw、form-data、urlencoded）/Auth（Bearer/Basic/API Key），经主进程发出并展示响应（状态/头/体/耗时/重定向链/二进制保存） |
| 历史记录 | 自动保存每次发送的完整快照，按时间倒序浏览、一键回填到编辑器、清空 |
| 集合管理 | 集合的增删改名；集合内请求项的保存、改名、删除、拖拽排序 |
| 集合运行 | 按序执行集合内参与运行的请求（可逐项关闭），任一步失败即中止；用于内网登录链路编排与离线回放 |
| 环境与变量 | 环境的增删改查与激活切换；`{{var}}` 渲染；提取规则把响应值写回环境（token 链） |
| 会话保持 | 每环境独立 Cookie 罐，自动收集 Set-Cookie 并在后续请求携带；TLS 客户端证书配置 |
| 导入导出 | Postman Collection v2.1 导入、cURL 导入、便携备份文件（备份/恢复整库） |
| 应用设置 | 超时、跳过 TLS 校验开关、跟随重定向；跟随系统的明暗主题 |

## 用户类型

单一本地用户（API 调试者/内网开发人员），无多角色与权限体系。
