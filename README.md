# MOL-WORK 个人工作站

一款本地优先的 Windows 桌面工作站，把任务、日程、番茄钟、资料阅读、复习、统计分析、全局搜索和常用工具集中在一个程序里。没有账号系统，没有云端依赖，业务数据保存在本机 SQLite 数据库中。

[![Latest Release](https://img.shields.io/github/v/release/MOLMOORE/MOL-WORK?label=release)](https://github.com/MOLMOORE/MOL-WORK/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4)](https://github.com/MOLMOORE/MOL-WORK/releases/latest)
[![Electron](https://img.shields.io/badge/Electron-37-47848F)](https://www.electronjs.org/)
[![License](https://img.shields.io/github/license/MOLMOORE/MOL-WORK)](LICENSE)

## 下载

当前版本：**v1.3.0**

- [下载最新 Windows 安装包](https://github.com/MOLMOORE/MOL-WORK/releases/latest)
- [查看完整更新日志](CHANGELOG.md)
- [查看功能文件索引](docs/feature-index.md)

安装包未做代码签名，Windows SmartScreen 第一次运行时可能显示“未知发布者”。确认文件来自本仓库 Releases 后，可以选择继续运行。

## 主要功能

### 任务与日程

- 项目、课程或一般事项分组，支持优先级、进度、截止时间、标签和备注
- 列表与看板视图，删除后进入回收站，可在保留期内恢复
- 月视图和周视图日历，任务可安排到具体日期并设置提醒
- 记录任务延期、逾期和完成超时，统计页给出拖延时长与严重程度
- 后台调度器负责补发错过的提醒，并在窗口失去焦点时使用系统通知

### 笔记、资料与阅读器

- Markdown 笔记编辑与实时预览，资料可以关联任务、项目和复习计划
- 支持 PDF、Word、PowerPoint、Excel、EPUB、HTML、Markdown、纯文本、CSV 和常见源代码格式
- 文档按格式选择书页、富文本或可编辑文本模式，渲染件保存在本地书库
- 阅读器支持单页、双页、连续模式，多档缩放和五种翻页动画
- 目录、缩略图、全文查找、书签、重点页、文字高亮、页面圈画和旁注
- 自动保存阅读进度、阅读时长、笔记排序和批注位置

### 复习

- 保存笔记后可生成复习计划
- 支持 SM-2 自适应间隔和艾宾浩斯固定间隔
- 到期复习可自动排入次日日程并发送提醒
- 复习评分、掌握程度和历史间隔保存在 SQLite 中

### 番茄钟与统计

- 工作、短休息、长休息三种阶段，可自定义时长和节奏
- 专注结束后写入专注记录，统计每日时长、时段分布和近 7 天趋势
- 汇总任务完成、复习、工具调用、项目投入与拖延情况
- 支持每日报告预览、Markdown 导出和文件定位

### 工具集

内置 16 个工具，工具清单同时驱动页面表单、依赖检测、运行历史和质量检查：

| 分类 | 工具 |
| --- | --- |
| 媒体转换 | 图片转换、音频转换、视频转换 |
| 文档与网页 | 文档转换、文件下载与整理、网页与截图提取 |
| 单位与电路 | 单位换算、电路常用计算、滤波电路速算、滤波电路仿真 |
| 器件与工程 | 运放比较器、整流滤波、555 定时器、PCB 走线、交流波形、阻抗匹配 |

所有工具运行都会记录输入摘要、耗时、状态、结果路径和错误信息。图片、音频、视频和文档转换支持文件拖入与多文件批量处理。

## 外部依赖下载

基础任务、资料阅读、统计和内置计算工具不需要额外安装外部程序。格式转换、音视频处理和网页提取会按需调用外部工具。

设置页的“外部工具依赖”和工具页依赖面板支持逐项下载：

| 依赖 | 软件内处理方式 |
| --- | --- |
| FFmpeg | 下载官方 Windows essentials 包，SHA-256 校验后解压到 `<userData>/bin` |
| yt-dlp | 下载 GitHub 最新版，SHA-256 校验后保存到 `<userData>/bin` |
| Pandoc | 从 GitHub Release 获取 Windows 包，校验并解压 `pandoc.exe` |
| Playwright Chromium | 调用随应用分发的 Playwright CLI 下载浏览器 |
| LibreOffice | 下载官方 Windows MSI，校验后由用户打开安装 |
| pdf2docx | 打开 PyPI 安装说明，需要 Python 3.10 或更高版本 |

便携依赖下载完成后会自动重新检测。下载过程提供百分比、文件大小、速度和取消操作。

软件查找外部程序时依次检查：

1. `<userData>/bin`
2. 系统 `PATH`
3. winget 链接目录
4. pip 脚本目录
5. Python 包内部附带的二进制
6. LibreOffice 的常见安装目录

## 全局搜索与界面

- 使用 SQLite FTS5 trigram 索引搜索任务、笔记、复习、日程、项目和工具
- 少于 3 个字符时自动回退到 `LIKE` 查询
- 页面由可拖拽、可缩放的模块组成，可保存自定义布局
- 提供 8 款界面皮肤和 5 套默认配色，均支持深色与浅色模式
- 时钟模块支持翻页、极简、秒环、指针、点阵、堆叠和终端风格
- 应用内字号、字重、宽高、日期格式和字距均可调整

## 技术架构

```text
React 页面 (renderer)
        │
        │ window.api
        ▼
preload / contextBridge
        │
        │ ipcRenderer.invoke
        ▼
Electron 主进程 (main)
        │
        ├─ services：业务规则、文件与外部进程
        ├─ repositories：SQL 和数据映射
        ├─ IPC handlers：统一参数与错误信封
        └─ scheduler / updater / tray
        │
        ▼
SQLite + 本地文件
```

- `src/main` 运行在 Node.js 环境，负责窗口、数据库、文件、调度器和自动更新
- `src/preload` 通过 `contextBridge` 暴露受限 API，页面不能直接访问 Node.js
- `src/renderer` 使用 React 构建页面、状态和交互
- `src/shared` 保存三层共用的领域类型、IPC 契约和常量
- `contextIsolation` 开启，`nodeIntegration` 关闭

| 层 | 技术 |
| --- | --- |
| 桌面容器 | Electron 37 |
| 构建 | electron-vite 2、Vite 5 |
| 界面 | React 18、TypeScript 5、Zustand 5 |
| 样式 | Tailwind CSS 3.4、主题 CSS 变量 |
| 数据库 | Electron 内置 `node:sqlite`、WAL、外键、FTS5 |
| 图表 | Recharts |
| 文档处理 | PDF.js、PDF-lib、JSZip、fast-xml-parser |
| 外部引擎 | FFmpeg、yt-dlp、Pandoc、LibreOffice、pdf2docx、Playwright |

## 数据与隐私

默认数据目录：

```text
%APPDATA%\personal-workstation\
```

| 内容 | 路径 |
| --- | --- |
| 数据库 | `workstation.db` |
| 日志 | `logs\workstation-YYYY-MM-DD.log` |
| 工具输出 | `outputs\` |
| 日报 | `reports\` |
| 笔记书库 | `library\<noteId>\` |
| 托管外部程序 | `bin\` |
| 下载的安装包 | `downloads\` |

任务、笔记、复习、日程、专注和工具历史都保存在同一个 SQLite 文件中。PDF、Word、HTML 等大文件保存在书库目录，数据库只记录路径和结构化信息。

软件不包含账号、遥测或云端同步。网络只用于用户主动触发的资源下载、工具运行和应用更新。

## 本地开发

建议使用 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

常用检查命令：

```bash
npm run build       # 构建主进程、preload 和渲染层
npm run check-docs  # 检查项目文档格式
npm run check-deps  # 测试依赖下载解析、本地下载和取消
npm run check-tools # 检测外部工具是否可用
npm run selftest    # 执行工具集端到端自检
npm run dist        # 生成 Windows NSIS 安装包
```

如果 npm 拦截了依赖安装脚本，可执行：

```powershell
npm install-scripts approve electron
npm install-scripts approve esbuild
```

## 打包与发布

```powershell
npm run dist
```

产物写入 `release/`：

- `PersonalWorkstation-Setup-{version}.exe`
- `PersonalWorkstation-Setup-{version}.exe.blockmap`
- `latest.yml`

发布流程会同步更新 `package.json`、`CHANGELOG.md` 和应用内版本日志，然后推送 `develop`、`main` 与版本标签，并上传 GitHub Release 资产。

应用启动约 12 秒后自动检查 GitHub 最新正式 Release，通过 `api.github.com` 读取 Release 和 `latest.yml`。发现新版本后由用户确认下载，下载完成可重启安装。

## 项目结构

```text
src/
  main/       Electron 主进程、数据库、服务、IPC、工具 runner
  preload/    contextBridge API
  renderer/   React 页面、组件、状态和样式
  shared/     共享类型、IPC 契约和常量
docs/
  feature-index.md
  modifications/
  superpowers/
build/        图标与 NSIS 安装脚本
scripts/      文档、工具、自检和打包辅助脚本
release/      当前版本的安装包与更新元数据（Git 忽略）
out/          构建产物（Git 忽略）
```

## 已知边界

- 当前正式安装包只提供 Windows x64 版本
- 扫描版 PDF 没有 OCR，全文查找无法识别图片中的文字
- Word、PowerPoint、Excel 的原版式渲染依赖 LibreOffice 或 Microsoft Office
- pdf2docx 依赖本机 Python 环境
- 安装包尚未配置 Windows 代码签名
- 应用内下载能否完成取决于对应官方站点和本机网络
- 数据库迁移会就地升级旧数据库；升级前请保留数据目录备份

## 许可证

本项目使用 [MIT License](LICENSE)。
