# 阅读 · 页面对比工作台

> 功能线速查：ReaderPage.tsx（CompareOverlay/CompareCard/compareSlots/clampCard/clampPan/setCardZoom/shiftZ/raise/ladder/budgetScale）+ index.css（.cmp-*）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

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