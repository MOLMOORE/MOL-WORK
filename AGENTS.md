# MOL-WORK 项目协作规则

本文件只保存 MOL-WORK 特有的长期规则。全局通用规则继承
`~/.codex/AGENTS.md`；本文不重复其 PowerShell/Bash/WSL、编辑方式选择、UTF-8、
多 Agent、子 agent 恢复台账、外部资料核验和“用户说法先核实”等条款。

## 0. 开工顺序

任何任务先读本文件；改代码前还必须按顺序读：

1. `docs/feature-index.md`：定位本次功能涉及的文件与符号，避免整仓扫描。
2. `docs/modifications/by-feature/<对应功能线>.md`：只读相关的一到两篇，
   查看根因、上次改法和遗留风险。

功能名不确定时，先通过 `docs/feature-index.md` 定位功能线；不要遍历整个
`docs/modifications/`，也不要全仓 grep 往届改动。做 Issue、规格或领域文档工作时，
按下方指针读取相应说明。

## 1. 项目技术栈与硬约束

- Electron 37 + React 18 + TypeScript 5 + Vite 5（electron-vite 三入口）。
- 数据层使用 Electron 内置 `node:sqlite`，WAL + 外键 + FTS5，无原生模块。
- 渲染层来源是 `file://`；pdf.js 使用 legacy 构建和主线程假 worker。
- 样式使用 Tailwind 3.4；新增组件样式走主题令牌，不写死颜色。
- 项目文本文件保持 UTF-8 无 BOM、CRLF 换行。

外部资料先核验是否适用于上述版本和运行环境；关键结论在提交信息或注释中留下
库名、规范名等出处线索，不必粘贴完整链接。

## 2. 版本与日志

- 每个发布版本都必须保留更新信息，新版本追加在最上方。
- 同一份版本日志必须同步到两处：
  - 根目录 `CHANGELOG.md`；
  - `src/renderer/src/pages/SettingsPage.tsx` 的应用内 `CHANGELOG` 常量。
- 日志随版本代码一起提交，写到用户能看懂“做了什么、新增了什么”。
- `package.json` 的 `version` 与发布产物文件名、README 示例保持同步。

## 3. 检查与验证分级

总原则：在保证基本稳定的前提下优先效率。默认只做基础检查，不默认跑全套验证；
用户明确要求“完整验证 / 验收 / 全跑一遍”时才升级到最高档。

### 3.1 档位

| 档位 | 内容 | 何时执行 |
| --- | --- | --- |
| **L0 静态** | 回读改动文件并定点断言；替换类改动断言唯一命中；代码/文案改动运行一次 `npm run build` | 代码或应用内文案改动 |
| **L1 针对性** | 主进程/IPC：按需 `npm run check-tools`；打包配置/图标/资源：`npm run dist` 后回读产物；数据层：确认迁移可追加且现有库可打开，不重建数据 | 改动命中对应区域 |
| **L2 端到端** | `npm run selftest`、打包产物自检、CDP 真实窗口交互回归 | 仅出厂复验、用户明确要求、L0/L1 有无法解释的异常，或改动调度器/复习引擎/统计聚合/数据库迁移等核心逻辑 |

### 3.2 最小检查表

| 改动类型 | 最少检查 |
| --- | --- |
| 纯 Markdown / 规则文档 | `npm run check-docs`；需要机械修复换行时先运行 `npm run fix-docs` |
| 纯应用文案 / 样式 / 局部组件 | `npm run build` |
| 新增或修改 IPC 契约 | `npm run build`，并确认 `shared/types/ipc.ts`、preload、`ipc/*.ipc.ts` 三处同步 |
| 数据库迁移 | `npm run build`；迁移已在 `db/migrations/index.ts` 注册；不改历史迁移 |
| 工具 runner / 依赖解析 | `npm run build`；需要时 `npm run check-tools` |
| 图标 / 打包资源 / electron-builder 配置 | `npm run dist` 并回读产物资源 |
| 发布新版本 | 按第 4 节流程执行，L1 为最低要求 |

### 3.3 防止过度检查

