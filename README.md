# TinyPost

轻量本地 API 客户端：不上云、可内网离线使用，数据存本机 SQLite。

## 目标平台（第一期）

| 平台 | 架构 | 说明 |
|---|---|---|
| Windows | x86_64 | 日常开发 / 办公机 |
| 银河麒麟桌面 **V10 SP3** | aarch64 | 信创内网（鲲鹏 / 飞腾） |

## 技术栈

- 桌面壳：**Electron 32** + **electron-vite** + **electron-builder**
- 前端：React + TypeScript
- 打包：Vite 5 + `@rollup/wasm-node`（不用 Rollup 原生模块，麒麟 V10 / glibc 2.31 可本机 `npm run dev`）
- 存储：SQLite（`sql.js`，无原生模块，便于在 x86 CI 上打 arm64 包）
- HTTP：主进程 Node `http` / `https`

打包与麒麟适配对齐已验证项目 [cc-switch-arm64-kylin](https://github.com/xyztony999/cc-switch-arm64-kylin)：

- Wayland hint
- arm64 AppImage
- `scripts/pack-deb.sh` 打 `.deb`（绕开跨架构 fpm）
- 启动器默认 `--no-sandbox`

> 曾评估 Tauri 2，因其依赖系统 WebKitGTK 4.1，与麒麟桌面 V10 SP3 不兼容，故改用 Electron。

## 本机开发（Windows）

```bash
npm install
npm run dev
```

Windows 打包：

```bash
npm run dist:win
# 产物在 dist-installer/
```

## 麒麟 arm64 打包

```bash
npm run build
npx electron-builder --linux AppImage --arm64
bash scripts/pack-deb.sh
```

安装：

```bash
sudo dpkg -i tinypost_*_arm64.deb
# 或
chmod +x TinyPost-*.AppImage && ./TinyPost-*.AppImage
```

## GitHub Actions

| 工作流 | 触发 | 作用 |
|---|---|---|
| [ci.yml](.github/workflows/ci.yml) | `master` push / PR | `typecheck` + `build` |
| [release.yml](.github/workflows/release.yml) | `v*` 标签或手动运行 | Windows x64 + Linux arm64（AppImage/deb）→ **Draft Release** |

发版步骤：

1. 确认 `package.json` 版本号
2. 合并到 `master` 后打标签并推送：

```bash
git checkout master
git pull
git tag v0.1.0
git push origin v0.1.0
```

3. 在 Actions 查看 `Release`
4. 打开 GitHub Releases 草稿，检查产物后 Publish

## MVP 能力

- REST：方法 / URL / Headers / Body
- Auth：Bearer / Basic / API Key
- 环境变量：`{{baseUrl}}`、`{{token}}`
- 集合保存 + Postman Collection 导入
- 请求历史（本地 SQLite）
- 跟随系统的明/暗主题

## 目录

```
TinyPost/
  src/main/              Electron 主进程（HTTP + SQLite）
  src/preload/           contextBridge
  src/renderer/          React UI
  src/shared/            共享类型
  scripts/pack-deb.sh    麒麟 deb 打包
  electron-builder.yml
  .github/workflows/
```

## License

[MIT](LICENSE)
