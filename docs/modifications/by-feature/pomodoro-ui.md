# 番茄钟页 · 视觉与状态机

> 功能线速查：pages/PomodoroPage.tsx（取数 + 栅格 + 快捷键）+ components/pomodoro/PomoStage.tsx（PHASE_VISUALS/bodyColorsFor/TomatoDial）+ PomoPanels.tsx（RHYTHM_PRESETS/PomoParams/RhythmBand/PomoToday）+ stores/pomodoroStore.ts（switchPhase/sync/skip）+ CSS `.pomo-*`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-09 · v1.2.6 第 2 轮（平面化重画 + 等距栅格）
- 需求：界面还是不规矩、间隔过大，模块之间要有统一间距；番茄样式太丑，重新找参考画。
- 根因：舞台是 `flex-direction: column` + 表盘 `flex: 1 1 auto`，卡片一高（h11 = 776px）剩余高度全灌给表盘，
  而 SVG 又写死 `max-height: 430px`，多出来的高度全变成行间空白；再加光晕 / 网点 / 浮尘三层装饰，观感就散。
  果体是四级贝塞尔高光 + `feDropShadow` 立体投影，塑料感强；十二刻度环与果体重叠打架。
- 改法：
  - 舞台改六行等距栅格 `grid-template-rows: auto auto minmax(0,1fr) auto auto auto; gap:14px`（标题 / 阶段 / 表盘 / 循环 / 控制 / 底栏），只有表盘那行吃剩余空间。
  - 表盘交给 SVG 自己缩放：`.pomo-svg { width/height:100%; max-width/max-height:360px }` + 默认 `preserveAspectRatio="xMidYMid meet"`。
    **踩坑记录**：先用 `aspect-ratio:1` + 百分比高度自己算方形，Playwright 量到 280 的行里 SVG 高 330，直接压住下一行的循环点；
    另外 `var()` 在 SVG 的 presentation attribute 里不生效，颜色要么走 CSS class（`.pomo-track`），要么在 JS 里算好字符串。
  - 美术：删 `pomo-glow` / `pomo-grain` / `pomo-motes` / 立体投影 / 十二刻度 / knob 双圈，果体改哑光圆盘 + 五片对称萼叶 + 竖直短茎；
    萼叶要 `rotate(deg - 90)` 才围绕正上张开（叶形本身朝 +x 生长，不减 90 度画出来是一撮歪向右边的草）。
  - 色相仍由 `--pomo-h` 派生，果色改 `bodyColorsFor(phase, progress)` 直接回 hsl 字符串（替掉 `hslToHex` + 四级 `BodyStops`）。
  - 页面栅格：计时卡 h11→h8、参数卡 h7→h8 两列对齐，删「节奏建议」卡（内容收进底栏），今日节奏 y16→y13，`storageKey` 升 v5。
  - 参数卡补一排「整套预设」（标准番茄 / 深度工作 / 轻松节奏）+ 开关组 `mt-auto` 贴底，零散 `mt-4` 统一成根容器 `gap-4`。
- 位置：`PomoStage.tsx`（重写）、`PomoPanels.tsx`、`PomodoroPage.tsx`、`styles/index.css`（`.pomo-*` 整段重写，新增 `.pomo-preset`，删 `.pomo-tips`）。
- 参考：Pomotroid（阶段整块换色 + 大计时字 + 细环）、Flow / Seasons（环形进度 + 极简表盘）、Pomofocus（分段控件 + 循环点 + 整套预设）。只借范式。
- 验证：复用第 1 轮的 `work/patch/pomo-*` 取证页（真实组件 + 打包后真实 CSS），四个阶段态与两张面板截图复核，
  量到 `figureH 280 / svgH 280`、`scrollH == clientH`、`bodyOverflowX false`、无 console 报错；tsc 两端 0 错、build 通过。
- 遗留：`phase` / `completedFocus` 仍不持久化；整套预设只写设置，不重置正在跑的这一段。

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