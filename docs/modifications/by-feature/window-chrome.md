# 窗口外壳 · 自绘标题栏 / 全屏 / Esc

> 功能线速查：components/layout/TitleBar.tsx + src/main/index.ts + src/renderer/src/lib/escape.ts
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-10 · v1.2.6 第 3 轮（标题栏与顶栏融合）
- 需求：删掉标题栏里多出来的那个软件图标，让软件顶层融合更自然简洁。
- 根因：标题栏左端的 16px 图标与侧栏顶部 36px 品牌图标上下重复；标题栏又自带一条 `border-b`，与下方顶栏之间形成「双层甲板」。
- 改法：`TitleBar.tsx` 去掉 `<img appIcon>` 与 `border-b`，高度 34 → 32；左端改成 `titlebar-drag` 内的一根 `titlebar-rail`；`Sidebar.tsx` 用 `ResizeObserver` 把侧栏真实宽度写进 `:root` 的 `--sidebar-w`，CSS 仅在 `html[data-skin='default']` 下给这根线加 `border-right`，让分隔线从窗口顶边一路续下来（其他皮肤侧栏形状不同，不强行续线）。
- 位置：`components/layout/TitleBar.tsx`、`components/layout/Sidebar.tsx`、`styles/index.css` 的 `.app-titlebar` / `.titlebar-rail`。
- 验证：`npm run build`；retro / terminal / brutalism / magazine 各自那条标题栏下边线未动。
- 遗留：非默认皮肤下标题栏左端是纯空白拖动区；若以后要让侧栏通到窗口顶边，得把 `<TitleBar />` 从 `App.tsx` 根层搬进 `AppLayout`（阅读界面那条独立路由要一并处理）。
## 2026-09-22 · v1.2.5 第 1 轮
- 需求：全屏下按 Esc 退出全屏；最小化按钮改回减号样式。
- 改法：`lib/escape.ts` 用计数式 `blockEscapeFullscreen()` —— 阅读页开着侧栏 / 注释框 / 对比 / 提取 / 圈注模式时先关它们，全局兜底才退全屏；TitleBar 里最小化画成一条横线（减号）。
- 位置提醒：`blockEscapeFullscreen` 的依赖数组在 ReaderPage 的 useEffect 里，新增浮层状态要一并加进依赖。