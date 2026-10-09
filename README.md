# MOL-WORK

一款只在本地运行的个人工作站桌面软件，把学习、课程开发和日常项目要用的东西收在一个窗口里：
任务、日程、番茄钟、笔记与复习、格式转换工具、投入统计。没有账号，没有云端，数据全在一个 SQLite 文件里。

软件内部是一条闭环：任务挂上笔记，笔记生成复习计划，复习到点自动排进第二天的日程，调度器到点弹系统通知；
专注记录和工具执行记录回流到统计层，最后汇总成趋势图和日报。

## 功能

### 任务与日程
- 任务支持项目/课程分组、优先级、进度、截止时间、标签，列表与看板两种视图，删除进回收站可恢复
- 任务详情抽屉里能看到这条任务关联的日程、提醒、笔记资料、专注记录和复习条目
- 延期与拖延分析：记录每次改期，算出拖延时长、拖延程度，以及「进入逾期」「完成超时」这类事件
- 自研月视图与周视图日历，事件按类型着色，未排期的任务可以一键排进某天
- 主进程每 30 秒轮询一次提醒与日程，错过时间的提醒在下次启动时补发；窗口最小化或失焦时改用系统通知

### 笔记与复习
- Markdown 编辑配实时预览，笔记可以挂到某个任务上作为资料
- 导入外部文档成一本「书」：PDF、DOCX / DOC、PPTX / PPT、XLSX / XLS、EPUB、ODT / ODS / ODP、HTML、RTF、WPS、Markdown、纯文本、CSV / TSV、JSON 与常见源代码
- 按格式分三种读法，不再一律压成 Markdown：PDF / Office / OpenDocument 转成原版式书页（图片、表格、排版都在）并只读；网页与 EPUB 打包成自包含 HTML 按原排版成书；Markdown / TXT / 代码 / CSV 等文本类保留可编辑正文
- 解析与转换全部在本地完成：渲染件收进 `<userData>/library/<noteId>/`，原文件被移动或删除也照样能翻；缺 LibreOffice / Office 时自动退回「抽取文字」并说明代价
- 阅读界面是独立全屏页（`/reader/:id`）：页面自适应原文件尺寸，适宽 / 适页 / 100% 等比缩放，单页 / 双页 / 连续三种摆放，5 种翻页动效（直切、淡入、推移、覆盖、仿真翻书），键盘全套翻页与缩放
- 每份资料都像一本书：目录（PDF 书签 / HTML 标题 / Markdown 标题）、页面缩略图、全文逐页查找、书签、重点页、带原文摘录的页内注释，并自动记住读到第几页
- 支持一次多选、也可以把文件直接拖进笔记列表；自动识别 UTF-8 / GBK / UTF-16 编码，超长正文截断保护，可按一级标题把长文档拆成多条笔记，笔记里保留来源文件并可一键打开
- 保存笔记自动生成复习条目。复习引擎两种模式可选：SM-2 自适应（按 ease / interval / repetitions / lapses / stage 调间隔）和艾宾浩斯固定间隔
- 复习到期后自动写入次日日程，到点提醒，复习评分按五档回到曲线

### 番茄钟
- 专注与休息循环，环形进度盘，结束后写入专注记录并计入当日统计
- 页面带今日时段分布、每日番茄数与近 7 天专注趋势

### 工具集
内置 9 个工具，表单由工具清单自动渲染，执行结果和耗时都会记录：

| 工具 | 依赖 | 做什么 |
| --- | --- | --- |
| 文档转换 | Pandoc | md / docx / html / txt / epub / odt / tex 互转 |
| 图片转换 | FFmpeg | 常见图片格式互转 |
| 音频转换 | FFmpeg | mp3 / wav / m4a 等互转 |
| 视频转换 | FFmpeg | mp4 / gif / webm 等互转 |
| 文件下载与整理 | yt-dlp | 下载网络音视频并归档，需要合流时自动找 FFmpeg |
| 网页与截图提取 | Playwright | 无头浏览器渲染后抽取正文为 Markdown，或保存可视区/整页 PNG |
| 单位换算 | 无 | 长度、质量、面积、数据存储等常用单位 |
| 电路常用计算 | 无 | 阻抗、谐振频率、RC 时间常数等 |
| 学习卡片制作 | 无 | 录入问答，直接生成带复习计划的笔记 |

