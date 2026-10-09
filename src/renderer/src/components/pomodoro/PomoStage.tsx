import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import type { PomodoroPhase } from '@shared/types/domain'
import { cn } from '../../lib/utils'

/**
 * 番茄钟舞台（v1.2.6 第二轮：平面化重画 + 等距栅格）
 * 美术方向参考 Pomotroid / Flow / Seasons 这类极简环形计时器：
 * 去掉上一版的高光弧、网点纸纹、飘浮粒子与立体投影，只留「一条进度环 + 一颗平面番茄 + 大号计时数字」；
 * 版式改成六行栅格（标题 / 阶段 / 表盘 / 循环 / 控制 / 底栏），行距统一 14px，
 * 不再用 flex 的 flex:1 把剩余空间全灌给表盘，避免卡片一高就出现大片空白。
 */

export interface PhaseVisual {
  /** 阶段色相：写进 --pomo-h，环、按键、进度点与两侧面板的强调色都从它派生 */
  hue: number
  label: string
  /** 主按键上的文案 */
  action: string
}

export const PHASE_VISUALS: Record<PomodoroPhase, PhaseVisual> = {
  focus: { hue: 8, label: '专注', action: '开始专注' },
  shortBreak: { hue: 152, label: '短休息', action: '开始短休息' },
  longBreak: { hue: 190, label: '长休息', action: '开始长休息' }
}

const PHASE_ORDER: PomodoroPhase[] = ['focus', 'shortBreak', 'longBreak']

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** SVG 的 fill / stroke 吃标准 CSS 颜色；逗号写法在 Chromium 里最稳，色相做环绕 */
function hsl(h: number, s: number, l: number): string {
  return 'hsl(' + (((h % 360) + 360) % 360) + ', ' + s + '%, ' + l + '%)'
}

export interface BodyColors {
  /** 果体主色（径向渐变中段） */
  base: string
  /** 果体暗部（渐变收尾，只留一点体积感） */
  deep: string
  /** 果体亮部（渐变起点，左上受光） */
  light: string
  /** 进度环与端点用色 */
  ring: string
}

/**
 * 果色：专注阶段由「半熟橙」滑到「熟红」，休息阶段固定用薄荷 / 青蓝。
 * 只改 HSL 三个数，不再做四级高光——上一版那种塑料感就是这么来的。
 */
export function bodyColorsFor(phase: PomodoroPhase, progress: number): BodyColors {
  const t = clamp01(progress)
  if (phase === 'shortBreak') {
    return { base: hsl(152, 42, 44), deep: hsl(155, 46, 33), light: hsl(150, 42, 57), ring: hsl(152, 46, 40) }
  }
  if (phase === 'longBreak') {
    return { base: hsl(196, 56, 46), deep: hsl(200, 62, 33), light: hsl(193, 58, 60), ring: hsl(197, 60, 42) }
  }
  const hue = 26 - 26 * t
  return { base: hsl(hue, 76, 50 - 3 * t), deep: hsl(hue - 3, 78, 36), light: hsl(hue + 9, 86, 63), ring: hsl(hue, 74, 46) }
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0')
}

/** 表盘几何：环在外、果在内，两者之间固定留 30 单位空隙，缩放时比例不变 */
const DIAL = { size: 300, cx: 150, cy: 150, ring: 132, body: 96, ringWidth: 6 }

/** 会「长熟」的平面番茄表盘：进度环 + 果体 + 五瓣萼叶 + 中央计时数字 */
function TomatoDial({
  phase,
  progress,
  secondsLeft,
  subLabel,
  running
}: {
  phase: PomodoroPhase
  progress: number
  secondsLeft: number
  subLabel: string
  running: boolean
}): JSX.Element {
  const colors = bodyColorsFor(phase, progress)
  const { size, cx, cy, ring, body, ringWidth } = DIAL
  const circumference = 2 * Math.PI * ring
  const swept = Math.max(0.004, clamp01(progress))
  // 端点：从 12 点起顺时针走，落在环上
  const angle = (swept * 360 - 90) * (Math.PI / 180)
  const capX = cx + ring * Math.cos(angle)
  const capY = cy + ring * Math.sin(angle)
  // 每个实例一套 id：多实例共存时 url(#id) 不会互相抢渐变
  const gradientId = 'pomoBody' + useId().replace(/:/g, '')
  const bodyTop = cy - body

  return (
    <svg
      viewBox={'0 0 ' + size + ' ' + size}
      className="pomo-svg"
      role="img"
      aria-label={formatClock(secondsLeft) + ' ' + subLabel}
    >
      <defs>
        <radialGradient id={gradientId} cx="34%" cy="26%" r="84%">
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="56%" stopColor={colors.base} />
          <stop offset="100%" stopColor={colors.deep} />
        </radialGradient>
      </defs>

      {/* 进度环：底轨走主题令牌，进度弧走阶段色 */}
      <circle className="pomo-track" cx={cx} cy={cy} r={ring} />
      <circle
        className="pomo-arc"
        cx={cx}
        cy={cy}
        r={ring}
        stroke={colors.ring}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - swept)}
        transform={'rotate(-90 ' + cx + ' ' + cy + ')'}
      />
      <circle className={cn('pomo-cap', running && 'is-live')} cx={capX} cy={capY} r={5.5} fill={colors.ring} />

      {/* 果体 */}
      <circle cx={cx} cy={cy + 2} r={body} fill={'url(#' + gradientId + ')'} />
      {/* 萼叶：五片扁叶绕正上方对称展开 + 一小段竖直果茎，贴在果顶，不越过进度环 */}
      <g transform={'translate(' + cx + ', ' + (bodyTop + 7) + ')'}>
        <path d="M0 3 C 0 -7, 1 -13, 4 -18" stroke={hsl(148, 36, 26)} strokeWidth="4.5" fill="none" strokeLinecap="round" />
        {[-74, -37, 0, 37, 74].map((deg, index) => (
          <path
            key={deg}
            /* 叶形本身朝 +x 生长，整体再转 -90 才是朝上张开的一圈 */
            transform={'rotate(' + (deg - 90) + ') scale(' + (index === 2 ? 0.8 : 1) + ')'}
            d="M0 0 C 9 -11, 26 -15, 37 -8 C 24 4, 9 6, 0 0 Z"
            fill={index % 2 === 0 ? hsl(148, 40, 33) : hsl(150, 44, 39)}
          />
        ))}
      </g>

      {/* 中央计时 */}
      <text className="clock-face pomo-clock" x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle">
        {formatClock(secondsLeft)}
      </text>
      <text className="pomo-sub" x={cx} y={cy + 38} textAnchor="middle">
        {subLabel}
      </text>
    </svg>
  )
}

