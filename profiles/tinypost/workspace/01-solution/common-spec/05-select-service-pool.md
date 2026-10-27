# 选择服务池（Select Service Pool）

> UI 下拉/选择器数据源登记。本项目无后端服务，数据源一律为 IPC 通道或本地常量；新增选择器先查此池。

| 选择器 | 数据源 | 形态 |
|--------|--------|------|
| 环境切换 | `db:listEnvironments` | IPC，名称 + 激活态 |
| 集合选择（保存请求时） | `db:listCollections` | IPC |
| Auth 类型 | 常量 AuthType | 公共枚举 |
| Body 模式 | 常量 BodyMode | 公共枚举 |
| HTTP 方法 | 常量 HttpMethod | 公共枚举 |
| 文件选择 | `dialog:pickFile` | IPC + 原生对话框 |