- 工具集市支持分类筛选与关键词搜索，工具可停用、移除，也可一键恢复内置
- 依赖状态面板显示每个外部程序是否可用、版本号、实际解析到的可执行文件路径，可在文件夹中定位
- 下拉选项能在运行时从数据库填充，比如「归属任务」这种
- path 类型字段可以直接调起系统文件/目录选择框
- 每次执行都记录输入摘要、耗时、状态、结果路径与错误，结果能打开文件或定位到文件夹

### 统计与日报
- 投入趋势：每天专注时长与工具耗时的面积图、折线图
- 产出趋势：每天完成任务数、复习条数的柱状图，叠加工具调用折线
- 单日时段分布：24 小时每小时的专注与工具调用
- 环形图：项目/课程投入占比、工具调用类别占比（附执行成功率）
- 拖延分析：严重度分布，点条目直接跳到任务详情
- 区间能在 7 / 14 / 30 / 90 天之间切换，支持前后翻页与回到今天
- 日报有结构化视图和 Markdown 视图，可导出到 reports 目录并自动定位文件

### 全局搜索
顶栏常驻搜索框，用 SQLite FTS5 的 trigram 分词做中文子串检索，覆盖任务、笔记、复习、日程、项目、工具六类结果，少于 3 个字符自动退化为 LIKE。

### 界面布局与主题
- 页面由可拖拽、可缩放的模块方块组成，支持拖动排布、一键排列、清空、保存为自定义默认布局
- 时钟方块有数字翻转、极简、环形、指针、点阵、堆叠、终端等风格，横向纵向摆放和字形形状都能调
- 时钟的字号、笔画、宽高、字距、日期格式都按档位调节，不做无级滑块；笔画六档（细 / 常规 / 中等 / 半粗 / 粗 / 特粗）由内置可变字体驱动，每档都是真实字重
- 日期格式选「英文」时星期同步用英文显示，不出现中英混排
- 主题分两层，每款都能切深浅两种模式：
  - 主题皮肤（8 款并列，改的是界面结构）：默认主题、纸间杂志（顶部刊头 + 细线卡片 + 衬线正文首字下沉）、琉璃极光（悬浮胶囊侧栏 + 毛玻璃 + 流动极光底）、荧光终端（等宽 + ASCII 双线面板 + 行号侧栏 + 状态行 + 扫描线）、粗野主义（顶部块状标签 + 3px 描边 + 硬投影）、数据驾驶舱（窄图标侧栏 + 四角括号 + 网格底 + 遥测状态栏）、奶油拟物（无描边双向柔光浮雕 + 全圆角）、复古桌面（卡片带窗口标题栏 + 立体斜边 + 方块滚动条）
  - 默认主题下的风格（18 种，只改颜色与观感）：配色风格 10 种（素白简约、极简黑白、宣纸暖白、靛青、苔原、暮沙、石墨、午夜靛蓝、紫棠、墨绿夜色）+ 观感风格 8 种（Nord、Dracula、Gruvbox、Catppuccin、Tokyo Night、SynthWave、Neo-brutalism、CRT）
  - 皮肤靠 `[data-skin]` 重排外壳（导航位置、卡片造型、状态栏），风格靠 `[data-preset]` 换色与观感旋钮，两者互不串台；默认主题的显示效果与旧版一致
- 界面整体字号可调

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面容器 | Electron 37，contextIsolation 开启、nodeIntegration 关闭 |
| 构建 | electron-vite 2 + Vite 5，三入口分别构建主进程 / preload / 渲染层 |
| 渲染层 | React 18 + TypeScript 5，Zustand 5 按域拆分 store |
| 样式 | Tailwind CSS 3.4，配色走 CSS 变量令牌 |
| 存储 | Electron 内置 node:sqlite，WAL + 外键 + FTS5，无原生编译依赖 |
| 图表 | recharts |
| Markdown | react-markdown + remark-gfm |

## 快速开始

```bash
npm install         # 安装依赖
npm run dev         # 开发模式，主进程改动自动重启，渲染层热更新
npm run build       # 构建到 out/
npx electron .      # 本地运行构建产物
npm run check-tools # 检测工具集的外部依赖，与应用内解析逻辑同一套
npm run selftest    # 真实执行全部工具做端到端自检，数据写到系统临时目录
npm run dist        # 构建并打包 Windows 安装包到 release/
```

首次启动且任务表为空时，会写入一批示例数据（项目、任务、笔记与复习、日程、专注记录），方便直接看完整流程。

> 本机 npm 默认拦截依赖的 install 脚本。装完如果 Electron 二进制没下载下来，执行 `npm install-scripts approve electron` 和 `npm install-scripts approve esbuild`。

