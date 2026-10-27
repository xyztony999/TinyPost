# 架构分层选择

> 来源：src/ 目录结构。状态：已确认。

## 四层结构

```
src/main/       Electron 主进程：HTTP 发送、SQLite 读写、系统对话框（唯一 I/O 权限层）
src/preload/    contextBridge：白名单 IPC 通道封装，渲染进程唯一入口
src/renderer/   React UI：组件 + lib/（渲染进程逻辑：变量渲染、导入解析、集合运行编排）
src/shared/     纯函数共享层：类型 + 可测试逻辑（cookies/curl/jsonpath/multipart/portable/urlencoded/xml…），两侧进程共用，禁依赖 Electron API
```

## 依赖方向

- renderer → preload（invoke）→ main；shared 被两侧引用，不反向依赖
- 业务逻辑尽量下沉 shared/main 便于 vitest 单测；renderer/lib 仅做 UI 编排

## IPC 通道分组（前缀即域）

| 前缀 | 域 | 通道数（v0.2.0） |
|------|-----|----------------|
| `http:` | 请求发送/取消 | 2 |
| `db:` | SQLite 持久化（历史/环境/集合/请求项/设置） | 19 |
| `dialog:` | 原生对话框（保存响应/另存二进制/选文件/导出文本/备份/恢复） | 6 |

## SQLite 表（5 张，见 src/main/db.ts）

request_history / environments / collections / saved_requests / settings
