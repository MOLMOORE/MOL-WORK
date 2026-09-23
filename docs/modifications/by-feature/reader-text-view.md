# 阅读 · 书页/文字阅读方式与字体字号

> 功能线速查：ReaderPage.tsx（mode/canTextView/textView/textBody/pagedText/hasPages/READER_FONTS/TextStage/TextBook/txSheet/TX_*/usedColumnCount）+ index.css（.reader-text / pre.reader-plain / .tx-sheet .tx-zoom .tx-flow .tx-grip）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 7 轮（分页机制重做）
- 需求：单页 / 双页显示不全、上一页会露出下一页的一条字、拖过页面边界后翻不动（全挤在一页）、切回书页也翻不动、分页下改不了字号也选不中文字、点「连续」顶栏丢掉一大半、深色模式白纸刺眼。
- 根因（四条各自独立）：
  1. **露邻栏**：可见窗口拿纸宽当尺寸，`sheetW = 正文宽 + 2×TX_PAD_X(44)`，而栏间距只有 26 → 邻栏起点落在窗口里 18px，每页左右都会带一条别人的字。
  2. **翻不动**：上一版把量出来的栏数回写进 `column-count` 与容器宽度，布局 ↔ 测量互相追；再叠上纸可以被拖到 1900×2600，一张纸就装完整篇 → 页数 1。
  3. **书页也翻不动**：`pageCount` 三种模式共用，文字页量出的 1 在切回书页后还留着（PDF 页数只在载入那一刻写过）。
  4. **选不中**：`fitScale` 在文字模式仍按 PDF 页面算 → `canPan` 常真 → 左键被平移吃掉（`is-panning` 还给纸面加 `user-select: none`）。
- 改法：
  - 容器固定**一栏宽**（`column-width: colW` + `column-count: auto` + `column-fill: auto` + `overflow: visible`），排不下的正文自己长成新栏 —— 栏数只量一次用来报页数，不再回写布局（删 `sigRef`/`triesRef`/`dirty`/`is-measuring`）。参考 EPUB 阅读器（Readium / epub.js）的横向分页做法。
  - 裁切窗口收紧：`clipW = 正文宽 + 2×TX_BLEED(8)`，`.tx-zoom` 的 `left = TX_PAD_X - 8`、流的 `left = 8`（两者要一起改，否则正文整体平移）→ 邻栏离窗口边缘还有 18px，必然被切掉。
  - 纸最多一屏：新增 `txLimit`（舞台 -24），自适应与 `resizeTxSheet` 都按它夹；`fitScale` 在 `mode === 'text'` 直接返回 1，纸的显示尺寸 = 排版尺寸，拖边界看到的就是排版的量。
  - 页数交还：`mode` 回到 pages 且 pdf 在 → `setPageCount(pdf.pageCount)`。
  - 选词优先：`onPanDown` 先判 `canPan`，起拖点落在 `.tx-flow` 里就让给选词；双页切换时把偶数页对齐回奇数页。
  - 顶栏：字号组条件从「非 hasPages」改成「mode === 'text'」（分页与连续都要）；缩放组三种模式共用一份（书页 = 适页复位，文字 = 复位 zoom 并 `setTxPage(null)`）；布局组移出 `hasPages` 包裹，切到「连续」也留得下来。
  - 深色：`.tx-sheet` 走 `hsl(var(--card))` + 主题描边；`pre.reader-plain` 去掉代码块深底 / 内边距 / 横向滚动（整篇正文就是那个 `<pre>`，深色下会在白纸上压一块黑斑）。
- 位置：`TextBook`（`contentW` / `clipW` / `TX_BLEED` / 量页数 effect）、`txLimit` / `txSheet` / `resizeTxSheet` / `fitScale` / 页数交还 effect / `onPanDown` / 顶栏整块；`index.css`（`.tx-sheet` / `.tx-flow` / `.reader-text pre.reader-plain`）。
- 验证：Playwright `work/patch/txbook.html` + `txbook.mjs` / `txbook2.mjs` 复刻真实几何逐页扫（单页 26 页、双页、colW 320~1200、zoom 0.85~2、小数栏宽）：内容恒落在 [PAD_X, PAD_X+正文宽]，邻栏不进窗口；colH 300→1200 页数 58→14、colW 320→1200 页数 52→13（承载量确实跟着边界变）。另 `txpage3.*` 证明 `scrollWidth` 会多算 1~4 栏，页数只能量最后一个块右沿。L0：tsc 0 错 + build + dist 回读。
- 遗留：亚像素下正好压在栏分界上的标记可能被 `floor()` 算到邻栏（取证的 `leak` 样本全是这种 ±1 归栏误差，不是真露字）；侧栏缩略图在文字模式仍隐藏；超长文档拖边界会掉帧。
## 2026-09-23 · v1.2.5 第 6 轮
- 需求：文字模式也先给一张纸（用户能自己改边界、正文跟着重排），并且要有书页那套功能（单页 / 双页 / 连续 + 五种翻页动效）。
- 根因（挡路的地方）：`mode === 'text'` 在十几处判据里被当成「没有页」写死 —— 进度落库、页码显示、左右热区、滚轮翻页、左键平移、批注页号、canPan 全部直接 return 或塞 0。
- 改法：新增 `TextBook` 舞台。一张纸里放一个多栏正文流：`.tx-zoom` 负责裁切 + 整页放大（CSS zoom，不重排），`.tx-flow` 用 `column-count` 排栏，**一栏 = 一页**，第 k 页 = `translateX(-(k-1)*(栏宽+栏间距))`；双页就是一张纸两栏，和书页的 `page / page+1` 语义一致，翻页动效直接复用 `.mw-book / .mw-layer` 那套。
  判据换成 `pagedText`（文字模式且布局不是连续）与 `hasPages`，上面那十几处一律改读 `hasPages`。
