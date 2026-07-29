# TinyPost

轻量本地 API 客户端：不上云、可内网离线使用，数据存本机 SQLite。

面向场景：
- Postman 过重 / 依赖云协作
- 纯 Web 客户端在无外网环境不好用
- Windows 与信创桌面（第一期：银河麒麟 aarch64）并存

## 技术栈

- 桌面壳：Tauri 2
- 前端：React + TypeScript + Vite
- 存储：SQLite（`sqlite:tinypost.db`，本机文件）
- HTTP：Rust `reqwest`（绕过 WebView CORS，适合内网调试）

## 本机开发（Windows x86_64）

### 前置依赖

1. Node.js 18+
2. Rust（rustup）
3. Windows 上需要 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（MSVC）
4. WebView2（Win10/11 一般已自带）

```bash
npm install
npm run tauri:dev
```

打包：

```bash
npm run tauri:build
```

产物通常在 `src-tauri/target/release/bundle/`。

## GitHub Actions 发版

仓库已配置：

| 工作流 | 触发 | 作用 |
|---|---|---|
| `CI` | push/PR 到 `master` | Windows 上类型检查 + 打包校验 |
| `Release` | 推送 `v*` 标签，或手动 `workflow_dispatch` | 构建并上传安装包到 GitHub Release（默认草稿） |

### 发一版

1. 确认 `package.json` 与 `src-tauri/tauri.conf.json` 的 `version` 一致（例如 `0.1.0`）
2. 合并要发布的代码到 `master` 后打标签：

```bash
git checkout master
git pull
git tag v0.1.0
git push origin v0.1.0
```

3. 在 GitHub Actions 查看 `Release` 流水线
4. 打开 Releases 里的 **draft**，检查产物后 Publish

### 产物矩阵（第一期）

| Runner | 目标 |
|---|---|
| `windows-latest` | Windows x86_64 |
| `ubuntu-24.04-arm` | Linux aarch64（给银河麒麟 aarch64 试用） |

说明：
- Linux 包在 Ubuntu ARM 上构建，**不是**在银河麒麟本机构建；目标机需自行验证 WebKit/依赖是否匹配。更稳的信创发版可后续加自托管麒麟 runner。
- 私有仓库使用 GitHub 托管 ARM runner 可能产生费用；若 ARM job 不可用，可把仓库设为 Public，或改为自托管。
- 当前未配置 Windows/代码签名，安装时可能提示未知发布者。

## 第一期目标平台

| 平台 | 架构 | 说明 |
|---|---|---|
| Windows | x86_64 | 日常开发与主流办公机 |
| 银河麒麟 | aarch64 | 信创内网机（鲲鹏/飞腾等） |

### 银河麒麟 aarch64 构建要点

建议在 **同架构的麒麟 aarch64 机器**（或对应 CI runner）上构建，避免复杂交叉编译。

1. 安装依赖（不同麒麟版本包名可能略有差异）：

```bash
sudo apt update
sudo apt install -y \
  build-essential curl wget file \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev
```

2. 安装 Rust / Node，然后：

```bash
npm install
npm run tauri:build
```

3. 产出 Linux 安装包（deb/rpm/AppImage，取决于本机打包器），通过内网 U 盘或制品库分发。  
   **运行期不访问外网**；首次发请求只连接用户填写的目标 API。

### 关于交叉编译

- Win x86_64 ↔ 麒麟 aarch64 交叉编译成本高（尤其 WebView/GTK）。
- 第一期推荐：**两条流水线 / 两台构建机**，分别出包。
- 龙芯 LoongArch 暂未纳入第一期。

## MVP 已具备

- 发送 REST 请求（方法 / URL / Headers / Body）
- 响应状态、耗时、Body / Headers 查看
- 请求历史写入本地 SQLite
- 可选「允许不安全证书」以适配内网自签证书

## 下一步（建议）

- 环境变量（`{{baseUrl}}`）
- 集合 / 收藏请求
- Postman Collection 导入
- 便携版目录布局（绿色免安装）
- 麒麟包自动化脚本

## 目录

```
TinyPost/
  src/                 前端
  src-tauri/           Rust / Tauri
  package.json
  README.md
```
