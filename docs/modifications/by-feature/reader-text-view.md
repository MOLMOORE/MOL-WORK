# 阅读 · 书页/文字阅读方式与字体字号

> 功能线速查：ReaderPage.tsx（mode/canTextView/textView/textBody/pagedText/hasPages/READER_FONTS/ReaderBody/textLooksPlain/TextStage/TextBook/txLimit·autoWidth/txSheet/txPage/TX_*(含 TX_MAX_W 2600·TX_ROOM_Y 68)/usedColumnCount/onLayout→txGeom/TextPageThumb(整张纸等比小版)/LazyMount/shortcutHighlight + footer reader-foot）+ index.css（`.reader-text` / `pre.reader-plain` / `.tx-sheet .tx-zoom .tx-flow .tx-col .tx-grip` / `.txp-sheet`）

## 2026-09-24 · v1.2.5 第 10 轮（文字页预览 = 整张纸的缩小版 · 状态条只留一行）
- 需求：① 侧栏「文字页」的预览和真正的本页还是有区别，要几乎等于本页的缩小版；② 底部提示（尤其快捷键）字太多太杂。
- 根因：① 上一轮虽然把裁切口径统一了，但缩略图画到的仍然只有「正文那一块」（colW × colH），纸的四边留白（TX_PAD_X/Y）、裁切窗口的起点与宽高（从 TX_PAD_X-TX_BLEED 起、宽 colW+2×TX_BLEED、高到栏底再往下 TX_BLEED）一概没照抄，于是预览是「贴边的一栏字」，本页却是「一张有白边的纸」，看着就不是一回事。② footer 把每一条解释都摊在明面上（10 多条 span），开侧栏时挤成两行还读不完。
- 改法：① 缩略图改成整张纸：外层 `.tx-sheet.txp-sheet`（宽 = colW+2TX_PAD_X、高 = colH+2TX_PAD_Y，`transform: scale(ratio)` + `transform-origin: top left`，ratio 按整张纸宽算），里面 `.tx-zoom` / `.tx-flow` 的 left/top/width/height 全部照抄 TextBook 的 buildSheet 同一套数值；`LazyMount` 的占位高跟着换成 paperH×ratio。② footer 只留「第 N / M 页 + 一行短按键」：翻页 / 下页 / 缩放 / B·S·E / 1 2 3 布局 /（书页 R 旋转、文字 Ctrl+Shift+H）/ 全屏，每条的详细解释（Shift+空格、Home/End、0 复位、放大后拖动、Esc 先收浮层…）挪进 `title` 悬浮提示；「连续阅读 · 点上方…」缩成「连续阅读」，「本篇已读」→「已读」。
- 位置：`ReaderPage.tsx`（TextPageThumb / footer）、`index.css`（`.txp-zoom` → `.txp-sheet`）。
- 参考：CSS Transforms（transform 不参与排版 ⇒ 等比缩放不会改分页，预览与纸上逐字一致）；继续复用纸上的 `.tx-zoom`/`.tx-flow`，不再另抄一套裁切规则。
- 验证：L0 tsc（noUnused*）+ build；L0+ 取证 `work/patch/r10.html` / `r10.mjs` —— 同一份正文两种排法，第 1/3/9 页中心 `elementFromPoint` 命中的段落与纸上完全一致（第 7 段 / 第 35 段 / 第 0 段），缩略图角上命中的是 `.tx-sheet txp-sheet`（说明纸边在），`scrollWidth` 两边相等。
- 遗留：预览按「单栏那一页」画；双页时本页是一张纸两栏，预览仍是其中一栏（页码单位本来就是栏）。

## 2026-09-24 · v1.2.5 第 9 轮（缩略图每页都有预览 · 横向拖得开 · 状态条不漏 · 高亮有快捷键）
- 需求：① 侧栏「文字页」除了第一页其余都没有预览；② 页面边界的横向改变范围要放大；③ 底部「第 N / M 页 + 快捷键提示」还是显示不全，且只在开着侧栏时；④ 选中正文要能用快捷键打上 / 删掉高亮。
- 根因：① `TextPageThumb` 给缩略图正文另抄一套 CSS，`.txp-flow{overflow:hidden}` 把第二栏起（本来就画在栏框外的分片）整条裁掉，再 `translateX` 平移出可视区 → 第 2 页往后全空白，第 1 页两种设置都一样。② 宽度被三道夹子重复卡：`txLimit.width` 按舞台宽、`txSheet` 的 `capW`（980/1500）又去夹「用户拖出来的尺寸」、`resizeTxSheet` 再夹一次，`TX_MAX_W` 形同虚设。③ footer 在 `<main>` 里、侧栏是它的兄弟节点，开侧栏 `main` 变窄，而 footer 是 `h-7` 单行 flex 且 `<span>` 的 `min-width:auto` 压不下去 → 溢出的提示被裁（顶栏在侧栏之外，宽度不变，所以「关掉侧栏就好了」）。
- 改法：① 缩略图复用纸上的 `.tx-zoom` + `.tx-flow`（裁切只在外层那一步），`.txp-flow` 规则整条删除、`.txp-zoom` 只留 `transform-origin`，并把 `--tx-colh` 一起传进去（图片与纸上同样限到一栏高）。② `txLimit` 拆 `autoWidth`（只服务「没拖过边界时的自适应」）与 `height`，用户拖出来的宽度只受 `TX_MAX_W` 限制并提到 2600；纵向仍一屏封顶（一张纸装下整篇就没有翻页可言），超出舞台的部分由 `.reader-page-area` 的 `overflow:auto` 兜住，右边缘手柄滚过去照样拖得着。③ footer 改 `min-h-[1.75rem] + flex-wrap + whitespace-nowrap`，精简掉重复提示，文字模式那条补上快捷键。④ 新增 `shortcutHighlight()`：现场读 `window.getSelection()`，`closest('.reader-text')` 找正文根，用与浮条同一个 `rangeOffsets()` 量偏移；某条高亮整条落在选区内或整个盖住选区就算按到，删（可多条），否则 `addHighlight` 涂当前笔色；接线在 `onKey` 的 Ctrl 分支 `case 'H'`。
- 位置：`ReaderPage.tsx`（`TX_MAX_W`/`TX_ROOM_Y`/`txLimit`/`txSheet`/`resizeTxSheet`/`fitScale`/`TextPageThumb`/`shortcutHighlight`/`onKey`/`footer`/两个 `.tx-grip` 提示）、`index.css`（`.txp-flow` 删除、`.txp-zoom` 精简）。
- 参考：CSS Overflow（多栏分片属于视觉溢出，要靠外层裁切框裁，自己再 hidden 就把后面的栏整条吃掉）；React 的 `useEffect(fn, deps)` 依赖数组在渲染期求值 ⇒ `addHighlight`/`shortcutHighlight` 必须声明在快捷键 effect 之前，否则撞 TDZ（本轮就是这么翻过一次车）。
- 验证：L0 tsc（noUnused*）0 错 + build；L0+ 取证 `work/patch/txp.html`/`txp.mjs` —— 同一份 DOM 两种 overflow，第 1/2/3/7 页中心 `elementFromPoint`：hidden 时全落在 `DIV.zoom`（没画出来），visible 时落在 `P`（有字）。GUI 手测留给用户。
- 遗留：纸横向放到 2600 时缩略图会缩成一条窄带（`ratio = 116/colW`），仍是等比预览；状态条窄窗口下占两行，舞台纵向少约 14px。

