# 阅读 · 查找（全文检索 · 命中显示）

> 功能线速查：ReaderPage.tsx（runFind / gotoHit / jumpToHit / findQuery·findTerm / findHits / findIndex·activeIndex / activeHit / findRings / handleFindSpots / applyTextFind / wrapFindRange / FindSpot / FindHit / FindRing + ReaderPanel 的「查找」一栏）+ src/renderer/src/lib/pdf.ts（pageFindHits / pageTextLines / PdfTextSeg）+ index.css（mark.tx-find / .mw-ink.is-find）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-24 · v1.2.5 第 8 轮（新建这条功能线：能搜就涂色，涂不了就圈出来）
- 需求：查找功能改成「可搜索的文本就高亮，页面不好高亮的就用类似注释的圈注把命中圈出来」。
- 改法：`runFind` 从 `ReaderPanel` 提到 `ReaderPage`，命中清单成三份共用的唯一状态 —— 侧栏列表、文字舞台涂色、书页画圈都读它。
  - 文字（分页 + 连续）：`applyTextFind(root, needle, active, geom)` 在 `useLayoutEffect` 里把每一处命中套上 `mark.tx-find`（当前这处再 `.is-active`），顺手按栏分界算出每处落在第几页，`onFindSpots` 报回上层当列表。**从后往前套** 才对：先改前面的文字节点会把后面的偏移全弄错。口径与荧光标记相同（渲染后的正文 textContent），换字体改字号不跑位。
  - 书页：`pdf.ts#pageFindHits(page, needle, limit)` —— 逐页 `getTextContent()`，按 baseline 的 y 分行（沿用 `pageText` 的 3px 判据，改成 `pageTextLines` 后被两者共用），命中跨的几个片段合成矩形。坐标归一化到**页面自身**：用 `page.view` 那个裁剪框（pdf.js 2.16 **没有** `page.width/height`），y 轴翻转，旋转交给 `pageToDisplay`，于是缩放 / 旋转 / 双页都不用特判。画 = 复用 `InkStrokes`（新增 `variant: 'find'` → `.mw-ink.is-find`，虚线提醒色且不吃鼠标）。
  - 排版模式（网页 / EPUB）：仍走 iframe 自带查找。
- 交互：输入框 + 「查找」+「上一处 / 下一处」（绕圈走）+ 命中列表（点一条 = 跳到那一页并把它标成当前处）；Ctrl+F 或点顶栏放大镜会聚焦输入框；输入框里的词与已查的词分开（`findQuery` / `findTerm`），改了没回车时提示会说明列表还是上一次的结果。
- 上限与代价：文字每处最多 600、PDF 每页 3 处、全程 120 处；PDF 逐页取文字很贵（无 worker），每 6 页 `setTimeout(0)` 让一次主线程。
- 位置：`ReaderPage.tsx`（上面那串符号 + `PdfStage/PdfPageView/TextStage/TextBook` 各自的 find props）、`lib/pdf.ts`、`index.css`。
- 参考：pdf.js 官方 text-layer 的做法就是「item.transform + viewport 反算矩形」；这里只需要归一化矩形，故不引 viewport 变换，直接用 `page.view` 手算。
- 验证：L0（tsc 严格 + build）；GUI 留给用户手测。
- 遗留：扫描版无文字层搜不到（不做 OCR）；涂色与荧光共用「先拆再套 + normalize」两遍，超长正文连点下一处有可察觉耗时；命中跨页时只按第一处所在的页报名。