# 阅读 · 批注（圈注 / 旁注）

> 功能线速查：ReaderPage.tsx（sheetNotes/PageInkLayer(quickLift·railDrop·onRailHeight)/InkStrokes(variant=find)/InkDots/NoteQuickBar(lift)/NoteRail(drop·onHeight)/NotePopover/MarkComposer/handleInk/inkMode/showInk/showNotes/noteSide/noteKindLabel + PdfPageView(railReserve→垫 margin-bottom) + 行内标记 parseRange/applyTextRanges/unwrapMarks/wrapRange/rangeOffsets/addHighlight/shortcutHighlight/annotateRange/rangeMarks/HL_COLORS/ToolButton + useTextSelection/SelectionBar）+ index.css（`.mw-ink*` / `.mw-note-*`（编号按键排在纸外、卡片限高、旁注列可下挪） / `mark.tx-hl[data-hl]` / `.tx-selbar*` / `.mw-toolgroup`）+ note_marks.region（DB v8：圈画 {kind,points} 与文字页 {kind:range,start,end}）

## 2026-09-24 · v1.2.5 第 10 轮（旁注列不再压住下一页）
- 需求：旁注的显示又侵入页面内（截图：一条整宽度的旁注卡片压在下一页正文上），要显示得更合理。
- 根因：落在纸下面的那一列（`.mw-note-rail.is-below`）是 `position:absolute`，完全不占排版 —— 连续滚动时页间距只有 32px，一条卡片 100~170px 就直接盖到下一页的正文上（CSS Overflow 规范：绝对定位后代的墨水区会扩大可滚动区、但不推文档流，正是这个行为）。上一轮只把「纸顶上的编号按键」抬了出去，纸下面这一列没管。
- 改法：① `NoteRail` 用 `ResizeObserver` 量出自己多高（贴纸边时报 0），经 `PageInkLayer.onRailHeight` 报给 `PdfPageView`；连续滚动（`railReserve`）时给这张纸 `margin-bottom = 高度 + 10`，纸下面垫出等高的地方，下一页自然被推开。② 文字页的批注层是从纸的下边距里开始的，新增 `railDrop = TX_PAD_Y * scale + 6`，把这一列整个挪到纸的外面（`top: calc(100% + N)` 由组件写）。③ 旁注卡片限高 172px、超出在卡片内滚动，一条长批注也不会把垫出来的地方撑得太夸张。
- 位置：`ReaderPage.tsx`（NoteRail / PageInkLayer / PdfPageView / ContinuousPages / TextBook 的 railDrop）、`index.css`（.mw-note-card 限高）。
- 参考：CSS Overflow 3（绝对定位后代只扩滚动区、不推文档流）；MDN ResizeObserver —— 只量这一列、改的是祖先外边距，自己的盒子不跟着变，不会形成「loop completed with undelivered notifications」反馈环（另加 lastH 去重）。
- 验证：L0（tsc 严格 + build）+ 同一份取证页量过：卡片 172px 时未垫高 → 下一页顶边 1826 < 列底 1976（压住 150px，正是用户看到的）；垫高后 2008 ≥ 1976 不再压。
- 遗留：文字页（单页 / 双页）与逐页书页的旁注列落在纸下面，纸下方空间不足时要往下滚一点才看全（与纸外编号按键同一取舍）。

## 2026-09-24 · v1.2.5 第 9 轮（编号按键搬到纸外面 + 高亮快捷键）
- 需求：① 加过注释后挂在页面左上角的那排小圆框（编号按键）要放到本页面之外，不要压在正文上；② 选中文字后按快捷键就能打上 / 删掉高亮。
- 根因：`.mw-note-quick` 写死 `top:6px; left:6px; right:34px`，永远落在纸内左上角，第一条批注一多就盖住正文第一行。
- 改法：容器改由组件写 `bottom: calc(100% + Npx)`（`NoteQuickBar` 收 `lift`，`PageInkLayer` 收 `quickLift`）—— 书页 `lift=0` 就是纸上方 6px；文字页的批注层从纸的上边距里开始，要再抬 `TX_PAD_Y * scale` 才真到纸外。**纸上方得留地方**：`fitScale` 纵向留白 44 → `TX_ROOM_Y = 68`、`txLimit.height` 同口径、连续滚动 `gap-4 → gap-8` + `pt-10`，适页时纸上方稳定有 ~34px，按键（6 + 21px）不会被舞台裁掉。同时把 `.tx-col .mw-note-quick` 从「放开命中」名单里摘掉（容器 `pointer-events:none`、按键自己 `auto`），别让那条横跨纸宽的空容器去抢上一张纸的批注列；`.mw-note-chip-text` 加 `color: inherit; font-weight: 500`，浅色皮肤下不再淡到读不出。
- 快捷键 `Ctrl+Shift+H`：`shortcutHighlight()` 现场读选区 → `closest('.reader-text')` → `rangeOffsets()`（与浮条、纸上画色同一套偏移量口径）；命中「整条落在选区内」或「整个盖住选区」的高亮一律删掉（可一次删多条），没有命中就 `addHighlight(span, quote)` 涂当前笔色；接线在 `onKey` 的 Ctrl 分支，输入框内仍走 typing 早退。浮条色板的 title 与底部状态条都写了这个键。
- 位置：`ReaderPage.tsx`（`NoteQuickBar`/`PageInkLayer`/`TextBook` 的 `quickLift`/`ContinuousPages` 容器/`fitScale`/`shortcutHighlight`）、`index.css`（`.mw-note-quick`/`.tx-col .mw-note-quick`/`.mw-note-chip-text`）。
- 验证：L0（tsc 严格 + build）。
- 遗留：`Ctrl+Shift+H` 只在文字模式有效（书页是画布选不出字）；只压到一半的高亮不会被误删、但也删不掉，精确删除仍用浮条点同色。放大或「适宽」下纸顶贴到舞台边缘时，纸外的按键要往上滚一点才看得见。