## 2026-09-24 · v1.2.5 第 8 轮（选得中字 · 纸底不再漏 · 侧栏有「文字页」）
- 需求：① 单页 / 双页下还是选不中正文；② 侧栏缩回再拉出竟然显示书页的「页面」，要求文字模式保留自己的页面栏（含书签），改字体改纸边要跟着变，又不能和书页页码混；③ 页面下方那截字符排版出错。
- 根因：① `.tx-col`（每一栏上的批注覆盖层）在 CSS 里没有任何规则，默认吃命中事件，整栏被它盖住，鼠标按下根本落不到正文上 —— Playwright `work/patch/txsel.html` 量过：有它时 `elementFromPoint` 返回 `DIV.txcol`、拖选 0 字符；`pointer-events:none` 后同一次拖选 123 字符。② 侧栏标签在文字模式下把「页面」过滤掉了，可顶栏展开按键写死 `setPanel('thumbs')`，收起再展开就停在无效 tab 上，而 `tab === 'thumbs' && pdf` 仍成立（Word 类也有 PDF 渲染件）→ 画出书页页码。③ 栏底在 `TX_PAD_Y + colH`，`.tx-zoom` 却裁到整张纸高（含 46px 下边距），于是「放不下又不许断栏」的整块（`.reader-text pre { overflow-x:auto }` 让代码块不可跨栏断、比一页还高的 `<img>`）一路画进下边距。取证：1200px 的图塞进 632px 的栏 → `flow.scrollHeight` 1209。
- 改法：`.tx-col{pointer-events:none}` + 各交互子元素单独 `auto`；`.tx-zoom` 底边收到 `TX_PAD_Y + colH + TX_BLEED`（与左右同样的出血），img/svg/video/canvas 限到一栏高（`--tx-colh` 由 TextBook 写进来，`object-fit: contain` 等比缩不裁内容），`.tx-flow .md-body pre` 改软换行 `pre-wrap + overflow-wrap: anywhere`。**这条限高别套到 `.reader-plain`**：纯文本整篇就是那一个 `<pre>`。侧栏新增 `TextPageThumb` + `LazyMount`：用与纸上完全相同的 colW/colH/字号/栏距再排一棵正文，外面 `transform: scale()` 等比缩（transform 不改排版 → 分页逐字一致），IntersectionObserver 只在滚到附近时真排；几何由 `TextBook#onLayout` 报回 `txGeom`；文字模式这一栏标签改叫「文字页」并加一行解释，「全部页面 / 仅书签」与书签角标跟书页共用；顶栏展开按键落在当前阅读方式真正存在的那一栏；连续文字模式仍收起这一栏。`goPage` 双页下把偶数页对齐回左页。
- 位置：`ReaderPage.tsx`（`TextPageThumb` / `LazyMount` / `ReaderBody` / `textLooksPlain` / `TextBook` 的 `onLayout`·`--tx-colh`·`.tx-zoom` 高 / `goPage` / 顶栏工具组条件 / 侧栏 `tx` 与 tabs 过滤）、`index.css`（`.tx-col` / `.tx-flow img…` / `.tx-flow .md-body pre` / `.txp-thumb .txp-zoom .txp-flow .txp-lazy`）。
- 参考：Readium / epub.js 的 CSS 多栏分页；MDN「Handling overflow in multi-column layout」（不可断行的块会独占一个 column 并溢出 fragmentainer）；CSS transform 不触发重排（缩略图与纸上分页一致的前提）。
- 验证：tsc（含 `--noUnusedLocals --noUnusedParameters`）0 错 + build；`work/patch/txsel.mjs`、`txsel2.mjs` 取证。GUI 手测留给用户。
- 遗留：缩略图是排版预览、不是画布快照，「本页」仍书页专属；超长文档一屏十几份整篇正文仍有可察觉的重排耗时；连续文字模式仍不给「文字页」这一栏。

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