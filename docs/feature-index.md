# 功能文件索引（feature index）

> 规则见 `AGENTS.md` 第 0 / 6 节。**改动前先在这里定位文件，改动后立刻回来校准。**
> 本文件只回答「去哪儿找」，实现细节与历史看 `docs/modifications/by-feature/`。
> 维护要求：不写散文、不写历史；条目 = 功能 → 文件 → 符号（函数 / 常量 / CSS 类名）。

## 0. 技术栈与硬约束
- Electron + React 18 + Vite（electron-vite 三端）+ TypeScript；Tailwind 3.4；图标 lucide-react
- 主进程数据层 `node:sqlite`；渲染层来源 file://，pdf.js 用 legacy 构建 + 主线程假 worker
- 源文件一律 CRLF、无 BOM；PowerShell 写文件要用单引号 here-string 或走 node 脚本
- 阅读界面不套应用外壳：`App.tsx` 里 `/reader/:noteId` 是独立路由（无 AppLayout）

## 1. 阅读界面（`src/renderer/src/pages/ReaderPage.tsx`，单文件大页面）
| 功能线 | 主要符号 |
| --- | --- |
| 页面骨架 / 状态汇总 | `ReaderPage()`（顶部状态区：mode / layout / flip / zoom / inkMode / compare） |
| 阅读方式（书页 / 文字 / 排版） | `src/shared/constants.ts` 的 `TEXTUAL_DOC_FORMATS`、`prefersTextView()`、`mode`、`canTextView`、`textView`、`textBody`；`pagedText` / `hasPages`（有没有「页」全看这两个） |
| 翻页动效（直切/淡入/推移/覆盖/翻书） | `turning`、`step()`、`TURN_MS`、`resetPage()`、`shownRef/pageRef`；CSS `.mw-book*`、`@keyframes mw-*` |
| 滚轮翻页开关 | `wheelFlip`、`WHEEL_FLIP_KEY`；书页模式滚轮 `onWheel`（Ctrl+滚轮缩放不受它管） |
| 书页舞台（PDF / 原版式） | `PdfStage()`、`ContinuousPages()`、`PdfPageView()`；`src/renderer/src/lib/pdf.ts`（`openPdf/pageCanvas/peekCanvas/mountCanvas/pageSize/pageText`） |
| 排版舞台（网页 / EPUB iframe） | `RichStage()` |
| 文字舞台（TXT / MD / 抽取正文） | 分页 `TextBook()`（一栏 = 一页：容器只一栏宽，溢出的自己长成新栏）+ 连续 `TextStage()`；`txLimit(autoWidth/height)`/`txSheet`/`TX_MAX_W=2600`/`TX_ROOM_Y=68`/`TX_PAGE_KEY`/`TX_PAD_*`/`TX_GAP`/`TX_BLEED`/`clipW`/`usedColumnCount()`、`READER_FONTS`、`FONT_KEY/FONTSIZE_KEY`、`ReaderBody`/`textLooksPlain`（三处共用的正文树）；CSS `.reader-text`、`pre.reader-plain`、`.tx-sheet/.tx-zoom/.tx-flow/.tx-col/.tx-grip*`、`--tx-colh`（限住比一页高的整块） |
| 正文行内标记（荧光 / 选中旁注） | `parseRange()`、`applyTextRanges()`、`wrapRange()`、`rangeOffsets()`、`addHighlight()`、`annotateRange()`、`rangeMarks`、`noteKindLabel()`、**分页与连续共用 `useTextSelection()` + `SelectionBar`**（TextBook / TextStage 都挂，浮条带 `HL_COLORS` 色板）；荧光颜色存 `note_marks.color` → `mark.tx-hl[data-hl]`；CSS `.tx-selbar*`；存 `note_marks.region` 的 `{kind:'range',start,end}` |
| 缩放 / 平移 / 双击放大 | `fitScale`、`scale`、`zoomBy`、`canPan`、`onPanDown/Move/End`、`handleWheelZoomRich`、stage `onDoubleClick` |
| 左右点击翻页热区 | `canZoneFlip`、`.mw-pagezone*`（只有两颗小按键是热区）、`showHint()`（到头提示） |
| 圈画批注（形状 / 锚定气泡） | `InkShape`、`InkRegion`、`INK_SHAPE_LABELS`、`parseInk`、`displayToPage / pageToDisplay / inkOutline / displayBox`、`InkStrokes`、`InkDots`、`NoteQuickBar(lift：排在纸外)`、`PageInkLayer(quickLift·railDrop·onRailHeight)`、`NoteRail(drop/onHeight)`、`PdfPageView(railReserve→垫 margin-bottom)`、`NoteRail`、`NotePopover`、**共用层 `sheetNotes()` + `PageInkLayer`**（书页与文字页都调它）、`MarkComposer`、`handleInk`、`inkMode`、`inkShape`、`openNote`、`showInk/showNotes`；顶栏一族 `ToolButton` + CSS `.mw-toolgroup`、`.mw-tool*`、`.mw-note-*`、`.mw-ink*`；**文字页上的批注层 `.tx-col` 一律 `pointer-events:none`**（子元素各自放开，否则整栏吃命中、正文一个字也选不中） |
| 侧栏（页面·文字页/目录/注释/查找/本页） | `PANEL_TABS`、`ReaderPanel()`、`thumbOnly`、`thumbTotal`、`PageThumbPicker()`；**文字模式的页面栏** = `tx`（几何由 `TextBook.onLayout` → `txGeom`）+ `TextPageThumb` + `LazyMount`（IntersectionObserver 到眼前才排版），标签在文字模式下叫「文字页」；缩略图画的是**整张纸**的等比小版（`.tx-sheet.txp-sheet` + 与纸上同一套 `.tx-zoom`/`.tx-flow` 偏移，只在外层那一步裁切） |
| 页面对比工作台（顶栏按钮要点得着：`.cmp-shell` 声明 no-drag） | `CompareOverlay()`、`CompareCard`（panX/panY = 纸框滚动位置）、`compareSlots()`、`clampCard()`、`contentSize()`、`clampScroll()`、`scrollMax`+`cmpKey()`（能滚多远以 DOM 量到的为准）、`frameRefs`/`onFrameScroll`、层级：`normalizeZ()`/`zCollides()`/`stackOrder`/`layerNo()`/`shiftZ()`/`raise()`/`stack()`（叠放）、画质：`ladder()`/`budgetScale()`；CSS `.cmp-*`（`.cmp-frame` 是滚动容器，`.cmp-page` 用 CSS zoom） |
| 页面提取 | `ExtractDialog()`、`parsePageSpec()`；主进程 `src/main/services/note-extract.service.ts`（IPC `note:extract-pages`） |
| 查找（全文检索） | `ReaderPage` 的 `runFind` / `gotoHit` / `jumpToHit` / `findHits`·`findIndex`·`findTerm`·`findRings` / `handleFindSpots`；正文涂色 `applyTextFind` + `wrapFindRange`（CSS `mark.tx-find`），书页圈出 `pdf.ts#pageFindHits` + `InkStrokes variant=find`（CSS `.mw-ink.is-find`）；排版模式仍走 iframe 自带查找 |\n| 整页浮层与标题栏 drag 区 | CSS `.cmp-shell`、`.mw-overlay`（`-webkit-app-region: no-drag`，否则顶栏那 34px 会把点击吃掉）；`ReaderOverlay()` |
| Esc 归属（先关浮层再退全屏） | `src/renderer/src/lib/escape.ts`、`blockEscapeFullscreen()`；兜底在 `components/layout/TitleBar.tsx` |
| 快捷键与状态条 | `ReaderPage` 内 `onKey`（← → 空格 +/- 0 r b s e f l 1 2 3 Esc；Ctrl+Shift+H = `shortcutHighlight()` 涂亮 / 删高亮，`addHighlight` 必须声明在这个 effect 之前）；底部提示条 `reader-foot`（只留一行短按键，解释进 `title`，窄时自动换行） |

