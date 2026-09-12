import { TopClock } from './TopClock'

/**
 * 可自由拖拽缩放的时钟方块：
 * 平时保持悬浮大字观感，悬停时显示边框提示可拖动/缩放。
 */
export function ClockTile(): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-transparent px-3 py-2 transition-colors hover:border-border/70 hover:bg-muted/10">
      <TopClock fluid />
    </div>
  )
}
