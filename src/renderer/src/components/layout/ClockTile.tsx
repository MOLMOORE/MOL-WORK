import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { ClockLayout, ClockStyle } from '@shared/types/domain'
import {
  CLOCK_DATE_SIZE_TIERS,
  CLOCK_HEIGHT_TIERS,
  CLOCK_SIZE_TIERS,
  CLOCK_SPACING_TIERS,
  CLOCK_WEIGHT_TIERS,
  CLOCK_WIDTH_TIERS,
  formatClockDate,
  formatClockWeekday,
  nearestTier,
  resolveClockSettings
} from '@shared/constants'
import { FlipDigit } from '../ui/FlipDigit'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../stores/appStore'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export interface ClockTileProps {
  /** 指定风格（设置页预览用）；不传则跟随用户设置 */
  style?: ClockStyle
  /** 指定摆放（设置页预览用）；不传则跟随用户设置 */
  layout?: ClockLayout
}

/**
 * 每种风格的尺寸模型：
 * - heightRatio：时间行的最大字号占方块高度的比例
 * - units：时间串占用的「em」宽度（含冒号/括号等），用于按宽度反推字号
 * - lines：时间占几行（竖排为 3 行）
 */
interface StyleMetrics {
  heightRatio: number
  units: number
  lines: number
}

const STYLE_METRICS: Record<Exclude<ClockStyle, 'stacked'>, StyleMetrics> = {
  flip: { heightRatio: 0.5, units: 4.5, lines: 1 },
  minimal: { heightRatio: 0.52, units: 3.4, lines: 1 },
  ring: { heightRatio: 0.4, units: 6.2, lines: 1 },
  mono: { heightRatio: 0.42, units: 6.3, lines: 1 },
  analog: { heightRatio: 0.82, units: 1.15, lines: 1 },
  dot: { heightRatio: 0.42, units: 5.1, lines: 1 },
  stack: { heightRatio: 0.27, units: 1.7, lines: 3 },
}

