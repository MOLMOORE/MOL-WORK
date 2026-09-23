# 阅读 · 书页/文字阅读方式与字体字号

> 功能线速查：ReaderPage.tsx（mode/canTextView/textView/textBody/READER_FONTS/TextStage/RichStage）+ index.css（.reader-text / pre.reader-plain）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

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