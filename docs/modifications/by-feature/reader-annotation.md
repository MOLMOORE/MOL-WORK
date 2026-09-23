# 阅读 · 批注（圈注 / 旁注）

> 功能线速查：ReaderPage.tsx（InkStrokes/InkDots/NoteRail/MarkComposer/handleInk/inkMode/showInk/showNotes/noteSide）+ index.css（.mw-ink* / .mw-note-*）+ note_marks.region（DB v8）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

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