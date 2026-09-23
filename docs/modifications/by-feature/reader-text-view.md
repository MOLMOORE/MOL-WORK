# 阅读 · 书页/文字阅读方式与字体字号

> 功能线速查：ReaderPage.tsx（mode/canTextView/textView/textBody/pagedText/hasPages/READER_FONTS/TextStage/TextBook/txSheet/TX_*/usedColumnCount）+ index.css（.reader-text / pre.reader-plain / .tx-sheet .tx-zoom .tx-flow .tx-grip）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

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