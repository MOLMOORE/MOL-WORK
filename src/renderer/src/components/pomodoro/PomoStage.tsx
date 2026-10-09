import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import type { PomodoroPhase } from '@shared/types/domain'
import { cn } from '../../lib/utils'

/**
 * 番茄钟舞台（v1.2.6 二次美化）
 * 美术方向参考 Pomotroid（整块页面随阶段换色 + 大号等宽计时）、
 * Pomofocus（阶段分段控件 + 本轮进度点）与 Forest（把时间画成「长熟」的过程）：
 * 专注时番茄由青转红，休息时换成薄荷 / 青蓝的果色，进度环与光晕跟着阶段走。
 */

export interface PhaseVisual {
  /** 阶段色相：写进 --pomo-h，舞台上的光晕、按键、进度点都从它派生 */
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

/** 果体四级渐变：高光 / 亮部 / 本色 / 暗部（HSL 三元组，插值走色相才像真的在长熟） */
type Hsl = [number, number, number]
type BodyStops = [string, string, string, string]

/** 起点是半熟的橙（不是青绿）：整段计时都还像一颗番茄，只是越熟越深 */
const UNRIPE: Hsl[] = [
  [42, 95, 88],
  [38, 90, 66],
  [32, 88, 49],
  [26, 78, 27]
]
const RIPE: Hsl[] = [
  [16, 100, 89],
  [6, 86, 65],
  [359, 71, 47],
  [0, 72, 28]
]
const MINT: Hsl[] = [
  [150, 62, 92],
  [152, 58, 67],
  [155, 60, 42],
  [160, 72, 24]
]
const COOL: Hsl[] = [
  [190, 72, 93],
  [190, 72, 66],
  [192, 68, 47],
  [196, 82, 27]
]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** HSL → #RRGGBB（h 取 0~360 环绕，s/l 为百分比） */
function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp01(s / 100)
  const lig = clamp01(l / 100)
  const chroma = (1 - Math.abs(2 * lig - 1)) * sat
  const sector = hue / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const leg = lig - chroma / 2
  const pick = (a: number, b: number, c: number): [number, number, number] => [
    Math.round((a + leg) * 255),
    Math.round((b + leg) * 255),
    Math.round((c + leg) * 255)
  ]
  let rgb: [number, number, number]
  if (sector < 1) rgb = pick(chroma, x, 0)
  else if (sector < 2) rgb = pick(x, chroma, 0)
  else if (sector < 3) rgb = pick(0, chroma, x)
  else if (sector < 4) rgb = pick(0, x, chroma)
  else if (sector < 5) rgb = pick(x, 0, chroma)
  else rgb = pick(chroma, 0, x)
  return '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

/** 两个 HSL 色之间插值：色相走最近的一头（绿→黄→橙→红），不绕回蓝紫 */
function mixHsl(from: Hsl, to: Hsl, t: number): Hsl {
  const ratio = clamp01(t)
  let delta = to[0] - from[0]
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return [from[0] + delta * ratio, from[1] + (to[1] - from[1]) * ratio, from[2] + (to[2] - from[2]) * ratio]
}

const toStops = (palette: Hsl[]): BodyStops => palette.map((channel) => hslToHex(channel[0], channel[1], channel[2])) as BodyStops

/** 阶段 + 进度 → 果体配色：专注时由青转红，休息时换成薄荷 / 青蓝 */
export function bodyStopsFor(phase: PomodoroPhase, progress: number): BodyStops {
  if (phase === 'shortBreak') return toStops(MINT)
  if (phase === 'longBreak') return toStops(COOL)
  const raw = clamp01(progress)
  const ease = Math.pow(raw, 0.75) // 前段熟得快一点，后半程是慢慢转深
  return toStops(UNRIPE.map((color, index) => mixHsl(color, RIPE[index], ease)))
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0')
}

/** 番茄果形（贝塞尔：顶部带肩、底部饱满）+ 五瓣萼叶 + 外圈进度环 */
function TomatoArt({
  progress,
  secondsLeft,
  subLabel,
  stops,
  running
}: {
  progress: number
  secondsLeft: number
  subLabel: string
  stops: BodyStops
  running: boolean
}): JSX.Element {
  const safeProgress = clamp01(progress)
  const radius = 126
  const cx = 150
  const cy = 194
  const circumference = 2 * Math.PI * radius
  const angle = safeProgress * 360
  const knob = {
    x: cx + radius * Math.sin((angle * Math.PI) / 180),
    y: cy - radius * Math.cos((angle * Math.PI) / 180)
  }
  // 每个实例一套 id：多个舞台同时存在时渐变与滤镜不会互相覆盖
  const uid = useId().replace(/:/g, '')
  const idBody = 'pomoBody' + uid
  const idArc = 'pomoArc' + uid
  const idLeaf = 'pomoLeaf' + uid
  const idDrop = 'pomoDrop' + uid
  const idText = 'pomoText' + uid
  const leaves: { deg: number; scale: number }[] = [
    { deg: -78, scale: 0.82 },
    { deg: -40, scale: 1 },
    { deg: -4, scale: 0.72 },
    { deg: 32, scale: 1 },
    { deg: 70, scale: 0.82 }
  ]

  return (
    <svg
      viewBox="8 34 284 302"
      className="pomo-svg"
      role="img"
      aria-label={formatClock(secondsLeft) + ' ' + subLabel}
    >
      <defs>
        <radialGradient id={idBody} cx="36%" cy="26%" r="88%">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="38%" stopColor={stops[1]} />
          <stop offset="72%" stopColor={stops[2]} />
          <stop offset="100%" stopColor={stops[3]} />
        </radialGradient>
        <linearGradient id={idArc} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="52%" stopColor={stops[1]} />
          <stop offset="100%" stopColor={stops[2]} />
        </linearGradient>
        <linearGradient id={idLeaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9BEAB6" />
          <stop offset="55%" stopColor="#2FBF6A" />
          <stop offset="100%" stopColor="#146B34" />
        </linearGradient>
        <filter id={idDrop} x="-32%" y="-32%" width="164%" height="164%">
          <feDropShadow dx="0" dy="12" stdDeviation="15" floodColor={stops[3]} floodOpacity="0.42" />
        </filter>
        <filter id={idText} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3.4" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* 进度环：底轨 + 十二个刻度 + 渐变弧 + 端点 */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="9" />
      {Array.from({ length: 12 }, (_, index) => index * 30).map((deg) => (
        <line
          key={deg}
          x1={cx}
          y1={cy - radius - 11}
          x2={cx}
          y2={cy - radius - (deg % 90 === 0 ? 3 : 6)}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={deg % 90 === 0 ? 0.62 : 0.3}
          strokeWidth={deg % 90 === 0 ? 2.2 : 1.4}
          strokeLinecap="round"
          transform={'rotate(' + deg + ' ' + cx + ' ' + cy + ')'}
        />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={'url(#' + idArc + ')'}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0.004, safeProgress))}
        transform={'rotate(-90 ' + cx + ' ' + cy + ')'}
        className="pomo-arc"
      />
      <g className={cn('pomo-knob', running && 'is-live')}>
        <circle cx={knob.x} cy={knob.y} r="11" fill={stops[1]} opacity="0.26" />
        <circle cx={knob.x} cy={knob.y} r="6" fill="#FFFFFF" stroke={stops[2]} strokeWidth="2.4" />
      </g>

      {/* 果体 */}
      <path
        d="M150 84
           C 98 76, 48 110, 40 162
           C 34 206, 54 256, 100 278
           C 122 288, 178 288, 200 278
           C 246 256, 266 206, 260 162
           C 252 110, 202 76, 150 84 Z"
        fill={'url(#' + idBody + ')'}
        filter={'url(#' + idDrop + ')'}
      />
      {/* 左上大弧高光 + 右上反光 + 底部暗部 */}
      <path
        d="M88 130 C 100 102, 126 88, 150 86 C 130 96, 110 114, 100 142 C 94 156, 92 168, 94 178 C 84 164, 82 146, 88 130 Z"
        fill="#FFFFFF"
        opacity="0.34"
      />
      <ellipse cx="198" cy="124" rx="15" ry="9" fill="#FFFFFF" opacity="0.22" transform="rotate(26 198 124)" />
      <path d="M100 278 C 122 288, 178 288, 200 278 C 176 268, 124 268, 100 278 Z" fill="#000000" opacity="0.12" />

      {/* 果茎与五瓣萼叶 */}
      <g transform="translate(150, 86)">
        <path d="M0 -4 C -2 -18, 5 -28, 15 -33" stroke="#146B34" strokeWidth="6" fill="none" strokeLinecap="round" />
        {leaves.map((leaf) => (
          <g key={leaf.deg} transform={'rotate(' + leaf.deg + ') scale(' + leaf.scale + ')'}>
            <path d="M0 0 C 9 -20, 32 -28, 48 -15 C 35 5, 12 11, 0 0 Z" fill={'url(#' + idLeaf + ')'} />
            <path d="M3 -2 Q 24 -16 45 -14" stroke="#166534" strokeWidth="1.2" fill="none" opacity="0.75" strokeLinecap="round" />
          </g>
        ))}
        <circle r="5.5" fill="#166534" />
        <circle r="2.5" cx="-1.5" cy="-1.5" fill="#4ADE80" opacity="0.8" />
      </g>

      {/* 中央时间 */}
      <text
        x="150"
        y="200"
        textAnchor="middle"
        className="clock-face pomo-clock"
        fill="#FFFFFF"
        filter={'url(#' + idText + ')'}
      >
        {formatClock(secondsLeft)}
      </text>
      <text x="150" y="230" textAnchor="middle" className="pomo-sub" fill="rgba(255,255,255,0.92)" filter={'url(#' + idText + ')'}>
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
  /** 底部插槽：关联任务一类的控件 */
  footer?: ReactNode
}

/** 番茄钟主舞台：阶段分段控件 + 会「长熟」的番茄 + 本轮进度点 + 控制按键 */
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
  const stops = bodyStopsFor(phase, progress)
  const rounds = Math.max(1, roundsPerLong)
  const subLabel =
    phase === 'focus' ? '第 ' + (Math.min(rounds, completedFocus + 1)) + ' 个番茄' : visual.label + '中'
  const nextLabel =
    phase === 'focus'
      ? completedFocus + 1 >= rounds
        ? '长休息'
        : '短休息'
      : '专注'

  return (
    <div
      className="pomo-stage"
      data-phase={phase}
      data-running={running}
      style={{ '--pomo-h': String(visual.hue) } as CSSProperties}
    >
      <div className="pomo-glow" aria-hidden />
      <div className="pomo-grain" aria-hidden />
      {running ? (
        <span className="pomo-motes" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}

      <div className="relative flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pomo-title">番茄工作法</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            专注 {focusMinutes} 分钟 · 休息 {shortMinutes} 分钟 · 每 {rounds} 个长休息
          </p>
        </div>
        <div className="pomo-today shrink-0" title="今日累计专注（含番茄钟与手动记录）">
          <span className="pomo-today-num">{todayTomatoes}</span>
          <span className="pomo-today-unit">个番茄</span>
          <span className="pomo-today-min">{todayMinutes} 分钟</span>
        </div>
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
        <TomatoArt progress={progress} secondsLeft={secondsLeft} subLabel={subLabel} stops={stops} running={running} />
      </div>

      <div className="pomo-dots" aria-label={'本轮 ' + completedFocus + ' / ' + rounds}>
        {Array.from({ length: rounds }, (_, index) => (
          <span key={index} className="pomo-dot" data-done={index < completedFocus} data-current={index === completedFocus}>
            <svg viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="12" r="6.4" />
              <path d="M10 6.1c0-2.1 1.4-3.4 3.3-4" fill="none" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 6.2C8.3 4.2 6.2 3.9 4.6 4.8c1.6 2 3.7 2.3 5.4 1.4Z" />
            </svg>
          </span>
        ))}
        <span className="pomo-dots-label">
          本轮 {completedFocus} / {rounds} · 下一个是{nextLabel}
        </span>
      </div>

      <div className="pomo-controls">
        <button type="button" className="pomo-main" onClick={onToggle}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? '暂停' : visual.action}
        </button>
        <button type="button" className="pomo-ghost" title="重置本阶段（R）" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" className="pomo-ghost" title="跳到下一阶段" onClick={onSkip}>
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
      <p className="pomo-hint">空格 开始 / 暂停 · R 重置 · 切页面计时不停</p>

      {footer ? <div className="relative w-full">{footer}</div> : null}
    </div>
  )
}