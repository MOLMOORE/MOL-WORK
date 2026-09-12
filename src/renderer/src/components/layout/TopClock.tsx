import { useEffect, useState } from 'react'
import { FlipDigit } from '../ui/FlipDigit'
import { dateKey, weekdayCN } from '../../lib/utils'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export interface TopClockProps {
  /** 尺寸随所在容器自适应（用于可自由拖拽缩放的看板方块） */
  fluid?: boolean
}

/** 统一时钟：大号时分秒（翻页特效）+ 下方小号日期 */
export function TopClock({ fluid = false }: TopClockProps): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const dateText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekdayCN(dateKey(now))}`

  if (fluid) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center leading-none"
        style={{ containerType: 'size' }}
      >
        <p
          className="flex items-baseline font-bold tabular-nums tracking-tight text-foreground"
          style={{ fontSize: 'min(36cqh, 9rem)' }}
        >
          {time
            .split('')
            .map((char, index) => (
              <FlipDigit key={`${index}-${char}`} char={char} />
            ))}
        </p>
        <p className="text-muted-foreground" style={{ fontSize: 'min(11cqh, 1.15rem)', marginTop: '2cqh' }}>
          {dateText}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center leading-none">
      <p className="flex items-baseline text-6xl font-bold tabular-nums tracking-tight text-foreground">
        {time
          .split('')
          .map((char, index) => (
            <FlipDigit key={`${index}-${char}`} char={char} />
          ))}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">{dateText}</p>
    </div>
  )
}
