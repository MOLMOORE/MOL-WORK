# 外部依赖内嵌下载设计

## 目标

让用户不必手动查找依赖，在工具页或设置页逐项选择需要的依赖并下载。基础应用继续支持离线使用，依赖下载只在用户主动点击后发生。

## 安装范围

- FFmpeg：下载官方 Windows essentials 压缩包，校验 SHA-256，解压 `ffmpeg.exe` 和 `ffprobe.exe` 到 `<userData>/bin`。
- yt-dlp：下载 GitHub 最新 `yt-dlp.exe`，校验 SHA-256 后放入 `<userData>/bin`。
- Pandoc：从 GitHub 最新 Release 选择 Windows x86_64 zip，解压 `pandoc.exe` 到 `<userData>/bin`。
- Playwright Chromium：调用随应用打包的 Playwright CLI，把浏览器安装到 Playwright 用户缓存。
- LibreOffice：解析官方 stable 下载目录，下载主安装包到 `<userData>/downloads`，由用户打开安装。
- pdf2docx：打开 Python 包安装页，并在界面保留安装命令。

## 用户流程

1. 依赖面板展示当前检测结果。
2. 用户勾选需要下载的便携依赖，或点击单项下载。
3. 主进程下载并报告进度、速度和结果。
4. 便携依赖下载完成后自动解压、校验并重新检测。
5. 安装包完成后提供“打开安装包”，用户安装后点击“重新检测”。

## 接口

- `app:get-dependency-downloads`：返回当前任务状态。
- `app:download-dependency`：开始单项下载。
- `app:cancel-dependency-download`：取消正在进行的下载。
- `app:open-external`：只允许打开 HTTP/HTTPS 地址。
- `event:dependency-download`：主进程推送下载状态。

## 错误与安全

- 下载先写 `.part` 文件，成功后再替换目标文件。
- 有校验文件的依赖在安装前核对 SHA-256。
- 同时只运行一个依赖下载任务。
- LibreOffice 和 pdf2docx 不执行静默安装。
- 下载失败不清空现有依赖。

## 验证

- 纯函数测试覆盖 zip 内可执行文件匹配、推荐依赖列表和版本目录选择。
- TypeScript 主进程与渲染层构建通过。
- 工具依赖检查脚本通过。
- 使用本地 HTTP 服务验证下载进度、文件写入和取消流程。
