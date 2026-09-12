# 个人工作站（Personal Workstation）

一款完全本地运行（local-first）的集成化个人工作站桌面软件，面向学习与项目场景。
以「任务」为核心实体，把**任务管理中枢**、**可插拔工具集**与**统计复盘**三层数据打通成一条闭环：

> 任务 → 关联日程 / 提醒 / 进度 / 专注时长
> 任务 → 笔记资料 → 遗忘曲线复习计划 → 到点自动排入次日日程 → 系统通知
> 工具执行 → 记录操作内容 / 耗时 / 结果存放位置 → 回流统计层 → 日报与投入分布

---

## 一、当前进度（分三阶段交付，每阶段交付可运行版本）

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| **阶段一** | 工程骨架 · SQLite 数据层 · 任务中枢 · 笔记与遗忘曲线 · 日程与提醒 · 全局搜索 | ✅ **已完成，可验收** |
| **阶段二** | 可插拔工具集（工具集市界面 + pandoc / ffmpeg / yt-dlp / Playwright 真实集成与调试） | ✅ **已完成，可验收** |
| **阶段三** | 统计复盘可视化（趋势图 / 环形图 / 日报导出界面）与 Windows 打包分发 | ✅ **已完成，可验收** |

阶段一已实现且**已通过端到端验证**的能力：

- 任务 CRUD、项目/课程分组、优先级、进度、截止时间、标签、看板与列表双视图
- 任务详情抽屉：日程 / 提醒 / 笔记资料 / 专注记录 / 复习 五个子面板
- 笔记与资料（Markdown 编辑 + 实时预览），保存即自动生成遗忘曲线复习条目
- 遗忘曲线引擎：**SM-2 自适应**（ease / interval / repetitions / lapses / stage）与**艾宾浩斯固定间隔**两种模式可切换
- 自研月视图 / 周视图日历，事件按类型着色，待排任务一键排期
- 主进程 30 秒轮询调度器 + **Electron 系统通知**，启动时自动补算错过的提醒
- 复习到期自动排入次日日程（每日到达设定时刻后触发一次）
- 顶栏常驻**全局搜索**：FTS5 trigram 分词，支持中文子串模糊检索任务 / 笔记 / 复习 / 日程 / 项目 / 工具
- 深色优先的现代工作台 UI，支持浅色模式切换

阶段二已实现且**已通过端到端验证**的能力：

- **工具集市**：工具卡片 + 分类筛选 + 关键词搜索，表单按 manifest 字段类型自动渲染（文本／数值／下拉／复选／路径／多行）
- **动态选项**：`optionsSource` 让「归属任务」「项目」等下拉在运行时从数据库实时填充
- **依赖状态面板**：Pandoc / FFmpeg / yt-dlp / Playwright 的可用性、版本与**实际解析到的可执行文件路径**，可一键在文件夹中定位
- **四个真实外部引擎**（全部跑通真实调用）
  - 格式转换：Pandoc 文档互转（md / docx / html / txt / epub / odt / tex）、FFmpeg 音视频互转（mp3 / wav / m4a / mp4 / gif / webm）
  - 下载整理：yt-dlp 下载归档，自动探测 FFmpeg 位置以支持合流与转码
  - 网页提取：Playwright 无头浏览器渲染后提取正文为 Markdown，或保存可视区／整页 PNG
  - 修复：PDF 不再作为 Pandoc 输入／输出选项（需 LaTeX 引擎，避免必然失败的组合）
- **运行记录**：每次执行记录输入摘要、耗时、状态、结果路径与错误；结果支持「打开文件」「在文件夹中显示」
- **工具治理**：启用／停用开关、移除工具、一键恢复内置工具
- **路径选择器**：path 字段可直接调起系统文件／目录选择对话框
- **自检脚本**：`npm run selftest` 以主进程身份真实执行全部工具并输出结构化结果（隔离数据目录，不污染真实数据）

阶段三已实现且**已通过端到端验证**的能力：