## 2026-09-24 · v1.2.5 第 8 轮（浮条定位准 + 高亮能挑色）
- 需求：滚动模式里能选中字，但「注释 / 高亮」那条浮框经常离选区一大截；要更准、更显眼，高亮还要能挑颜色。
- 根因：`useTextSelection.pick` 拿两个客户端矩形相减（= 相对视口）当浮条坐标，而连续模式的宿主本身就是滚动容器，没补 `scrollLeft / scrollTop` → 内容滚多远浮条飘多远（同一文件里 `NotePopover` 早就补了，只有浮条漏）；锚点还取 `range.getClientRects()[0]`，跨元素选区的第一个片段经常是零宽空盒子，本身不可信。
- 改法：① 锚点改成「丢掉零宽片段后、最上面那一行的左右沿」，坐标一律补 `host.scrollLeft/scrollTop`（宿主不是滚动容器时这俩为 0，书页与分页文字行为不变），上面放不下就自动翻到选区下面（`SelectionSpot.place` + `data-place` + CSS 小三角）；② 浮条换成实底卡片 + 主色描边 + 外发光，按键从光图标变成「图标 + 文字」，中间夹一排荧光色板；③ 颜色不加迁移，直接写进建表就空着的 `note_marks.color`，画在 `mark.tx-hl[data-hl]`（固定 rgba，深浅两套都压得住），当前用哪支记 `workstation.reader.hlcolor.v1`；同一段再点同色 = 取消、点别色 = 改色（`api.note.saveMark({ id, color })` 走 updateMark）；④ `.is-active` 从「换底色」改成「描主色外圈」，否则会把用户挑的颜色盖掉；⑤ `showInk` 继续同时管纸上的圈与正文的荧光，所以顶栏把它从「有页才给」里拆出来单独显示（圈注 / 旁注仍要有页）。
- 位置：`ReaderPage.tsx`（`HL_COLORS` / `SELBAR_W` / `SELBAR_H` / `useTextSelection` / `SelectionSpot` / `SelectionBar` / `addHighlight(range,quote,color)` / `rangeMarks` / `RangeItem.color` / `wrapRange(...,color)` / `unwrapMarks`）、`index.css`（`.tx-selbar*`、`mark.tx-hl[data-hl]`、`.mw-toolgroup` 一族）。
- 参考：主流阅读器（Zotero / Hypothesis）都是「选区第一行 + 色板直接点即涂」的交互；未采用弹出色盘控件，避免盖住正文。
- 验证：L0（tsc 严格 + build）。
- 遗留：正文被编辑过之后偏移靠引文兜底；色板固定 5 支，暂不开放自定义色；浮条宽度按 `SELBAR_W` 估算夹边，极窄纸面上会靠左贴。

## 2026-09-23 · v1.2.5 第 7 轮（图标统一 + 连续模式也能选中注释）
- 需求：顶栏注释一族图标统一风格；「连续」滚动里选中正文既不能高亮也不能写注释。
- 改法：
  - 顶栏「注释 / 圈注 / 圈画 / 旁注」合进一个 `.mw-toolgroup`（一个外框 + 内部分隔线），按键一律 `ToolButton` = 图标 + 文字，点亮走主色底；图标各归各的语义：`NotebookPen` / `Highlighter` / `CircleDashed` / `StickyNote`（原来圈画与旁注都是 Eye，注释还是个裸图标夹在三个带框按键中间）。形状选择器仍在组外，只在圈注模式出现。
  - 选中正文那套从 `TextBook` 里抽成 `useTextSelection`（读选区 → 算偏移量 → 定浮条位置）+ `SelectionBar`（涂荧光 / 写旁注），`TextStage`（连续滚动）接上同一套：`applyTextRanges` 传 `colW: 0` 表示「只画不定位」（连续模式没有栏可归位），点标记用 `NotePopover` 在滚动容器里就地展开（坐标 = 片段矩形 - 容器矩形 + scrollTop）。
  - 偏移量口径两边一致：行内标记的起止是「渲染后正文的第几个字」，`TextStage` 的 `<article>` 里那段只读提示在正文**之后**，不影响前缀计数，所以连续与分页两边互认。
  - `showInk`（圈画开关）现在也过滤正文里的荧光：`ranges` → `showInk ? ranges : []`（以前只关得掉纸上的圈，关不掉涂亮的字）。
  - 无页可存时（连续模式）`addHighlight` / `annotateRange` 存 `page = 0`，标签写「正文」而不是「第 0 页」。
- 位置：`ReaderPage.tsx`（`ToolButton` / `useTextSelection` / `SelectionBar` / `TextStage` 新 props / 顶栏工具组）、`index.css`（`.mw-toolgroup` / `.mw-tool` / `.mw-tool-sep` / `.tx-selbar-btn`）。
- 验证：L0 + dist 回读；GUI 端到端留给用户手测。
- 遗留：连续模式没有页号，行内标记在侧栏只显示「正文」；`TextBook` 的浮条与气泡仍按栏定位，改边界重排后气泡跟着那一栏走。
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