/** 观察盒子尺寸：字号据此反推，保证任何大小的方块都不裁切 */
function useBoxSize(): { ref: RefObject<HTMLDivElement>; w: number; h: number } {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = (): void => setSize({ w: element.clientWidth, h: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, w: size.w, h: size.h }
}

/**
 * 可自由拖拽缩放的时钟方块：
 * - 「风格」决定时间怎么显示（翻页 / 极简 / 秒环 / 终端 / 表盘 / 圆点 / 竖排），
 * - 「摆放」决定日期在时间的哪一侧（上 / 下 / 左 / 右），
 * - 字号、笔画粗细、横向与纵向拉伸、字距都从设置里的预设档位取值，
 * - 日期行可开关、可换格式（中文 / 斜杠 / 短横 / 缩写 / 英文）、可显隐星期、可调字号，
 * - 字号按方块实际宽高反推，因此小框也能完整显示（不再出现只显示半截时间）。
 */
export function ClockTile({ style, layout }: ClockTileProps): JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const { style: mode, layout: place } = resolveClockSettings(style ?? settings?.clockStyle, layout ?? settings?.clockLayout)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const { ref, w, h } = useBoxSize()
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const hhmm = time.slice(0, 5)
  const ss = time.slice(6)
  // 日期行：格式 / 星期 / 是否显示，全部可在设置里改
  const dateFormat = settings?.clockDateFormat ?? 'cn'
  const dateText = formatClockDate(now, dateFormat)
  const dateFull =
    settings?.clockShowWeekday === false ? dateText : `${dateText} · ${formatClockWeekday(now, dateFormat)}`
  const vertical = place === 'date-top' || place === 'date-bottom'
  const dateFirst = place === 'date-top' || place === 'date-left'

  // ---- 用户可调参数：全部来自预设档位（旧数据里的任意值按最近档位取） ----------
  const weight = nearestTier(settings?.clockFontWeight ?? 700, CLOCK_WEIGHT_TIERS)
  const scaleX = nearestTier(settings?.clockWidthScale ?? 100, CLOCK_WIDTH_TIERS) / 100
  const scaleY = nearestTier(settings?.clockHeightScale ?? 100, CLOCK_HEIGHT_TIERS) / 100
  const spacingEm = nearestTier(settings?.clockLetterSpacing ?? 0, CLOCK_SPACING_TIERS) / 100
  const metrics = STYLE_METRICS[mode]
  // 字距与字重都会让整串变宽，一并计入所需宽度（每高 100 约宽 2%）
  const weightFactor = 1 + ((weight - 400) / 100) * 0.02
  const units = (metrics.units + Math.max(0, spacingEm) * 7) * weightFactor

  // ---- 自适应字号：先按高度、再按宽度取小，最后除以拉伸系数 ----------------
  const innerW = Math.max(0, w - 24)
  const innerH = Math.max(0, h - 16)
  const fitByHeight = (innerH / metrics.lines) * metrics.heightRatio / scaleY
  const fitByWidth = innerW / units / scaleX
  const auto = Math.min(fitByHeight, fitByWidth)
  const wanted = nearestTier(settings?.clockFontSize ?? 0, CLOCK_SIZE_TIERS)
  // wanted = 0 表示自适应；> 0 时按档位取，但仍不超过方块能容纳的尺寸（永不裁切数字）
  const fontSize = Math.max(8, Math.min(wanted > 0 ? wanted : auto, auto || wanted))
  /** 选中的档位因方块太小而显示不下：设置页据此给出提示 */
  const sizeCapped = wanted > 0 && fontSize < wanted - 1

  // 日期行字号：同样按档位，但不超过方块能给的余量
  const dateTier = nearestTier(settings?.clockDateSize ?? 13, CLOCK_DATE_SIZE_TIERS)
  const dateRoom = Math.min(innerH * 0.22, innerW / 9)
  const dateFontSize = Math.max(8, Math.min(dateTier, Math.max(9, dateRoom)))
  // 方块太小时宁可只显示时间，也不让日期挤掉数字
  const showDate =
    settings?.clockShowDate !== false && innerW > 0 && innerH >= 34 && dateFontSize >= 9.5

  const timeStyle: CSSProperties = {
    fontSize: `${fontSize.toFixed(1)}px`,
    fontWeight: weight,
    letterSpacing: `${spacingEm.toFixed(2)}em`,
    transform: `scaleX(${scaleX}) scaleY(${scaleY})`,
    transformOrigin: 'center center',
    lineHeight: 1.05,
  }

  /** 时间块：仅由「风格」决定 */
  let timeBlock: ReactNode = null
  /** 日期块：位置由「摆放」决定 */
  let dateBlock: ReactNode = null

  if (mode === 'flip') {
    timeBlock = (
      <p className={cn('flex items-baseline tabular-nums text-foreground')} style={timeStyle}>
        {time.split('').map((char, index) => (
          <FlipDigit key={`${index}-${char}`} char={char} />
        ))}
      </p>
    )
  } else if (mode === 'minimal') {
    timeBlock = (
      <div className="flex items-baseline gap-[0.35em]" style={timeStyle}>
        <span className="tabular-nums text-foreground">{hhmm}</span>
        <span className="text-[0.34em] tracking-[0.2em] text-muted-foreground">{ss}</span>
      </div>
    )
  } else if (mode === 'ring') {
    const ring = `${Math.max(18, fontSize * 1.5).toFixed(1)}px`
    timeBlock = (
      <div className="flex items-center gap-[0.5em]">
        <div className="relative" style={{ height: ring, aspectRatio: '1 / 1' }}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - now.getSeconds() / 60)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="tabular-nums text-foreground" style={{ fontSize: `${(fontSize * 0.42).toFixed(1)}px`, fontWeight: weight }}>
              {ss}
            </span>
          </div>
        </div>
        <span className="tabular-nums text-foreground" style={timeStyle}>{hhmm}</span>
      </div>
    )
  } else if (mode === 'analog') {
    const hour = now.getHours() % 12
    const hourAngle = (hour + now.getMinutes() / 60) * 30
    const minuteAngle = (now.getMinutes() + now.getSeconds() / 60) * 6
    const secondAngle = now.getSeconds() * 6
    timeBlock = (
      <div className="flex items-center gap-[0.55em]">
        <svg viewBox="0 0 100 100" style={{ height: `${Math.max(20, fontSize * 1.35).toFixed(1)}px`, aspectRatio: '1 / 1' }} className="shrink-0">
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/25" />
          {Array.from({ length: 12 }, (_, i) => i * 30).map((angle) => (
            <line
              key={angle}
              x1="50"
              y1="8"
              x2="50"
              y2="14"
              stroke="currentColor"
              strokeWidth="3"
              className="text-foreground/45"
              transform={`rotate(${angle} 50 50)`}
            />
          ))}
          <line x1="50" y1="50" x2="50" y2="26" stroke="currentColor" strokeWidth="6" strokeLinecap="round" className="text-foreground" transform={`rotate(${hourAngle} 50 50)`} />
          <line x1="50" y1="50" x2="50" y2="16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-foreground/80" transform={`rotate(${minuteAngle} 50 50)`} />
          <line x1="50" y1="56" x2="50" y2="14" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" transform={`rotate(${secondAngle} 50 50)`} />
          <circle cx="50" cy="50" r="3" fill="currentColor" className="text-foreground" />
        </svg>
        <span className="tabular-nums text-foreground" style={timeStyle}>{hhmm}</span>
      </div>
    )
  } else if (mode === 'dot') {
    timeBlock = (
      <div className="flex items-baseline gap-[0.28em] tabular-nums text-foreground" style={timeStyle}>
        <span>{pad(now.getHours())}</span>
        <span className="text-[0.4em] text-muted-foreground">●</span>
        <span>{pad(now.getMinutes())}</span>
        <span className="text-[0.4em] text-muted-foreground">●</span>
        <span>{pad(now.getSeconds())}</span>
      </div>
    )
  } else if (mode === 'stack') {
    timeBlock = (
      <div className="flex flex-col items-center tabular-nums text-foreground" style={{ ...timeStyle, gap: `${(fontSize * 0.06).toFixed(1)}px` }}>
        <span>{pad(now.getHours())}</span>
        <span>{pad(now.getMinutes())}</span>
        <span className="text-[0.62em] text-muted-foreground">{pad(now.getSeconds())}</span>
      </div>
    )
  } else {
    timeBlock = (
      <span className="font-mono tabular-nums text-tint-success" style={timeStyle}>
        {`[${time}]`}
      </span>
    )
  }

  dateBlock = showDate ? (
    <p
      className={cn('whitespace-nowrap text-muted-foreground', mode === 'mono' && 'font-mono')}
      style={{ fontSize: `${dateFontSize.toFixed(1)}px`, lineHeight: 1.3 }}
    >
      {mode === 'mono' ? `> ${dateFull}` : dateFull}
    </p>
  ) : null

  return (
    <div
      ref={ref}
      data-clock-capped={sizeCapped ? '1' : undefined}
      data-clock-font-size={fontSize.toFixed(0)}
      className={cn(
        'clock-face flex h-full w-full select-none items-center justify-center overflow-hidden rounded-xl px-3 py-2',
        mode === 'mono' && 'clock-face-mono',
        vertical ? 'flex-col' : 'flex-row'
      )}
    >
      {dateBlock && dateFirst ? dateBlock : null}
      {timeBlock}
      {dateBlock && !dateFirst ? dateBlock : null}
    </div>
  )
}