- **趋势可视化**（recharts）：投入趋势（专注时长面积图 + 工具耗时折线）、产出趋势（完成任务／复习柱状图 + 工具调用折线）、单日 24 小时时段分布
- **区间控制**：7 / 14 / 30 / 90 天一键切换，支持前后翻页与「回到今天」
- **环形图**：项目／课程投入占比（中心显示总投入），工具调用类别占比（附执行成功率）
- **拖延分析**：严重度分布条形图 + 可点击跳转到任务详情
- **日报导出界面**：结构化视图与 Markdown 渲染双视图、任意日期选择、一键导出到 `reports` 目录并自动定位文件
- **Windows 打包分发**：electron-builder + NSIS 生成安装包，打包产物已通过同一套自检脚本验证

---

## 二、技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 桌面容器 | Electron 37 | 主进程 / preload / 渲染进程三层，`contextIsolation` 开启、`nodeIntegration` 关闭 |
| 构建 | electron-vite 2 + Vite 5 | 三入口统一构建，主进程为 CJS |
| 渲染层 | React 18 + TypeScript 5 | 函数组件 + 自定义 Hooks |
| 样式 | Tailwind CSS 3.4 + 自建 UI 组件 | 玻璃拟态卡片、渐变强调、微动效 |
| 状态管理 | Zustand 5 | 按域拆分 store，无模板代码 |
| 本地数据库 | **`node:sqlite`**（Electron 内置） | 零原生依赖，WAL 模式 + 外键 + FTS5 |
| 全文索引 | SQLite FTS5 `trigram` 分词器 | 支持中文子串检索（< 3 字符自动退化为 LIKE） |
| Markdown | react-markdown + remark-gfm | 编辑 / 预览分栏 |
| 图表 | recharts | 阶段三启用 |

### 关于数据库选型的重要调整

原计划使用 `better-sqlite3`，但该模块需要本机具备 **Visual Studio C++ 生成工具**进行原生编译，当前环境未安装（实测 `node-gyp` 报 `Could not find any Visual Studio installation to use`）。

因此改用 **Electron 37 内置的 `node:sqlite`**（Node 22.21.1 模块）：

- 零原生编译、零 ABI 匹配问题，安装依赖后即可直接运行
- 实测 SQLite 版本 3.50.4，**FTS5 与 trigram 分词器均可用**，中文子串搜索正常
- API 为同步风格（`DatabaseSync` / `StatementSync`），仓储层写法与原方案基本一致

如需切回 `better-sqlite3`，只需安装 MSVC 生成工具后替换 `src/main/db/connection.ts` 与 `src/main/db/query.ts` 两个文件。

---

## 三、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（热更新）
npm run dev

# 3. 生产构建
npm run build

# 4. 本地运行构建产物
npx electron .

# 5. 检测工具集所需的外部依赖（与应用内解析逻辑一致）
npm run check-tools

# 6. 工具集端到端自检（真实调用 pandoc / ffmpeg / yt-dlp / Playwright）
npm run selftest

# 7. 打包 Windows 安装包（输出到 release/）
npm run dist
```

首次启动会自动写入一批**示例数据**（4 个课程/项目、8 个任务、3 篇笔记与对应复习计划、日程与专注记录），
便于立刻体验「任务 → 笔记 → 复习 → 日程 → 提醒」的完整闭环。示例数据仅在任务表为空时写入。

### 数据存放位置

| 内容 | 路径 |
| --- | --- |
| 数据库 | `%APPDATA%\personal-workstation\workstation.db` |
| 日志 | `%APPDATA%\personal-workstation\logs\workstation-YYYY-MM-DD.log` |
| 工具输出 | `%APPDATA%\personal-workstation\outputs\` |
| 日报导出 | `%APPDATA%\personal-workstation\reports\` |

以上目录均可在「设置 → 数据与维护」中一键打开。

---

## 四、外部依赖（工具集使用）

工具集中的「格式转换 / 下载整理 / 网页截图提取」需要调用外部程序。

### 解析顺序（主进程与 `npm run check-tools` 完全一致）

应用**不要求这些程序必须在系统 PATH 中**，会按以下顺序自动定位可执行文件，并在「设置页 / 工具集市」显示最终解析结果：

1. 工作站托管目录 `<userData>/bin`（优先级最高，可手动放置绿色版程序）
2. 系统 `PATH`（`where` / `which`）
3. winget 软链目录 `%LOCALAPPDATA%\Microsoft\WinGet\Links`
4. pip 脚本目录 `%APPDATA%\Python\Python3XX\Scripts`
5. Python 包自带二进制：`pypandoc/files/pandoc.exe`、`imageio_ffmpeg/binaries/ffmpeg-*.exe`

### 安装方式

优先使用官方渠道：

```powershell
winget install --id JohnMacFarlane.Pandoc
winget install --id Gyan.FFmpeg
winget install --id yt-dlp.yt-dlp
npx playwright install chromium
```

若所在网络无法访问 GitHub Releases（winget 安装会报 `InternetOpenUrl() failed`），可改用 PyPI 渠道（第 4 / 5 条解析规则正是为此准备）：

```powershell
pip install --user yt-dlp imageio-ffmpeg pypandoc_binary
```

当前开发环境实测结果（`npm run check-tools`）：

```
pandoc      可用      pandoc 3.9
                      ...\site-packages\pypandoc\files\pandoc.exe