## 2. 笔记列表（`src/renderer/src/pages/NotesPage.tsx`）
- 阅读方式标签：`isTextualDoc()`、`viewModeLabel()`（Word 类显示「文字」而不是「书页」）
- 排序：`NOTE_SORTS`、`DEFAULT_DIRS`、`loadSortDirs()`、`sortNotes()`、`chooseSort()`、`toggleSortDir()`、`applyReorder()`（拖拽落库）
- 导入：`stageImport()`、`confirmImport()`、`handleDropFiles()`（拖拽遮罩文案）、`importOptions()`
- 详情弹窗：`openDetail()` 与详情 JSX（「资料简介」等文案在此）
- 多选模式（v1.2.6）：`selectMode` / `selected` / `visibleIds` / `toggleSelect` / `toggleSelectAll` / `confirmBatchDelete` / `batchAsk` / `recycleOpen` / `applyMove`（批量改任务·项目·类型）；逐行快速删除键在卡片操作区（`setConfirmId`）
- 回收站弹窗：`src/renderer/src/components/note/NoteRecycleBinModal.tsx`（`remainingText` / `noteHint` / 保留时长切换）
- 存储：`KIND_TABS`、`VIEW_MODE_LABEL`；store `src/renderer/src/stores/noteStore.ts`（`deleted` / `loadDeleted` / `removeNotes` / `moveNotes` / `restoreNote` / `purgeNote`）

