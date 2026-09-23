# 阅读 · 翻页动效与热区

> 功能线速查：ReaderPage.tsx（turning/step/resetPage/canZoneFlip/wheelFlip）+ index.css（.mw-book* / .mw-layer* / @keyframes mw-* / .mw-pagezone*）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 5 轮
- 需求：普通滚轮翻页要能关，防误触。
- 改法：新增 wheelFlip 状态（localStorage 键 workstation.reader.wheelflip.v1，默认开 = 原行为）；滚轮回调里在 Ctrl 判据之后加「wheelFlip 为假就 return」，所以 Ctrl+滚轮缩放、「连续」布局的原生滚动都不受影响；工具条「翻页动效」右边加 ToggleChip「滚轮翻页」，只在书页模式且 layout 非 continuous 时出现（连续模式本来就不走这条路径），切换时 showHint 提示一下。
- 位置：ReaderPage.tsx（WHEEL_FLIP_KEY / wheelFlip / 滚轮 onWheel / 工具条 ToggleChip）。
- 验证：L0（tsc 0 错 + build 通过，产物回读命中 wheelkey 与「滚轮翻页」）。
- 遗留：关掉后侧边热区、←／→、上方按键照常翻页 —— 只关滚轮这一条路径，是有意的。

## 2026-09-22 · v1.2.5 第 1 轮
- 需求：单页推移/覆盖/翻书回翻闪一下；双页效果差、不丝滑、也闪。
- 根因：① 动效挂在单页上，双页两页各自散开、中缝互盖；② `preserve-3d` 使 z-index 失效，两张纸在 3D 里穿插 → 翻到一半跳层；③ 目标页画布未画好就开始动 → 白纸蹦内容；④ 整层平移撑出滚动条抖一格。
- 改法：动效挂图层（双页 = 一整张纸整体移动）；先画再动（预取 + `peekCanvas` 同帧贴缓存）；去掉 preserve-3d；翻书不越 90° 并同步淡出；回翻走物理方向 `is-reverse`；`.is-turning{overflow:hidden}`。
- 参考：MDN / CSS WG 关于 `transform-style: preserve-3d` 会创建 3D 上下文并按 3D 位置绘制（z-index 不参与）；pdf.js `renderPage` 的 CSS 尺寸 = viewport 尺寸、backing 上限 2×。
- 验证：L0（build + 产物回读）。
- 遗留：排版模式 iframe 不套图层（重挂会白屏），只平滑滚动。

## 2026-09-22 · v1.2.5 第 1 轮（热区与到头提示）
- 需求：侧边点击翻页不得触发双击放大；到头要给提示。
- 改法：`.mw-pagezone` 的 `onDoubleClick` stopPropagation；`canZoneFlip` 在放大 / 可拖动 / 连续 / 圈注模式下收起；`step()` 越界时 `showHint(已到最后一页 / 已在第一页)`（`.reader-hint`，1.6s 自消）。