export interface PomoStageProps {
  phase: PomodoroPhase
  running: boolean
  /** 本阶段已完成比例 0~1 */
  progress: number
  secondsLeft: number
  /** 本轮长休息前已完成的专注数 */
  completedFocus: number
  roundsPerLong: number
  /** 今日已完成番茄数（按专注分钟折算） */
  todayTomatoes: number
  todayMinutes: number
  focusMinutes: number
  shortMinutes: number
  onToggle: () => void
  onReset: () => void
  onSkip: () => void
  onSwitchPhase: (phase: PomodoroPhase) => void
  /** 底栏左侧插槽：关联任务一类的控件 */
  footer?: ReactNode
}

/** 番茄钟主舞台：标题行 + 阶段分段控件 + 表盘 + 循环进度 + 控制键 + 底栏 */
export function PomoStage({
  phase,
  running,
  progress,
  secondsLeft,
  completedFocus,
  roundsPerLong,
  todayTomatoes,
  todayMinutes,
  focusMinutes,
  shortMinutes,
  onToggle,
  onReset,
  onSkip,
  onSwitchPhase,
  footer
}: PomoStageProps): JSX.Element {
  const visual = PHASE_VISUALS[phase]
  const rounds = Math.max(1, roundsPerLong)
  const subLabel = phase === 'focus' ? '第 ' + Math.min(rounds, completedFocus + 1) + ' 个番茄' : visual.label + '中'
  const nextLabel = phase === 'focus' ? (completedFocus + 1 >= rounds ? '长休息' : '短休息') : '专注'

  return (
    <div
      className="pomo-stage"
      data-phase={phase}
      data-running={running}
      style={{ '--pomo-h': String(visual.hue) } as CSSProperties}
    >
      <div className="pomo-head">
        <div className="min-w-0">
          <p className="pomo-title">番茄钟 · {visual.label}</p>
          <p className="pomo-desc">
            专注 {focusMinutes} 分 · 短休 {shortMinutes} 分 · 每 {rounds} 个长休息
          </p>
        </div>
        <p className="pomo-today">
          今日 <b>{todayTomatoes}</b> 个 · {todayMinutes} 分钟
        </p>
      </div>

      <div className="pomo-rail" role="tablist" aria-label="选择阶段">
        {PHASE_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === phase}
            data-active={key === phase}
            className="pomo-rail-item"
            onClick={() => onSwitchPhase(key)}
          >
            <span className="pomo-rail-dot" />
            {PHASE_VISUALS[key].label}
          </button>
        ))}
      </div>

      <div className="pomo-figure">
        <TomatoDial
          phase={phase}
          progress={progress}
          secondsLeft={secondsLeft}
          subLabel={subLabel}
          running={running}
        />
      </div>

      <div className="pomo-cycle">
        <span className="pomo-dots" aria-label={'本轮 ' + completedFocus + ' / ' + rounds}>
          {Array.from({ length: rounds }, (_, index) => (
            <i key={index} data-done={index < completedFocus} data-current={index === completedFocus} />
          ))}
        </span>
        <span className="pomo-cycle-text">
          本轮 {completedFocus} / {rounds} · 下一个是{nextLabel}
        </span>
      </div>

      <div className="pomo-controls">
        <button type="button" className="pomo-ghost" title="重置本阶段（R）" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" className="pomo-main" onClick={onToggle}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? '暂停' : visual.action}
        </button>
        <button type="button" className="pomo-ghost" title="跳到下一阶段" onClick={onSkip}>
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      <div className="pomo-foot">
        {footer ?? <span className="pomo-desc">不关联任务时，专注只计入今日统计</span>}
        <span className="pomo-hint">空格 开始 / 暂停 · R 重置 · 切页不停</span>
      </div>
    </div>
  )
}