## 数据放在哪里

| 内容 | 路径 |
| --- | --- |
| 数据库 | `%APPDATA%\personal-workstation\workstation.db` |
| 日志 | `%APPDATA%\personal-workstation\logs\workstation-YYYY-MM-DD.log` |
| 工具输出 | `%APPDATA%\personal-workstation\outputs\` |
| 日报导出 | `%APPDATA%\personal-workstation\reports\` |
| 笔记书库 | `%APPDATA%\personal-workstation\library\<笔记 id>\document.pdf\|html`（导入资料的原版式渲染件） |

前四个目录能在「设置 → 数据与维护」里一键打开；书库随笔记删除自动清理。

## 外部工具依赖

只有格式转换、下载、网页提取这几个工具需要外部程序，软件不要求它们必须在系统 PATH 中，会按下面的顺序找：

1. `<userData>/bin`，工作站托管目录，优先级最高，可以手动放绿色版程序
2. 系统 PATH
3. winget 软链目录 `%LOCALAPPDATA%\Microsoft\WinGet\Links`
4. pip 脚本目录 `%APPDATA%\Python\Python3XX\Scripts`
5. Python 包自带的二进制：`pypandoc/files/pandoc.exe`、`imageio_ffmpeg/binaries/ffmpeg-*.exe`

安装用官方渠道：

```powershell
winget install --id JohnMacFarlane.Pandoc
winget install --id Gyan.FFmpeg
winget install --id yt-dlp.yt-dlp
npx playwright install chromium
```

访问 GitHub Releases 受限（winget 报 `InternetOpenUrl() failed`）时改走 PyPI，第 4、5 条解析规则就是为这种情况准备的：

```powershell
pip install --user yt-dlp imageio-ffmpeg pypandoc_binary
```

缺依赖不影响其他功能。工具只在真正执行时才调用外部程序，缺失时返回带安装指引的错误信息，同样记进运行历史。

## 打包发布

```powershell
npm run dist
# 产物：release\PersonalWorkstation-Setup-1.2.6.exe（约 96 MB，NSIS 可选安装目录）
```

electron-builder 需要下载 Electron 与 NSIS 二进制，网络不通时换国内镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

几个会影响打包结果的点：
- 数据库用的是 Electron 内置 node:sqlite，没有原生模块，配置里 `npmRebuild: false` 跳过依赖重建
- `playwright` / `playwright-core` 通过 `asarUnpack` 解包到磁盘，否则打包后起不了 Chromium
- 笔记导入依赖 `pdfjs-dist`（只保留 legacy 构建 + 中文字形映射 cmaps + 标准字体）、`jszip` 与 `fast-xml-parser`，其余目录已在 `files` 里排除，三项合计让安装包只增约 2 MB
- 阅读界面的 pdf.js 由 Vite 打进渲染层 bundle（含 worker 模块，走主线程假 worker），因此不依赖 asar 内的 worker 文件；中文字形映射仍从 asar 由主进程代读
- 图标是 `build/icon.png`（透明底）、`build/icon.ico`（7 个尺寸）和 `build/tray.png`（16×16 单色），改完执行 `npm run make-icon` 重新生成
- `build/installer.nsh` 在 customInstall 里刷新图标缓存，避免升级后桌面还是旧图标
- 打包产物也能跑自检：`$env:WORKSTATION_SELFTEST='1'; .\release\win-unpacked\个人工作站.exe`

## 版本与更新

完整历史更新日志见 `CHANGELOG.md`，软件内「设置 → 关于与版本」有一份相同的记录。

## 已知边界

- 扫描版 PDF（整页是图片）能正常翻阅与批注，但全文查找搜不到字——那需要 OCR
- 原版式书页依赖本机装有 LibreOffice 或 Microsoft Office（PDF、网页、EPUB 不依赖）；两者都没有时 Word / PPT / Excel 会退回「只抽文字」，版式与图片会丢
- 只读资料的正文仍会抽出来存着，用于全局搜索与列表摘要，但不能在应用里改原版式内容
- 超长正文按 30 万字上限截断；书库渲染件目前不自动清理，删除笔记时会连同它的书库目录一起删
- 安装包没有代码签名，Windows SmartScreen 第一次运行会提示未知发布者
- 网络下载能不能成功取决于目标站点可达性
- 数据库迁移按版本号顺序追加，打开旧数据文件时会就地升级并先备份
