# 转换工具 · 外部引擎与依赖探测

> 功能线速查：runners/doc-convert.runner.ts + convert-shared.ts + utils/{binaries,dependency-check}.ts + scripts/check-tools.mjs
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-16 · v1.2.7 第 11 轮（拖入文件按文档名成列显示）
- 需求：拖进来的文件要一列一列显示文档名，批量转换的进度也靠这一列看（第十轮的队列卡藏在表单下方、单个文件还不进队列，看不出拖了些什么）。
- 改法：左栏表单之上新增「转换文件」卡 —— 顶部是虚线拖放条（拖入即高亮，点一下走 `app:pick-files` 多选），下面按文件一行一个列出（序号 + 文档名 + 所在目录 + 状态徽章 + 失败原因 + 产物名），底部 `Progress` 与「开始批量转换」。单个文件也进这一列并在队列为空 / 源文件未填时自动填进源文件框（`addBatchFiles`）；点行 = 设为源文件（`Badge tone="primary"` 标记当前行），行尾可移出（`removeBatchFile`，若移出的是源文件则回填下一行）；「执行工具」跑完把同一文件那行的状态同步成结果；「重置」保留队列并回填源文件；无扩展名的拖入项按文件夹处理并 toast，不再静默失败。旧的「批量转换队列」卡删除，符号与状态常量提到模块级（`BatchRow` / `BATCH_STATE_LABELS` / `BATCH_STATE_TONES` / `fileNameOf` / `dirNameOf`）。
- 位置：`ToolRunPage.tsx`（详见 `by-version/v1.2.7-r11.md`）；`ToolRunnerForm` 源文件旁的多选键保留，走的仍是同一个 `addBatchFiles`。
- 验证：两端 tsc 0 错 + `npm run build` 三端通过 + `npm run dist` 后 asar 回读；拖拽目检留给用户。
- 遗留：中途改参数只影响未跑项；批量运行中不接受新拖入；整窗（左栏以外）拖入仍由外壳决定，不进队列。

## 2026-10-16 · v1.2.7 第 10 轮（拖入 + 多文件批量转换）
- 需求：四个转换工具支持文件拖入与多文件批量转换。
- 改法：manifest 加 `supportsBatch`；ToolRunPage 表单外套拖放层 + 「批量转换队列」卡（单文件填源框、多文件入队去重，startBatch 按当前参数逐文件调 toolStore.run，pending/fail 均重试）；ToolRunnerForm 源文件旁 Layers 多选键；新 IPC `app:pick-files` 三处同步。拖入取路径复用 `window.nativeFiles.pathForFile`（webUtils，Electron 32+ 无 File.path）。
- 位置：详见 `by-version/v1.2.7-r10.md`。
- 验证：两端 tsc + build + dist，asar 回读 6 项全中；拖拽目检留给用户。
- 遗留：中途改参数只影响未跑项；文件夹拖入静默忽略。
## 2026-10-16 · v1.2.7 第 9 轮补丁（装依赖实测后两处修复）
- pdf2docx 0.5.13 起 CLI 为 `pdf2docx convert <in> <out>` 子命令式（fire 框架），直传两参数报退出码 2 —— runner args 已带 'convert'。
- Windows 版本探测必须用 `soffice.com`（控制台启动器）：soffice.exe 是 GUI 启动器，管道下 --version 无 stdout；首跑还会因建默认 profile 超时。两处探测（dependency-check.ts / check-tools.mjs）都做了 .com 替换，转换执行仍用 soffice.exe。
- 加新引擎探测时先真跑一次拿版本行，别信 --version 一定有输出。

## 2026-10-16 · v1.2.7 第 9 轮（doc ↔ PDF 互转）
- 需求：文档转换工具支持 doc 与 PDF 互转；用户要求优先站成熟开源实现，不自己写。
- 改法：路由四路 —— pdf 源→pdf2docx（仅 .docx）；pdf 目标→LibreOffice 无头（md/tex/epub 先 pandoc 出中间 docx 再链）；.doc 源→soffice 归一化 docx 后交 pandoc；其余 pandoc 原路径。soffice 带独立 `-env:UserInstallation` profile 防 Windows 实例转交（libreoffice-convert 做法）；产物经 `workspace-tmp/doc-convert` 暂存再 moveInto（EXDEV 回退复制）。
- 新依赖接线固定五处：domain.ts#DependencyId、constants.ts#DEPENDENCY_META、binaries.ts（ToolBinaryId + probeLibreOffice 目录探测）、dependency-check.ts（PROBE_ARGS + checkDependencies 列表）、scripts/check-tools.mjs 镜像。加新引擎五处都要动。
- 位置：详见 `by-version/v1.2.7-r9.md`。
- 验证：check-tools 两项新依赖正确报缺 + 安装命令；scratch 6 组路由断言全过（md→docx 真转）。
- 遗留：本机未装 LibreOffice / pdf2docx，真实转换链待用户装依赖目检；扫描件 PDF 无 OCR。
