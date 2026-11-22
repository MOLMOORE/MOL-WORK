# 工具依赖 · 应用内下载与配置

> 功能线速查：`services/dependency-download.*` + `components/tool/DependencyManager.tsx` + `app.ipc.ts` + `preload/index.ts`

## 2026-11-22 · v1.3.0（逐项下载、进度与自动配置）
- 需求：用户安装软件后不必另外搜索 FFmpeg、yt-dlp、Pandoc 和 Playwright Chromium，可在应用内选择需要的依赖并下载；LibreOffice 和 pdf2docx 保留人工安装步骤。
- 根因：原依赖面板只显示“未安装”和命令行安装指引，普通用户仍需自己辨认官网、压缩包和系统目录。
- 改法：
  - `dependency-download.service.ts` 从官方地址解析下载源；FFmpeg、yt-dlp、Pandoc 和 LibreOffice 安装包校验 SHA-256，FFmpeg/Pandoc 解压可执行文件到 `<userData>/bin`。
  - Playwright 使用随包分发的 `playwright/cli.js` 安装 Chromium，浏览器落在用户 Playwright 缓存。
  - LibreOffice 自动定位 stable 目录中的 Windows x86_64 主 MSI，保存到 `<userData>/downloads`，由用户运行安装。
  - pdf2docx 打开 Python 安装页，避免应用静默修改系统 Python。
  - `DependencyManager.tsx` 在设置页和工具页复用：勾选推荐项、单项下载、取消、进度/速度、打开安装包或结果位置。
  - 下载完成后清理依赖缓存并更新工具状态；失败保留已有依赖。
- 位置：
  - `src/main/services/dependency-download.helpers.ts`
  - `src/main/services/dependency-download.io.ts`
  - `src/main/services/dependency-download.service.ts`
  - `src/main/ipc/app.ipc.ts`
  - `src/preload/index.ts`
  - `src/renderer/src/components/tool/DependencyManager.tsx`
  - `src/renderer/src/pages/SettingsPage.tsx`
  - `src/renderer/src/pages/ToolsPage.tsx`
  - `src/shared/{constants.ts,types/ipc.ts}`
- 验证：
  - `npm run check-deps`：版本目录、压缩包成员、Pandoc 资产、LibreOffice 安装包、SHA-256 文本、本地 HTTP 下载和取消均通过。
  - 打包版从 `Desktop\testarea` 启动，依赖管理界面和 6 个状态项加载通过。
  - 打包版真实调用 `downloadDependency('yt-dlp')`，下载 23,575,744 字节并通过完成状态返回。
  - 两端 `tsc --noEmit` 0 错，`npm run build` 与 `npm run dist` 通过。
- 遗留：
  - LibreOffice 和 pdf2docx 不执行静默安装。
  - Playwright Chromium 的完整下载未在烟测中重复执行，当前本机已有完整浏览器缓存。
