import { useEffect, useState } from 'react'
import type { ClockStyle } from '@shared/types/domain'
import { FlipDigit } from '../ui/FlipDigit'
import { dateKey, weekdayCN } from '../../lib/utils'
import { useAppStore } from '../../stores/appStore'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export interface ClockTileProps {
  /** 指定样式（设置页预览用）；不传则跟随用户设置 */
  style?: ClockStyle
}

/**
 * 可自由拖拽缩放的时钟方块：
 * 支持多种样式（翻页 / 极简 / 秒环 / 终端 / 日期在上），字号随方块尺寸自适应。
 */
export function ClockTile({ style }: ClockTileProps): JSX.Element {
  const settingStyle = useAppStore((state) => state.settings?.clockStyle)
  const mode: ClockStyle = style ?? settingStyle ?? 'flip'
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const hhmm = time.slice(0, 5)
  const ss = time.slice(6)
  const dateText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekdayCN(dateKey(now))}`

  return (
    <div
      className="flex h-full w-full select-none flex-col items-center justify-center rounded-2xl border border-transparent px-3 py-2 transition-colors hover:border-border/70 hover:bg-muted/10"
      style={{ containerType: 'size' }}
    >
      {mode === 'flip' ? (
        <>
          <p className="flex items-baseline font-bold tabular-nums tracking-tight text-foreground" style={{ fontSize: 'min(36cqh, 9rem)' }}>
            {time.split('').map((char, index) => (
              <FlipDigit key={`${index}-${char}`} char={char} />
            ))}
          </p>
          <p className="text-muted-foreground" style={{ fontSize: 'min(11cqh, 1.15rem)', marginTop: '2cqh' }}>
            {dateText}
          </p>
        </>
      ) : null}

      {mode === 'minimal' ? (
        <>
          <p className="font-light tabular-nums tracking-[0.06em] text-foreground" style={{ fontSize: 'min(42cqh, 10rem)' }}>
            {hhmm}
          </p>
          <p className="tracking-[0.3em] text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
            {ss} · {dateText}
          </p>
        </>
      ) : null}

      {mode === 'ring' ? (
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
          <div className="flex flex-col items-start">
            <span className="font-semibold tabular-nums text-foreground" style={{ fontSize: 'min(34cqh, 5rem)' }}>
              {hhmm}
            </span>
            <span className="text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
              {dateText}
            </span>
          </div>
        </div>
      ) : null}

      {mode === 'mono' ? (
        <div className="flex flex-col items-start">
          <span className="font-mono tabular-nums text-[#86EFAC]" style={{ fontSize: 'min(34cqh, 6rem)' }}>
            {`[${time}]`}
          </span>
          <span className="font-mono text-muted-foreground" style={{ fontSize: 'min(10cqh, 1rem)' }}>
            {`> ${dateText}`}
          </span>
        </div>
      ) : null}

      {mode === 'stacked' ? (
        <div className="flex flex-col items-center">
          <span className="tracking-[0.2em] text-muted-foreground" style={{ fontSize: 'min(12cqh, 1.3rem)' }}>
            {dateText}
          </span>
          <span className="font-bold tabular-nums text-foreground" style={{ fontSize: 'min(40cqh, 8rem)' }}>
            {time}
          </span>
        </div>
      ) : null}
    </div>
  )
}