- 不重复跑同一套检查；`selftest` 和 `dist` 在一次任务中默认各不超过一次。
- 不用整仓扫描定位局部问题，不重复读取已进入上下文的文件。
- 不为一行改动跑端到端回归；证据不足时先补 L0 证据，不靠增加测试量猜测。
- 仅当问题集中在浏览器 DOM 行为（滚动范围、事件坐标、层叠上下文、zoom 换算）
  且已反复返工时，允许在 `work/patch/` 建最小 HTML + Playwright 复现页取证一次。
- 连续两次尝试仍无法解释失败时，停止盲试并报告卡点。

### 3.4 时间预算

- 普通修改：不超过一次构建 + 一次回读复核。
- 涉及打包：额外不超过一次 `dist`。
- 一次任务中的 L2 验证不超过一轮。
- 用户明确要求多测时，以用户要求为准。

## 4. 版本发布固定流程

1. 更新 `package.json` 的 `version`；必要时同步 README 的产物文件名示例。
2. 在 `CHANGELOG.md` 顶部和应用内 `CHANGELOG` 常量顶部追加同一版本日志。
3. 运行 `npm run dist`；用
   `gh release upload v{version} <file> --clobber` 上传安装包、`.blockmap` 与 `latest.yml`；
   核对 GitHub 资产和本地文件的大小、sha256 一致后，再删除上一版本本地产物。
4. `release/` 本地保留**当前最新版**的安装包、`.blockmap` 和 `latest.yml`。
   打包完成后把 `win-unpacked/` 内容复制到 `C:\Users\15008\Desktop\testarea\` 做真实启动烟测；
   烟测通过后删除 `release/win-unpacked/` 和旧的 testarea 冗余副本，避免直接在工作区 ACL 中运行。
   历史版本以 GitHub Releases 为唯一权威副本，`release/archive/` 不再使用。
5. 提交版本变更并创建 `v{version}` 标签；提交信息写明修改与新增内容。

## 5. 功能索引与修改记录

### 5.1 `docs/feature-index.md`

- 全项目“功能 / 界面 → 文件 → 符号”索引，按模块分类。
- 改动前定位文件，改动后立即补充新增、改名或搬走的条目。
- 只写“去哪儿找”，不写实现细节和历史；保持在一百多行内。

### 5.2 `docs/modifications/`

- `by-version/`：按版本和轮次保存，一次提交一篇，与提交信息对应。
- `by-feature/`：按功能线保存，历次改动追加在篇首，最新内容在最上面。
- 每篇统一使用“需求 / 根因 / 改法 / 位置 / 参考 / 验证 / 遗留”小标题。
- 代码任务结束前完成三件事：`by-version` 一篇、受影响的 `by-feature` 条目、
  `feature-index` 校准。
- 文档顺序与容量上限以 `docs/modifications/README.md` 为准；提交前运行
  `npm run check-docs`，超过上限时按归档规则拆分，保持一篇文档只有一个关注点。

## 6. Issue tracker 与领域文档

### Issue tracker

Issues 与 specs 记录在 GitHub 仓库 `MOLMOORE/MOL-WORK`，全部操作使用 `gh` CLI。
详细约定见 `docs/agents/issue-tracker.md`。

### Domain docs

Single-context 项目：优先读取根目录 `CONTEXT.md` 和 `docs/adr/`。
详细读取与术语规则见 `docs/agents/domain.md`。

## 7. 继承全局规则

- 终端与 shell 选择：继承全局 `Shell selection`；本项目构建和发布命令按第 3、4 节执行。
- 文件编辑方法：继承全局 `Edit method selection`；手写文本优先 `apply_patch`。
- 编码与换行：继承全局 UTF-8 无 BOM 规则；本项目现有文本使用 CRLF。
- 多 Agent：继承全局 `Sub-agent delegation policy` 和 `Subagent resume ledger`。
  主线负责整合、按第 3 节验证、文档收尾和 git 提交，子 agent 不执行 git add/commit。
- 项目文档优先与外部资料核验：继承全局 `Project rule docs first`；本文第 0、1、5 节是
  MOL-WORK 的具体执行顺序。
