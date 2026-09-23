# 阅读 · 页面对比工作台

> 功能线速查：ReaderPage.tsx（CompareOverlay/CompareCard/compareSlots/clampCard/setCardZoom/shiftZ/raise/normalizeZ/zCollides/cmpKey/stackOrder/layerNo/stack/relayout/clampScroll/scrollMax/contentSize/frameRefs/ladder/budgetScale）+ index.css（.cmp-*）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 5 轮
- 需求：①「上下层显示」还是点了没反应；② 放大后左键拖不动右下（中键在同一片也失灵），但下边右边的滚动条一直能拖。
- 根因：
  1. **层级编号撞车**：挑页是一页一页加进来的，合并时只有新页取 compareSlots 的格子、老页保留自己那份，于是两页的 z 常相等（加第 2、3 页必撞）；shiftZ 交换两个相等的数 = 空操作。第 4 轮修的「方向写反」是真 bug，但这条一直在，所以三轮都报「无效」。
  2. **一点就置顶**：startDrag 无条件 raise()，而放大后左键按住纸面走的也是 startDrag —— 手动调好的层级一按纸面就没了。
  3. **起拖判据用错字段**：MDN 写明 MouseEvent.offsetX 是相对**被命中的元素**（纸面）算的，不是 currentTarget（纸框）；放大后 offsetX 远大于纸框 clientWidth，右下那一大片全被误判成滚动条 → return，左键平移与中键拖整页同时失灵，而原生滚动条不受影响。
  4. **可滚上限按公式推**：漏掉纸框 padding:8px（Blink 对滚动容器末端 padding 是否算进可滚范围有差异，crbug 748518），实测 6 倍时右下角正好藏 8px。
- 改法：normalizeZ 把层级重排成互不相同的 1..n（相对次序不变，用 zCollides 决定何时重排）；只有「搬整张纸」（拖标题条 / 中键）才 raise，左键平移不动层级；角标改 stackOrder/layerNo 统一算并显示「n / 总数」，到顶到底 disabled + .cmp-ico:disabled；新增顶部「叠放」stack() 把几页错开摞起来（不重叠时层级根本看不出来）；
  判据改成按纸框矩形量（clientX - rect.left vs clientWidth）；可滚范围改成布局后从 DOM 量（scrollWidth - clientWidth）按 cmpKey 缓存进 scrollMax，clampScroll 优先用真值、越界值渲染后写回状态。
- 位置：ReaderPage.tsx（cmpKey / zCollides / normalizeZ / scrollMax / clampScroll / startDrag / stackOrder / layerNo / stack / 写回滚动的 useLayoutEffect）、index.css（.cmp-ico:disabled）。
- 参考：MDN「MouseEvent.offsetX：相对触发事件元素的填充边」；crbug 748518（滚动容器末端 padding）。
- 顺带：放大锚点换算补上纸框内边距（新增 CMP_FRAME_PAD，与 .cmp-frame 的 padding 互相注记），连滚轮放大时指针那一点不再逐档漂移。
- 验证：Playwright 最小 DOM 复现拿到数字：纸框 320x220 / 放大 6 倍 / 滚到最右下时纸面中点 offsetX=875（旧判据误判 true，新判据 false）；公式上限 706 时纸面右下角藏 8px，DOM 真上限 723 时完整可见；两页 z 相等时换 z 无变化、改成 2 后 elementFromPoint 立刻换人。L0：tsc 0 错 + build 通过。
- 遗留：scrollMax 条目在页移出后不清（量很小）；叠放步长写死 30/26px，超宽时会被 clampCard 停在画布边；中键拖整页仍会置顶（有意）。

## 2026-09-23 · v1.2.5 第 4 轮
- 需求：上/下层还是不能用；放大到一定程度只能看左上，右下拖不出来。
- 根因 1（层级）：`order` 按 z 降序（index 0 = 最上面），`shiftZ` 却换 `order[index + step]` —— 最顶上那张点「上移」没有邻居（无反应），下面那张点「上移」反而沉到底。方向写反。
- 根因 2（看不全）：位移钳制 `clampPan` 假设纸框能看到完整内容，但 `clampCard` 会把纸框高度压到画布以内，被裁掉的那段内容永远拖不到；手算的 ±max 也总差一截。
- 改法：`shiftZ` 换成 `order[index - step]`；编号角标改成「点一下置顶」并显示第几层（1 在最上面）。
  平移模型整个换掉：内容层用 CSS `zoom`（真的撑开布局尺寸），纸框 `overflow:auto` 自己出滚动条，`panX/panY` 语义变成滚动位置，`clampScroll` 只锁 [0, 内容-框]；
  滚动位置由 `useLayoutEffect` 写回 DOM、`onScroll` 同步回状态；放大保持指针那一点不动：`newScroll = (oldScroll + k) * ratio - k`。
  `.cmp-grip` 挪出纸框（滚动容器内的绝对定位会跟着内容跑）；拖动起点落在滚动条上时不抢事件。
- 参考：CSS 规范里 flex 用 `justify-content:center` 会把溢出推到不可滚区域，`margin:auto` 不会 —— 所以居中改用 `margin:auto`。
- 位置：`ReaderPage.tsx`（contentSize / clampScroll / setCardZoom / onDragMove / frameRefs / onFrameScroll / shiftZ / raise）、`index.css`（.cmp-frame / .cmp-page / .cmp-grip / .cmp-layer）。
- 遗留：CSS `zoom` 是 Chromium 行为（本项目只发 Windows 桌面版，可接受）。

## 2026-09-22 · v1.2.5 第 3 轮
- 需求：每页可调显示优先级；中键能拖任意页（含放大状态）；放大后能看全整页。
- 改法：`CompareCard.z` + `shiftZ()` + `.cmp-layer` 角标；`middleDown` preventDefault；`startDrag` 里 middle→move；`compareSlots` 的 `cellH` 先减 `CMP_BAR`；新增 `clampCard()` 约束纸框不出画布。
- 遗留（用户第 4 轮反馈）：① 上下层「依旧无法使用」；② 放大到一定程度仍只能看到左上部分，右下拖不出来。

## 2026-09-22 · v1.2.5 第 2 轮
- 需求：对比页被顶部遮挡 → 改整页工作台，可自由拖动、单独放大后拖着看。
- 根因：浮层挂在阅读页内部，被工具条与皮肤层叠上下文压住。
- 改法：`createPortal(…, document.body)` + `fixed inset-0 z-[70]`；`ResizeObserver` 测真实画布；`ladder()` 1.15 阶梯重画 + CSS 补差；`budgetScale()` 12M 像素预算。
- 参考：MDN —— 带 transform/filter/backdrop-filter 的祖先会接管 fixed 的包含块（所以必须 portal 到 body）。