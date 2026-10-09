# 番茄钟页 · 视觉与状态机

> 功能线速查：pages/PomodoroPage.tsx（取数 + 栅格 + 快捷键）+ components/pomodoro/PomoStage.tsx（PHASE_VISUALS/bodyStopsFor/hslToHex）+ PomoPanels.tsx（PomoParams/RhythmBand/PomoToday）+ stores/pomodoroStore.ts（switchPhase/sync/skip）+ CSS `.pomo-*`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-09 · v1.2.6 第 1 轮（二次美化）
- 需求：参考市面番茄钟软件，主要改页面美观与美术设计。
- 根因：番茄是 130 行内联 SVG 写在页面里，`defs` 的渐变 id 写死；页面只有四个数字输入框 + 一段说明，没有阶段感与节奏感。
- 改法：
  - 一切强调色由**单一变量 `--pomo-h`** 派生（专注 8 / 短休息 152 / 长休息 190），换阶段时整块舞台一起换色；
    舞台外的面板拿不到这个变量，所以 CSS 里统一写 `var(--pomo-h, 8)` 兜底，并由页面把 `phase` 传进 `PomoParams` / `PomoToday`。
  - 番茄「长熟」在 **HSL** 空间插值：RGB 直接从绿插到红会经过一片泥黄（实测就是一颗柠檬）；
    起点再改成「半熟的橙」（h 42/38/32/26），整段计时都像番茄，只是越熟越深。
  - 每个实例一套 `defs` id（`useId()`）：多实例共存时 `url(#id)` 会串色，取证页一次就暴露了。
  - 进度环：十二刻度 + 渐变弧 + 端点脉冲；阶段条 `switchPhase()` 可直接切阶段；空格 / R 快捷键（输入框与统计弹窗里不抢键）。
  - 参数：步进器 + 预设（预设行 `sm:basis-full` 换行，父容器必须带 `flex-wrap`，否则挤在一行里溢出）。
- 位置：`components/pomodoro/PomoStage.tsx`、`PomoPanels.tsx`、`PomodoroPage.tsx`（entries / onKey）、`styles/index.css`（`.pomo-*`）、`stores/pomodoroStore.ts`（`switchPhase`）。
- 参考：Pomotroid（阶段整块换色 + 大计时字 + 细环）、Pomofocus（分段控件 + 循环点）、Forest（时间→生长可视化）。只借范式，未粘代码。
- 验证：Playwright 取证页（真实组件 + 打包后的真实 CSS）看过 4 个阶段态与两张面板；tsc 两端 0 错；`npm run build` 通过。
- 遗留：`phase` / `completedFocus` 不持久化；番茄在浅色皮肤上高光偏亮，若后续加「纯白」类皮肤需回看 `pomo-glow` 透明度。