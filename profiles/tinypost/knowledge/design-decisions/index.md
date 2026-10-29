# 设计决策

> 每条决策含：决策点 / 选择 / 理由。来源：README 与提交历史，已复核。

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| D-01 | 桌面框架 | Electron 32（弃 Tauri 2） | 麒麟桌面 V10 SP3 无 WebKitGTK 4.1，Tauri 不可用；Electron 自带 Chromium 保证双平台一致 |
| D-02 | SQLite 绑定 | sql.js（WASM） | 无原生模块 → x86 CI 可直接打 arm64 包；换取的写入性能对单机调试工具可接受 |
| D-03 | 打包链 | Vite 5 + `@rollup/wasm-node` override | 麒麟 glibc 2.31 可本机 `npm run dev`，不依赖 Rollup 原生二进制 |
| D-04 | HTTP 发起点 | 主进程 Node http/https（非渲染进程 fetch） | 绕开 CORS；可控超时/重定向/自签证书/insecure 开关；可挂客户端证书 |
| D-05 | 数据归属 | 全部本机 SQLite，零遥测零云同步 | 产品定义：内网/信创可用，敏感 token/cookie 不出本机 |
| D-06 | 进程通信 | contextBridge 暴露白名单 IPC，通道按 `http:` `db:` `dialog:` 前缀分组 | 最小暴露面；语义分组便于审计与设计映射 |
| D-07 | 麒麟启动 | 启动器默认 `--no-sandbox` + Wayland hint；AppImage 外用 pack-deb.sh 打 .deb | 绕开跨架构 fpm 与麒麟沙箱限制（对齐 cc-switch-arm64-kylin 验证结论） |
| D-08 | 变量与提取 | `{{var}}` 模板渲染 + JSONPath 提取写回环境 | 用最小机制覆盖「登录拿 token → 后续请求带 token」的链路需求 |
| D-09 | Cookie 隔离 | Cookie 罐挂在环境上而非全局 | 不同环境（dev/prod、不同账号）会话互不污染 |
| D-10 | 集合运行语义 | 按可视顺序串行执行，请求项可拖拽排序、可标记不参与运行；任一步非 2xx 或二进制响应即中止 | 把「登录链」表达为数据（顺序+参与运行开关），可离线回放；失败即止避免用脏状态续链 |
| D-11 | 响应二进制 | 识别二进制响应体，走「另存为」落盘而非文本渲染 | 下载文件场景（内网附件）不损坏数据 |
| D-12 | 视觉语言 | 「墨水与纸」令牌系统：暖纸底+邮局松绿身份色、圆角 6/10/14 刻度、弃用全大写标签、机器数据（URL/方法/耗时）一律 mono+tabular-nums、方法色借用状态语义色（GET=绿/POST=蓝/PUT=琥珀/PATCH=紫/DELETE=红）、全局 :focus-visible、prefers-reduced-motion 降级 | 离线-first 禁止 webfont，字体纪律在系统栈内解决；键盘焦点与动效降级是可达性地板（前端设计评审 2026-10-29 落实） |
