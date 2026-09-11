import { useEffect, useState } from 'react'
import { FlipDigit } from '../ui/FlipDigit'
import { dateKey, weekdayCN } from '../../lib/utils'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** 顶栏统一时钟：大号时分秒（翻页特效）+ 下方小号日期，所有页面共用 */
export function TopClock(): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return (
    <div className="flex flex-col items-center leading-none">
      <p className="flex items-baseline text-5xl font-bold tabular-nums tracking-tight text-foreground">
        {time
          .split('')
          .map((char, index) => (
            <FlipDigit key={`${index}-${char}`} char={char} />
          ))}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 · {weekdayCN(dateKey(now))}
      </p>
    </div>
  )
}
