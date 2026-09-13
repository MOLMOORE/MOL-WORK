import { useCallback, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { GridBoard, type GridEntry } from './GridBoard'
import { ClockTile } from './ClockTile'
import { Button } from '../ui/Button'

export interface PageGridProps {
  /** 页面标识，用于记录该页面是否显示时钟 */
  pageKey: string
  entries: GridEntry[]
  storageKey: string
  /** 默认是否显示时钟（仅仪表盘为 true） */
  defaultClock?: boolean
  /** 页面是否已预留顶部时钟槽位（true=条目 y 从 3 起） */
  reserved?: boolean
  className?: string
}

/**
 * 页面看板容器：
 * - 时钟方块默认只在仪表盘出现，其余页面可通过「添加时钟 / 移除时钟」按钮自行开启或关闭；
 * - 开关状态按页面记录在 localStorage，时钟的布局位置仍由用户自由拖拽决定。
 */
export function PageGrid({
  pageKey,
  entries,
  storageKey,
  defaultClock = false,
  reserved = true,
  className
}: PageGridProps): JSX.Element {
  const flagKey = `workstation.clock.${pageKey}`
  const [showClock, setShowClock] = useState(() => {
    try {
      const raw = window.localStorage.getItem(flagKey)
      return raw === null ? defaultClock : raw === '1'
    } catch {
      return defaultClock
    }
  })

  const toggleClock = useCallback(() => {
    setShowClock((current) => {
      const next = !current
      try {
        window.localStorage.setItem(flagKey, next ? '1' : '0')
      } catch {
        /* 静默忽略 */
      }
      return next
    })
  }, [flagKey])

  const merged = useMemo<GridEntry[]>(() => {
    if (entries.some((entry) => entry.id === 'clock')) return entries
    if (!showClock) {
      return reserved ? entries.map((entry) => ({ ...entry, y: Math.max(0, entry.y - 3) })) : entries
    }
    const clockEntry: GridEntry = {
      id: 'clock',
      title: '时间显示',
      x: 0,
      y: 0,
      w: 12,
      h: 3,
      minW: 4,
      minH: 2,
      node: <ClockTile />
    }
    return [clockEntry, ...(reserved ? entries : entries.map((entry) => ({ ...entry, y: entry.y + 3 })))]
  }, [entries, showClock, reserved])

  const extraToolbar = (
    <Button size="sm" variant="ghost" onClick={toggleClock} title={showClock ? '移除时钟' : '添加时钟'}>
      <Clock className="h-3.5 w-3.5" />
      {showClock ? '移除时钟' : '添加时钟'}
    </Button>
  )

  return (
    <GridBoard
      entries={merged}
      storageKey={storageKey}
      className={className}
      hiddenIds={showClock ? undefined : ['clock']}
      extraToolbar={extraToolbar}
    />
  )
}