- 栏宽为什么不能只给 `column-width`：MDN / Readium 都写明浏览器会把栏**拉伸填满**容器，所以宽度按 `n*栏宽 + (n-1)*栏间距` 算死，配合 `column-count: n` 才正好。
- 栏数怎么定：`column-count` 给少了 Chromium 会**自己往外长栏**（实测问 1 栏得 10 栏，scrollWidth 超容器），给多了留空栏 —— `usedColumnCount()` 量最后一个块的**右沿**落在第几栏来校正。
  坑：第一版量**左沿**，正好压在栏分界上的块会因亚像素误差在 8/9 之间来回弹（Playwright 实测 6 步不收敛）；改量右沿（再往回让半个字）后 380~900px 十四种纸宽全部一步收敛，另加「弹超过 4 次就取大值」兜底。
- 边界：纸的右 / 下 / 右下角三个 `.tx-grip` 可拖，尺寸存 `workstation.reader.txpage.v1`；没拖过就跟着舞台自适应（单页最宽 980、双页 1500、高 = 舞台 - 76），点缩放条上的百分比交还给窗口。
- 性能：正文 `useMemo` 只认 `text`，翻页 / 缩放 / 拖边界都复用同一棵 DOM，不会每翻一页重解析 Markdown；`.tx-flow` 不加 `will-change`（超长文档会撑出一个几十万像素宽的合成层）。
- 位置：`ReaderPage.tsx`（TextBook / usedColumnCount / pagedText / hasPages / txSheet / resizeTxSheet / handleTextPageCount / stepZoom / TX_* 常量）、`index.css`（.tx-sheet / .tx-zoom / .tx-flow / .tx-grip*）。
- 验证：Playwright `work/patch/txpage.mjs`、`txpage2.mjs` 量出长栏、空栏、右沿判据与 zoom 换算；L0 tsc + build。
- 遗留：侧栏「页面 / 本页」在文字模式下仍隐藏（缩略图要每栏重画一遍）；排版模式（网页 / EPUB）仍不分页；老数据里 `page = 0` 的书签注释不会出现在任何一页。

## 2026-09-23 · v1.2.5 第 4 轮（推翻上一版做法）
- 现象：点「文字」一直停在「正在准备文字视图…」，看着像卡死。
- 根因：`textBody` 只在 `info.viewMode === 'text'` 时才用 `info.text`，而抽文字层的 effect 又用 `info.text.trim().length > 80` 当「不必抽」的 guard；Word 家族两条同时命中 → 不抽也不给正文，`pdfText` 永远是空串，界面永远停在占位句。逻辑死锁，不是性能问题。
- 改法：删掉整篇现抽文字层（pdfText / pdfTextBusy / 抽取 effect），文字视图直接读库里正文；
  按格式分两类 —— `TEXTUAL_DOC_FORMATS`（DOC/DOCX/RTF/WPS/ODT，新增在 `src/shared/constants.ts`）走文字视图（字体 + 字号 + 页面缩放），
  PDF / PPT / Excel 只走书页（整页缩放，不提供字体功能）；Word 类打开默认就在文字视图，可用顶部「书页 / 文字」切回核对原版式。
- 为什么在渲染层派生：`note.service.ts#readNoteDoc()` 只要看到 PDF 渲染件就回 `viewMode: 'pages'`，改主进程会牵动已入库的老资料；渲染层派生零迁移。
- 位置：`ReaderPage.tsx`（prefersTextView / canTextView / mode / textBody / 载入时 setTextView）、`NotesPage.tsx`（isTextualDoc / viewModeLabel）。
- 遗留：文字视图下不给「编辑」按钮（改的是抽取正文）；`pre.reader-plain` 那个 Tailwind preflight 修复继续有效。

## 2026-09-22 · v1.2.5 第 3 轮（做法已被第 4 轮推翻）
- 需求：doc / TXT 也能换字体与放大。
- 改法：原版式书页加「书页 / 文字」切换（`textView`），PDF 首次切换用 pdf.js 现抽文字层（`pdfText`，每 10 页让一次主线程，上限 400 页）。
- 根因（第 4 轮定位）：抽文字层的 guard 是 `if (!textView || !pdf || info.text.trim().length > 80 || pdfText !== '') return` —— 对 **DOCX/PPTX 这类正文早已抽取入库**的文档，条件命中直接 return，`pdfText` 永远是空串，而 `textBody` 又只在 `info.viewMode === 'text'` 时才用 `info.text`，于是永远显示占位句「正在准备文字视图…」，看着像卡死。
- 结论：整篇抽取 + 占位句这条路对 PDF 也不划算（大 PDF 抽全文很慢）。第 4 轮按用户指示改为：PDF/PPT 只走书页（整体放大），DOC/TXT 走文字（字体 + 字号 + 页面缩放）。