## 3. 数据层（`src/main/db/`）
- 迁移：`migrations/00N_*.ts` + 注册表 `migrations/index.ts`（当前 v9：`note-recycle-bin`）
- 回收站（资料 / 笔记 / 卡片，v1.2.6）：`note.repo.ts`（`trashNote` / `restoreNote` / `listDeletedNotes` / `listExpiredDeletedNoteIds` / `moveNotes`）+ `note.service.ts`（`deleteNotes` / `moveNotes` / `restoreNoteFromTrash` / `purgeNote` / `purgeExpiredNotes`）+ 复习挂起 `review.service.ts`（`suspendReviewForNote` / `resumeReviewForNote`）；过期清理由 `main/index.ts#startRecycleBinCleaner` 统一驱动
- 行→对象：`mappers.ts`；仓储：`repositories/note.repo.ts`（含 `reorderNotes`、`noteMarks`、`saveNoteMark`）
- 类型单一来源：`src/shared/types/domain.ts`（`Note`、`NoteDocInfo`、`NoteMark.region`）
- 跨端共享清单：`src/shared/constants.ts`（`IMPORT_EXTENSIONS`、`TEXTUAL_DOC_FORMATS`、主题皮肤表）

## 4. 导入与阅读模式（`src/main/services/`）
- 分派表：`import/index.ts`（`parseDocument` 的 switch、`prepareDocument`、`TEXT_EXTS/PAGINATED_EXTS/RICH_EXTS/EDITABLE_DOC_EXTS`）
- 各格式解析：`import/ooxml.ts`（docx/pptx/xlsx/epub/odf）、`import/pdf.ts`、`import/text.util.ts`、`import/legacy-office.ts`、`import/to-pdf.ts`（LibreOffice/Office 转 PDF）、`import/html-bundle.ts`
- 阅读模式判定：`note.service.ts` 的 `readNoteDoc()`（有 PDF 渲染件就回 `pages`）
- IPC 面：`src/main/ipc/note.ipc.ts`（`note:doc` / `note:marks` / `note:mark-save` / `note:extract-pages` / `note:reorder` / `note:move-many` …）+ `src/shared/types/ipc.ts` + `src/renderer/src/lib/ipc.ts`（新增通道三处同步）

## 5. 窗口与外壳
- 自绘标题栏（无图标、无下边线；最小化/最大化/关闭、全屏 F11/Esc）：`components/layout/TitleBar.tsx` 的 `.titlebar-rail` 续侧栏分隔线，宽度由 `Sidebar.tsx` 的 ResizeObserver 写进 `--sidebar-w`；主进程 `src/main/index.ts`
- 应用外壳 / 侧栏 / 皮肤装饰：`AppLayout.tsx`、`Sidebar.tsx`、`SkinChrome.tsx`、`PageGrid.tsx`、`GridBoard.tsx`
- 全局状态：`src/renderer/src/stores/appStore.ts`（主题、皮肤、设置）

