import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { GripVertical, LayoutDashboard, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'

/** 网格列数（12 栅格） */
const COLS = 12
/** 单行高度（像素） */
const ROW_HEIGHT = 56
/** 卡片间距（像素） */
const GAP = 16
/** 低于该宽度退化为纵向单列，禁用拖拽以保证可读性 */
const STACK_BREAKPOINT = 900

export interface StatsGridEntry {
  id: string
  /** 用于拖拽提示与无障碍标签 */
  title: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  node: ReactNode
}

interface LayoutCell {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface StatsGridProps {
  entries: StatsGridEntry[]
  /** 布局持久化键 */
  storageKey: string
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function overlaps(a: LayoutCell, b: LayoutCell): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * 垂直压缩重排（gridstack 思路）：
 * 所有卡片按 y 排序后依次放置，每张先尽量向上吸附、再向下推挤避开重叠。
 * 这样拖动或缩放后不会留下大片空白，也不会出现卡片互相遮挡。
 */
function resolveLayout(cells: LayoutCell[], movingId: string): LayoutCell[] {
  const sorted = [...cells].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    // 同一行内，被拖拽的卡片优先占位，避免它被自己挤走
    if (a.id === movingId) return -1
    if (b.id === movingId) return 1
    return a.x - b.x
  })
  const placed: LayoutCell[] = []
  for (const cell of sorted) {
    let y = cell.y
    let guard = 0
    while (y > 0 && !placed.some((item) => overlaps(item, { ...cell, y: y - 1 })) && guard < 400) {
      y -= 1
      guard += 1
    }
    guard = 0
    while (placed.some((item) => overlaps(item, { ...cell, y })) && guard < 400) {
      y += 1
      guard += 1
    }
    placed.push({ ...cell, y })
  }
  return cells.map((cell) => placed.find((item) => item.id === cell.id) ?? cell)
}

function defaultLayout(entries: StatsGridEntry[]): LayoutCell[] {
  return entries.map((entry) => ({ id: entry.id, x: entry.x, y: entry.y, w: entry.w, h: entry.h }))
}

/** 合并持久化布局与当前条目：保留已有位置，新增模块回落到默认位置 */
function mergeLayout(entries: StatsGridEntry[], stored: LayoutCell[] | null): LayoutCell[] {
  const fallback = defaultLayout(entries)
  if (!stored || stored.length === 0) return fallback
  const needsAdd = fallback.some((cell) => !stored.some((item) => item.id === cell.id))
  const needsDrop = stored.some((cell) => !fallback.some((item) => item.id === cell.id))
  if (!needsAdd && !needsDrop) return stored
  if (!needsAdd) return stored
  return fallback.map((cell) => {
    const saved = stored.find((item) => item.id === cell.id)
    if (!saved) return cell
    const entry = entries.find((item) => item.id === cell.id)
    const minW = entry?.minW ?? 2
    const minH = entry?.minH ?? 2
    const w = clamp(saved.w, minW, COLS)
    const h = Math.max(minH, saved.h)
    return { id: cell.id, x: clamp(saved.x, 0, COLS - w), y: Math.max(0, saved.y), w, h }
  })
}

function readStoredLayout(storageKey: string): LayoutCell[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LayoutCell[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 统计看板网格：
 * - 卡片可自由拖动摆放（抓取卡片顶部空白条）
 * - 按住右下角可等比例拉伸宽高，最小尺寸受 minW/minH 约束
 * - 布局写入 localStorage，重启后保持
 * - 窗口过窄时自动退化为纵向单列，避免图表被压扁导致内容缺失
 */
export function StatsGrid({ entries, storageKey, className }: StatsGridProps): JSX.Element {
  const [layout, setLayout] = useState<LayoutCell[]>(() => mergeLayout(entries, readStoredLayout(storageKey)))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(1200)
  const containerRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef(layout)
  const entriesRef = useRef(entries)
  const dragRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    startX: number
    startY: number
    base: LayoutCell
    stepX: number
    stepY: number
  } | null>(null)

  layoutRef.current = layout
  entriesRef.current = entries

  // 监听容器宽度：决定拖拽步长与是否退化为单列
  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const update = (): void => setWidth(element.getBoundingClientRect().width)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // 条目集合变化（如后续新增模块）时补齐布局，避免因数组引用变化反复重排
  const entrySignature = entries.map((entry) => entry.id).join('|')
  useEffect(() => {
    setLayout((current) => mergeLayout(entriesRef.current, current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySignature])

  // 持久化布局
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      /* 存储不可用时静默忽略 */
    }
  }, [layout, storageKey])

  // 初始加载后按当前顺序做一次压缩，修复历史布局中的空隙
  useEffect(() => {
    setLayout((current) => resolveLayout(current, ''))
  }, [])

  const stacked = width < STACK_BREAKPOINT
  const colWidth = useMemo(() => Math.max(40, (width - GAP * (COLS - 1)) / COLS), [width])
  const stepX = colWidth + GAP
  const stepY = ROW_HEIGHT + GAP

  const stopInteraction = useCallback((persist: boolean) => {
    dragRef.current = null
    setActiveId(null)
    if (persist) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(layoutRef.current))
      } catch {
        /* 静默忽略 */
      }
    }
  }, [storageKey])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = Math.round((event.clientX - drag.startX) / drag.stepX)
      const dy = Math.round((event.clientY - drag.startY) / drag.stepY)
      const entry = entriesRef.current.find((item) => item.id === drag.id)
      const minW = entry?.minW ?? 2
      const minH = entry?.minH ?? 2
      const base = drag.base
      const next: LayoutCell =
        drag.mode === 'move'
          ? { ...base, x: clamp(base.x + dx, 0, COLS - base.w), y: Math.max(0, base.y + dy) }
          : { ...base, w: clamp(base.w + dx, minW, COLS - base.x), h: Math.max(minH, base.h + dy) }
      setLayout((current) => resolveLayout(current.map((cell) => (cell.id === drag.id ? next : cell)), drag.id))
    }
    const onUp = (): void => {
      if (dragRef.current) stopInteraction(true)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [stopInteraction])

  const startInteraction = (event: ReactPointerEvent, id: string, mode: 'move' | 'resize'): void => {
    if (stacked) return
    const base = layoutRef.current.find((cell) => cell.id === id)
    if (!base) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { id, mode, startX: event.clientX, startY: event.clientY, base, stepX, stepY }
    setActiveId(id)
  }

  const resetLayout = (): void => {
    setLayout(defaultLayout(entriesRef.current))
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* 静默忽略 */
    }
  }

  const ordered = useMemo(
    () => [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((cell) => ({ cell, entry: entries.find((item) => item.id === cell.id) })),
    [layout, entries]
  )

  if (stacked) {
    return (
      <div className={cn('flex flex-col gap-5', className)}>
        {ordered.map(({ cell, entry }) =>
          entry ? (
            <div key={entry.id} style={{ height: cell.h * ROW_HEIGHT + (cell.h - 1) * GAP }}>
              {entry.node}
            </div>
          ) : null
        )}
      </div>
    )
  }

  const maxY = layout.reduce((max, cell) => Math.max(max, cell.y + cell.h), 0)

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <div className="mb-2 flex items-center justify-end gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LayoutDashboard className="h-3.5 w-3.5" />
          拖动卡片顶部可自由摆放 · 按住右下角可拉伸大小
        </span>
        <Button size="sm" variant="ghost" onClick={resetLayout} title="恢复默认布局">
          <RotateCcw className="h-3.5 w-3.5" />
          重置布局
        </Button>
      </div>
      <div className="relative" style={{ height: Math.max(ROW_HEIGHT, maxY * stepY - GAP) }}>
        {ordered.map(({ cell, entry }) => {
          if (!entry) return null
          const active = activeId === entry.id
          return (
            <div
              key={entry.id}
              className={cn('group/item absolute', active && 'z-30')}
              style={{
                left: `calc(${cell.x} * ((100% - ${GAP * (COLS - 1)}px) / ${COLS} + ${GAP}px))`,
                width: `calc(${cell.w} * ((100% - ${GAP * (COLS - 1)}px) / ${COLS} + ${GAP}px) - ${GAP}px)`,
                top: cell.y * stepY,
                height: cell.h * ROW_HEIGHT + (cell.h - 1) * GAP
              }}
            >
              <div className={cn('h-full transition-shadow', active && 'rounded-2xl shadow-glow ring-1 ring-primary/60')}>
                {entry.node}
              </div>
              {/* 拖拽把手：位于卡片顶部内边距空白处，hover 时显现 */}
              <div
                role="button"
                tabIndex={-1}
                aria-label={`拖动 ${entry.title}`}
                onPointerDown={(event) => startInteraction(event, entry.id, 'move')}
                className={cn(
                  'absolute inset-x-0 top-0 z-20 flex h-5 cursor-move touch-none items-center justify-center transition-opacity',
                  active ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                )}
                style={{ touchAction: 'none' }}
              >
                <span className="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
                  <GripVertical className="h-3 w-3" />
                  拖动
                </span>
              </div>
              {/* 缩放手柄：右下角内边距空白处 */}
              <div
                role="button"
                tabIndex={-1}
                aria-label={`调整 ${entry.title} 大小`}
                onPointerDown={(event) => startInteraction(event, entry.id, 'resize')}
                className={cn(
                  'absolute bottom-1 right-1 z-20 flex h-4 w-4 cursor-se-resize touch-none items-end justify-end rounded-sm transition-opacity',
                  active ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                )}
                style={{ touchAction: 'none', opacity: active ? 1 : undefined }}
              >
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-muted-foreground">
                  <path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M11 5L5 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M11 8.5L8.5 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
