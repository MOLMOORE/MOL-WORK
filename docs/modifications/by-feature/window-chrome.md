# 窗口外壳 · 自绘标题栏 / 全屏 / Esc

> 功能线速查：components/layout/TitleBar.tsx + src/main/index.ts + src/renderer/src/lib/escape.ts
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-22 · v1.2.5 第 1 轮
- 需求：全屏下按 Esc 退出全屏；最小化按钮改回减号样式。
- 改法：`lib/escape.ts` 用计数式 `blockEscapeFullscreen()` —— 阅读页开着侧栏 / 注释框 / 对比 / 提取 / 圈注模式时先关它们，全局兜底才退全屏；TitleBar 里最小化画成一条横线（减号）。
- 位置提醒：`blockEscapeFullscreen` 的依赖数组在 ReaderPage 的 useEffect 里，新增浮层状态要一并加进依赖。