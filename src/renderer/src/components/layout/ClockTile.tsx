import { useEffect, useState, type ReactNode } from 'react'
import type { ClockLayout, ClockStyle } from '@shared/types/domain'
import { resolveClockSettings } from '@shared/constants'
import { FlipDigit } from '../ui/FlipDigit'
import { cn, dateKey, weekdayCN } from '../../lib/utils'
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
 * 可自由拖拽缩放的时钟方块：
 * - 「风格」决定时间怎么显示（翻页 / 极简 / 秒环 / 终端），
 * - 「摆放」决定日期在时间的哪一侧（上 / 下 / 左 / 右），
 * 两者相互独立、任意组合；字号随方块尺寸自适应。
 */
export function ClockTile({ style, layout }: ClockTileProps): JSX.Element {
  const settingStyle = useAppStore((state) => state.settings?.clockStyle)
  const settingLayout = useAppStore((state) => state.settings?.clockLayout)
  const { style: mode, layout: place } = resolveClockSettings(style ?? settingStyle, layout ?? settingLayout)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const hhmm = time.slice(0, 5)
  const ss = time.slice(6)
  const dateText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekdayCN(dateKey(now))}`
  const vertical = place === 'date-top' || place === 'date-bottom'
  const dateFirst = place === 'date-top' || place === 'date-left'

  /** 时间块：仅由「风格」决定 */
  let timeBlock: ReactNode = null
  /** 日期块：位置由「摆放」决定 */
  let dateBlock: ReactNode = null

  if (mode === 'flip') {
    timeBlock = (
      <p className="flex items-baseline font-bold tabular-nums tracking-tight text-foreground" style={{ fontSize: 'min(36cqh, 9rem)' }}>
        {time.split('').map((char, index) => (
          <FlipDigit key={`${index}-${char}`} char={char} />
        ))}
      </p>
    )
    dateBlock = (
      <p className="whitespace-nowrap text-muted-foreground" style={{ fontSize: 'min(11cqh, 1.15rem)' }}>
        {dateText}
      </p>
    )
  } else if (mode === 'minimal') {
    timeBlock = (
      <div className="flex items-baseline gap-2">
        <span className="font-light tabular-nums tracking-[0.06em] text-foreground" style={{ fontSize: 'min(42cqh, 10rem)' }}>
          {hhmm}
        </span>
        <span className="tracking-[0.3em] text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
          {ss}
        </span>
      </div>
    )
    dateBlock = (
      <p className="whitespace-nowrap tracking-[0.2em] text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
        {dateText}
      </p>
    )
  } else if (mode === 'ring') {
    timeBlock = (
      <div className="flex items-center gap-[3cqw]">
        <div className="relative" style={{ height: 'min(52cqh, 8rem)', aspectRatio: '1 / 1' }}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#6366F1"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={2 * Math.PI * 44 * (1 - now.getSeconds() / 60)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="tabular-nums text-foreground" style={{ fontSize: 'min(22cqh, 2rem)' }}>
              {ss}
            </span>
          </div>
        </div>
        <span className="font-semibold tabular-nums text-foreground" style={{ fontSize: 'min(34cqh, 5rem)' }}>
          {hhmm}
        </span>
      </div>
    )
    dateBlock = (
      <p className="whitespace-nowrap text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
        {dateText}
      </p>
    )
  } else {
    timeBlock = (
      <span className="font-mono tabular-nums text-[#86EFAC]" style={{ fontSize: 'min(34cqh, 6rem)' }}>
        {`[${time}]`}
      </span>
    )
    dateBlock = (
      <p className="whitespace-nowrap font-mono text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
        {`> ${dateText}`}
      </p>
    )
  }

  return (
    <div
      className={cn(
        // 悬停反馈统一由看板的磨砂蒙层提供，卡片自身不再显示边框线条
        'flex h-full w-full select-none items-center justify-center gap-3 overflow-hidden rounded-2xl px-3 py-2',
        vertical ? 'flex-col' : 'flex-row'
      )}
      style={{ containerType: 'size' }}
    >
      {dateFirst ? dateBlock : timeBlock}
      {dateFirst ? timeBlock : dateBlock}
    </div>
  )
}
