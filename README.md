# Markdown 编辑器

一款适用于飞牛 fnOS 的 Markdown 文件编辑器，可直接从文件管理器打开并编辑 `.md` 和 `.markdown` 文件。

## 功能特性

- Markdown 编辑与实时预览
- 手动保存，60 秒无操作自动保存
- 支持 PNG、JPEG、GIF 和 WebP 图片上传及拖放插入
- 自动适配 fnOS 的浅色/深色主题

## 使用方法

1. 在 fnOS 应用中心手动安装构建好的 FPK 文件。
2. 在文件管理器中选择 `.md` 或 `.markdown` 文件。
3. 右键选择“打开方式”，然后选择“Markdown 编辑器”。

建议前往“系统设置 → 应用 → 默认应用”，搜索 `.md`，将本应用设置为默认打开方式。

> 本应用是文件关联型微应用，默认不会单独显示桌面图标。未指定 Markdown 文件时，应用不会进入编辑界面。

## 运行要求

- 飞牛 fnOS
- Node.js v22（由 FPK 的 `install_dep_apps` 自动声明）
- 支持安装第三方 FPK 应用的设备

## 本地开发

项目采用 npm workspaces 管理前后端代码：

- 前端：React 19、TypeScript、Vite、md-editor-rt
- 后端：Node.js 22、Express 5、TypeScript

准备 Node.js 22 和 npm，然后在项目根目录执行：

```bash
npm install
npm run typecheck
npm run build
```

常用命令：

```bash
# 检查前后端 TypeScript 类型
npm run typecheck

# 仅构建前端
npm run build:frontend

# 仅构建后端
npm run build:backend

# 构建可供 FPK 打包的应用目录
npm run build:app

# 清理构建产物
npm run clean
```

执行 `npm run build:app` 后，整理完成的应用目录位于 `build/package`。

## 构建 FPK

构建机器需要安装并配置可直接调用的 `fnpack`。然后执行：

```bash
npm run build:fpk
```

构建流程会依次完成以下工作：

1. 清理旧产物并检查必要文件。
2. 执行前后端类型检查和生产构建。
3. 将前端、后端及 fnOS 配置整理到 `build/package`。
4. 安装后端生产依赖。
5. 调用 `fnpack build` 生成 FPK 安装包。

## 项目结构

```text
md-editor-fn/
├─ app/          # fnOS 桌面入口及图标配置
├─ backend/      # Express 后端、文件读写与权限校验
├─ cmd/          # fnOS 应用生命周期脚本
├─ config/       # fnOS 权限与资源声明
├─ frontend/     # React Markdown 编辑界面
├─ scripts/      # 构建与 FPK 打包脚本
├─ manifest      # fnOS 应用基本信息和依赖声明
├─ ICON.PNG
└─ ICON_256.PNG
```

## 文件与图片限制

- 仅支持 `.md` 和 `.markdown` 文件。
- Markdown 文件必须是有效的 UTF-8 编码。
- 单个 Markdown 文件最大为 20 MB。
- 图片支持 PNG、JPEG、GIF 和 WebP 格式。
- 单张上传图片最大为 10 MB。

上传的图片由应用保存，并自动把对应的 Markdown 图片语法插入当前光标位置。

## 权限说明

应用默认以 fnOS 分配的应用账户运行，不要求 root 权限。打开或保存文件时，会根据当前登录用户的 fnOS 文件权限进行校验；没有写入权限的文件将以只读模式打开。

应用使用以下 fnOS API 权限：

- `trim.file.userAccess`
- `trim.file.userAcl`
- `trim.file.path`

## 应用信息

- 应用标识：`md-editor-fn`
- 当前版本：`0.1.12`
- 维护者：[HoChienkuo](https://github.com/HoChienkuo)