ffmpeg      可用      ffmpeg version 7.1-essentials_build-www.gyan.dev
                      ...\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe
yt-dlp      可用      2026.08.19
                      ...\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe
playwright  可用      ...\ms-playwright\chromium-1243\chrome-win64\chrome.exe
------------------------------------------------------------------------
全部依赖可用，工具集可以完整运行。
```

**依赖缺失不会影响其它功能**：工具只有在实际执行时才会调用这些程序，缺失时返回带安装指引的可读错误，并同样记入运行历史。

---

## 五、架构

```
渲染进程 (React + TS + Tailwind)
  pages / components / zustand stores
        │  window.api（typed 契约）
预加载层 (preload)
  contextBridge 白名单，逐方法封装 ipcRenderer.invoke
        │
主进程 (Node)
  ipc/*.ipc.ts        各域 IPC 处理器（统一 try/catch 信封，异常不致命）
  services/           调度器 · 复习引擎 · 统计 · 报表 · 概览 · 搜索 · 工具宿主
  tools/              registry + runners（manifest 驱动，插件化扩展）
  db/repositories/    纯 SQL 仓储层
  db/migrations/      基于 PRAGMA user_version 的顺序迁移
  db/connection.ts    node:sqlite 单例（WAL + 外键 + busy_timeout）
        │
  SQLite (workstation.db) ── FTS5 search_index
```

### 数据模型

`projects` · `tasks` · `notes` · `review_items` · `schedule_events` · `focus_sessions` · `tool_states` · `tool_runs` · `settings` · `search_index`(FTS5)

关键数据流：

- `notes` 保存 → `review_items` 按 SM-2 生成/更新 → 到期后写入 `schedule_events`（type=review）→ 调度器到点弹系统通知
- `tool_runs` 记录每次工具执行的输入摘要、耗时、状态、结果路径与错误 → 统计层按时间范围聚合
- 任意实体写入时同步维护 `search_index`，全局搜索零额外查询

### 新增一个工具（唯一扩展点）

```ts
// src/main/tools/runners/my-tool.runner.ts
export const myTool: ToolDefinition = {
  manifest: {
    id: 'my-tool', name: '我的工具', category: 'calc',
    description: '…', icon: 'Wrench', requires: ['pandoc'], builtin: true,
    fields: [ { name: 'input', label: '输入', type: 'text', required: true } ]
  },
  async run(payload, ctx) {
    return { ok: true, resultSummary: ctx.getString(payload, 'input') }
  }
}
```

把 runner 加入 `src/main/tools/registry.ts` 的数组即可，UI 表单、执行、耗时记录与统计回流全部自动生效。

---

## 六、目录结构

```
src/
├── main/
│   ├── index.ts                 应用入口、窗口、生命周期、渲染层错误回写、自检入口
│   ├── selftest.ts              工具集端到端自检（WORKSTATION_SELFTEST=1 时启用）
│   ├── ipc/                     8 个域处理器 + 统一起信封包装
│   ├── db/                      connection / query / mappers / migrations / repositories
│   ├── services/                settings · task · note · review · schedule · stats · report
│   │                            overview · search · tool · scheduler · bootstrap · bus
│   ├── tools/                   types · registry · runners/{6 个工具}
│   └── utils/                   logger · time · paths · command · binaries · dependency-check
├── preload/index.ts             contextBridge 白名单
├── shared/                      领域类型 · IPC 契约 · 常量
└── renderer/src/
    ├── App.tsx / main.tsx
    ├── components/              layout · ui · task · calendar · review · tool · stats
    ├── pages/                   Dashboard · Tasks · Calendar · Notes · Tools · Stats · Settings
    ├── stores/                  app · task · note · schedule · tool · stats
    └── lib/                     ipc · utils
```

### 工具集的两层解析

```
manifest.fields  ──►  渲染层按字段类型自动渲染表单（无需为每个工具写 UI）
manifest.requires ──►  依赖检测（utils/binaries 解析真实可执行文件路径）
runner.run()     ──►  执行并返回 outputs / preview / resultPath
                    ──►  tool_runs 记录耗时与结果 ──► 统计层聚合 ──► 环形图与日报
```

---

## 七、脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式启动（主进程改动自动重启，渲染层热更新） |
| `npm run build` | 构建主进程 / preload / 渲染层到 `out/` |
| `npm run check-tools` | 命令行检测外部依赖可用性与版本（与主进程同一套解析逻辑） |
| `npm run selftest` | 以主进程身份真实执行全部工具，输出结构化自检结果（数据写入系统临时目录） |
| `npm run dist` | 构建并用 electron-builder 打包 Windows NSIS 安装包到 `release/` |

> 说明：本机 `npm` 出于安全策略默认拦截依赖的 install 脚本，首次安装后若 Electron 二进制未下载，
> 可执行 `npm install-scripts approve electron` 与 `npm install-scripts approve esbuild`。

### Windows 打包

```powershell
npm run dist
# 产物：release\PersonalWorkstation-Setup-1.1.12.exe（约 94 MB，NSIS 可选安装目录）
```

若打包时无法访问 GitHub（electron-builder 需要下载 Electron 与 NSIS 二进制），可切换到国内镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

打包要点：

- 无原生模块（数据库使用 Electron 内置 `node:sqlite`），已设置 `npmRebuild: false` 跳过依赖重建
- `playwright` / `playwright-core` 通过 `asarUnpack` 解包到磁盘，打包后网页提取工具仍可正常启动 Chromium
- 应用图标：把 1024×1024 的 PNG 放到 `build/icon.png`，electron-builder 会自动转换为 `.ico`（缺省时使用 Electron 默认图标）
- 打包产物可直接用同一套自检验证：`$env:WORKSTATION_SELFTEST='1'; .\release\win-unpacked\个人工作站.exe`

---

## 八、自验证记录

| 项目 | 方式 | 结果 |
| --- | --- | --- |
| 类型与构建 | `npm run build`（主进程 / preload / 渲染层三入口） | ✅ 通过 |
| 外部依赖 | `npm run check-tools` | ✅ 4 / 4 可用 |
| 工具端到端 | `npm run selftest`（开发目录） | ✅ 9 / 9 通过 |
| 工具端到端 | 同一自检在 `release\win-unpacked` 打包产物内运行 | ✅ 9 / 9 通过 |
| 界面运行时 | 通过 CDP 连接真实 Electron 窗口遍历工具集市 / 统计页 | ✅ 0 渲染层错误，10 个图表渲染成功 |
| 日报导出 | 界面点击「导出日报」→ 落盘 + 定位文件 | ✅ 生成 `reports\日报-YYYY-MM-DD.md` |
| Windows 分发 | `npm run dist` | ✅ `release\PersonalWorkstation-Setup-1.1.12.exe`（约 94 MB） |

自检覆盖的 9 个用例：Markdown → DOCX（Pandoc）、DOCX → Markdown（Pandoc）、WAV → MP3（FFmpeg）、
单位换算、电路计算、学习卡片（联动复习计划）、网页正文提取（Playwright）、整页截图（Playwright）、网络资源下载（yt-dlp）。

### 已知边界

- 安装包未做代码签名，Windows SmartScreen 首次运行时可能提示「未知发布者」
- 应用图标为 Electron 默认图标（放入 `build/icon.png` 后重新打包即可替换）
- 网络视频下载能力取决于目标站点可达性；GitHub Releases 直连受限的环境请参考第四节改用 PyPI 渠道安装依赖
