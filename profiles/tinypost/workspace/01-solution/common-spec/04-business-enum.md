# 业务枚举池（Enum Pool）

> 业务模块引用/新增枚举统一登记于此，D3 API 设计从本池取用，防重复定义。

| 枚举 | 值 | 定义模块 | 备注 |
|------|-----|---------|------|
| EnvironmentStatus | 未激活 / 激活 | 环境与变量 | 列表徽标展示，is_active 派生 |
| ResponseBodyKind | text / json / xml / html / binary | 请求构建与发送 | 按 Content-Type 推断，binary 走另存为 |
| RunEnabledFlag | 参与 / 不参与 | 集合运行 | 存于请求 meta.runEnabled，运行时过滤；缺省视为参与 |
| HistoryStatus | 成功(2xx/3xx) / 客户端错误(4xx) / 服务端错误(5xx) / 失败(网络异常) | 历史记录 | status 列派生，null=网络失败 |
| BackupAction | backup / restore | 导入导出 | dialog 域语义标注 |
| ImportFormat | postman-v2.1 / curl / portable | 导入导出 | 导入解析器路由 |