## 6. 主题与皮肤（`src/renderer/src/styles/index.css`）
- 令牌：`[data-theme]` / `[data-skin]` 上的 `--n-*`、`--p-*`、`--r-*`；皮肤规则块按 `html[data-skin=...]` 分组（magazine / glass / terminal / brutal / dash / cream / retro …）
- 风格预设：`shared/constants.ts` 的 `THEME_PRESETS`（默认主题下 5 种配色 + 8 种观感）+ `index.css` 第一节 `[data-preset=...]`；`themePresetsOf(group)` 分组、`themePreview()` 取预览色；删预设要同时改 `ThemePreset` 联合与 CSS 段
- 面向用户的提示文案（hint / 占位 / 空态）改动规矩见 `docs/modifications/by-feature/ui-copy.md`
- **新增组件样式一律走主题令牌**（`hsl(var(--...))`），不要写死颜色，否则会破坏皮肤适配
- 阅读与批注相关组件层：`.mw-*`（书页、圈画、旁注）、`.cmp-*`（对比工作台）、`.reader-*`

## 7. 工具集 / 任务 / 统计 / 番茄（速查）
- 工具：`src/main/tools/registry.ts`（注册即生效）、`tools/runners/*.runner.ts`、`src/main/utils/{binaries,command,dependency-check}.ts`、页面 `ToolsPage.tsx`（看板 `workstation.grid.tools.v5`）+ `components/tool/*`
- 计算类共用件：`src/main/tools/engineering.ts`（`parseQty` 工程计数法 / `fmtQty` / `E24·E12·nearestSeries·standardText`）；多模式表单按 `ToolField.visibleWhen` 只显示当前模式的输入项（`ToolRunnerForm.tsx#visibleFields`）
- 滤波与电路：`filter-calc.runner.ts`（速算与反算）、`opamp-calc.runner.ts`、`filter-sim.runner.ts#buildNetlist`（九种结构搭网表）；求解用开源引擎 `analog-filter-designer`，本项目封装在 `src/main/tools/mna.ts`（`sweep / bandMetrics / polesAndZeros / stepResponse / toCsv`），类型声明 `analog-filter-designer.d.ts`
- 任务：`pages/TasksPage.tsx`、`components/task/*`、`services/task.service.ts`、`repositories/task.repo.ts`
- 统计：`pages/StatsPage.tsx`、`components/stats/*`、`services/stats.service.ts`、`overview.service.ts`
- 番茄与专注：`pages/PomodoroPage.tsx`（取数 + 栅格 storageKey v5 + 空格 / R 快捷键）、视觉组件 `components/pomodoro/PomoStage.tsx`（`PHASE_VISUALS` / `bodyColorsFor` / `TomatoDial` / 六行栅格舞台）与 `PomoPanels.tsx`（`RHYTHM_PRESETS` 整套预设 / `PomoParams` 步进器 + `RhythmBand` 节奏带 / `PomoToday` 今日热力带）、CSS `.pomo-*`（`--pomo-h` 阶段色相、`.pomo-stage` 六行 grid）
- 番茄状态机：`stores/pomodoroStore.ts`（`switchPhase` / `sync` / `skip` / `beep`）、`services/schedule.service.ts`、`repositories/focus.repo.ts`
- 复习：`components/review/ReviewQueue.tsx`、`services/review.service.ts`

## 8. 版本信息双写点（发版必改）
- `CHANGELOG.md`（顶部追加）与 `src/renderer/src/pages/SettingsPage.tsx` 的 `CHANGELOG` 常量（顶部追加同一条）
- `package.json` 的 `version`；打包配置 `electron-builder.yml`；产物目录 `release/`（历史包进 `release/archive/`）

## 9. 修改记录
- 按版本：`docs/modifications/by-version/`（一次提交一篇）
- 按功能：`docs/modifications/by-feature/`（同一功能线追加在篇首）
- 回看往届只读对应那一篇；找不到就先看本索引定位功能线，别全仓 grep
- 这套文档规矩本身的来历与自查结论：`by-feature/docs-index.md`
