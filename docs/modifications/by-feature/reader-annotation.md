# 阅读 · 批注（圈注 / 旁注）

> 功能线速查：ReaderPage.tsx（sheetNotes/PageInkLayer/InkStrokes/InkDots/NoteQuickBar/NoteRail/NotePopover/MarkComposer/handleInk/inkMode/showInk/showNotes/noteSide/noteKindLabel + 行内标记 parseRange/applyTextRanges/wrapRange/rangeOffsets/addHighlight/annotateRange）+ index.css（.mw-ink* / .mw-note-* / mark.tx-hl / .tx-selbar）+ note_marks.region（DB v8，圈画 {kind,points} 与文字页 {kind:range,start,end} 两种存法）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 6 轮
- 需求：文字模式也要有注释功能，并多一种「选中一段文字 → 在旁边标注」；另外选中正文要能涂荧光笔。
- 前置重构：`PdfPageView` 里那 240 行批注代码（圈画 SVG、编号圆点、页顶快捷按键、边上旁注、就地气泡、圈注手势与多边形键位）抽成
  `sheetNotes()`（纯函数：这张纸上有哪几条批注、编号顺序）+ `PageInkLayer`（渲染 + 手势），书页与文字页共用；`sheetNotes` 收的是「这一张纸上的**几页**」，双页时两栏各摆一层 `.tx-col`。
- 行内标记存哪儿：不加迁移。`note_marks.kind` 加 `'highlight'`（该列是无 CHECK 的 TEXT），`region` 复用存 `{kind:'range',start,end}`；
  偏移量是**渲染后正文的第几个字**（`flow.textContent`），所以换字体、改边界、重排都不会跑位 —— 这是与圈注「归一化到页面」等价的做法。
- 画在哪儿：`applyTextRanges()` 在 `useLayoutEffect` 里先把上一轮自己塞的 `<mark>` 拆干净 + `normalize()`，再按偏移量把区间里的每个文字节点各套一层 `<mark>`
  （跨元素就变成多段，配 `box-decoration-break: clone` 让跨行跨栏都带满底色）；偏移量对不上原文时退回按引文 `indexOf` 重定位，找不到就不画（数据还在，侧栏能删）。
  实测连套两轮 `textContent` 一字不差（幂等），React 只认它自己那批节点、`normalize()` 后原节点仍在原位，两方不抢子节点。
- 选区 → 偏移：`rangeOffsets()` 用 `Range.selectNodeContents(root) + setEnd(...) + toString().length` 量起止，元素级容器（整段被框选）也算得准；两头再削掉空白，引文与偏移量自洽。
- 交互：`pointerup` 后浮出 `.tx-selbar`（涂荧光 / 写旁注）；点纸上的标记就地展开气泡（`noteKindLabel` 区分整页旁注 / 圈注 / 选中旁注 / 荧光标记）；
  纯荧光标记不上页顶按键（它自己就在纸上），但**要上侧栏「注释」列表** —— 不然涂错了没地方取消；「仅书签」的页面集合改成只认 bookmark / star。
- 位置：`ReaderPage.tsx`（sheetNotes / PageInkLayer / sheetNotes 调用点、TextBook 的 rangesOf / pickSelection / onFlowClick、addHighlight / annotateRange / rangeMarks、MarkComposer 的 ranged 文案）、`index.css`（mark.tx-hl / .tx-selbar）、`src/shared/types/domain.ts`（NoteMarkKind）。
- 遗留：正文被编辑过（连续模式改字）后偏移量可能整体错位，靠引文兜底；文字页的圈注归一化到「栏」，改边界重排后圈会跟着那一页的相对位置走。

## 2026-09-23 · v1.2.5 第 4 轮
- 需求：形状要能选（任意 / 圆 / 矩 / 多边形）；点圈住的部分时批注要开在那块旁边；旁注要更显眼并在页面上方给快捷按键。
- 根因：上一版把圈注与旁注混在同一列 NoteRail 里，纸两侧放不下就整列落到纸下方 —— 用户看到的永远是「页面下面一坨」。
- 改法：
  - `InkShape = free|rect|ellipse|polygon`，region 存 `{kind, points}`；矩形/圆圈只存对角两点，`inkOutline()` 画时展开（圆圈 36 段折线），旋转仍走 `pageToDisplay`，不特判；无 kind 的老数据当 free。
  - 多边形：单击落点，点回起点 14px 内或 Enter 闭合，Esc 作废（window capture，抢在退全屏之前）。
  - `NotePopover` 用 `displayBox()` 求外接框贴右边，放不下翻左边；`.mw-page.has-rail` 继续负责不被裁。
  - `NoteQuickBar` 在纸内上方一排编号按键（实心=圈注 / 空心=旁注）；点纸面空白或 Esc 收起；新写的批注保存后自动展开。
  - 旁注卡片：主色竖条 + 投影 + 12px 字号，边栏加虚线导轨（参考 Hypothesis / Zotero 页边批注栏的做法）。
- 位置：`ReaderPage.tsx`（InkShape / inkOutline / displayBox / InkStrokes / InkDots / NoteQuickBar / NotePopover / PdfPageView 的 inkDown·Move·Up·commit / handleInk）、`index.css`（.mw-ink path 可点、.mw-note-quick / -chip / -pop / .mw-note-card）。
- 遗留：NoteRail 现在只列整页旁注；气泡随纸缩放定位，极小缩放时可能压住别的内容。

## 2026-09-22 · v1.2.5 第 3 轮
- 需求：能圈住页面某个局部并给它写批注；批注显示在页面边上或上下空白；两类注释可分别显示/隐藏。
- 改法：圈注模式下 `.mw-ink-catch` 采集自由曲线 → `onInk(points, page)` → `MarkComposer` → 存 `note_marks.region`；轨迹归一化到**页面自身坐标**（`displayToPage`/`pageToDisplay` 处理 90/180/270），缩放旋转不跑位；渲染 = SVG path + 编号圆点 + 批注列；`.mw-page.has-rail{overflow:visible}`；双页时 `noteSide=false` 落到纸上下空白。
- 验证：L0 + asar 回读（mw-note-rail / note-mark-region）。
- 遗留（用户第 4 轮反馈）：① 只有自由曲线，没有圆/矩/多边形；② 批注一律排在页面下方，点圈住的部分看不到；③ 旁注不够显眼、页面上方没有快捷按键。