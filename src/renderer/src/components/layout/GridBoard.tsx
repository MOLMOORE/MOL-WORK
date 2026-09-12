import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
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
/** 卡片补位动画曲线：起步快、收尾慢，观感更顺滑 */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const TRANSITION = `transform 280ms ${EASE}, width 280ms ${EASE}, height 280ms ${EASE}`

export interface GridEntry {
  id: string
  /** 用于拖拽提示与无障碍标签 */
  title: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  /** 是否禁用拖拽与缩放 */
  locked?: boolean
  node: ReactNode
}

export interface GridBoardProps {
  entries: GridEntry[]
  /** 布局持久化键（每个页面独立） */
  storageKey: string
  className?: string
  /** 是否显示顶部操作提示与「重置布局」按钮 */
  toolbar?: boolean
}

interface Cell {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  base: Cell
  baseWidth: number
  baseHeight: number
  els: Map<string, HTMLElement>
  cells: Cell[]
  el: HTMLElement
  minW: number
  minH: number
  lastGX: number
  lastGY: number
  lastGW: number
  lastGH: number
  rafId: number
  clientX: number
  clientY: number
  moved: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function overlaps(a: Cell, b: Cell): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * 垂直压缩重排：先把「正在被拖动/缩放的卡片」锁在目标位置，
 * 其余卡片按 y 排序依次向上吸附、再向下推挤，因此拖动一个方块时其他方块会自动补齐缺口。
 */
function resolveLayout(cells: Cell[], lockedId: string): Cell[] {
  const locked = lockedId ? cells.find((cell) => cell.id === lockedId) : undefined
  const source = locked ? cells.filter((cell) => cell.id !== lockedId) : [...cells]
  const ordered = source.sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Cell[] = locked ? [locked] : []

  for (const cell of ordered) {
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

function defaultLayout(entries: GridEntry[]): Cell[] {
  return entries.map((entry) => ({ id: entry.id, x: entry.x, y: entry.y, w: entry.w, h: entry.h }))
}

/** 合并持久化布局与当前条目：保留已有位置，新增模块回落到默认位置，移除已不存在的模块 */
function mergeLayout(entries: GridEntry[], stored: Cell[] | null): Cell[] {
  const fallback = defaultLayout(entries)
  if (!stored || stored.length === 0) return fallback
  const needsAdd = fallback.some((cell) => !stored.some((item) => item.id === cell.id))
  const needsDrop = stored.some((cell) => !fallback.some((item) => item.id === cell.id))
  if (!needsAdd && !needsDrop) return stored
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

function readStoredLayout(storageKey: string): Cell[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cell[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

interface GridItemProps {
  id: string
  title: string
  locked: boolean
  active: boolean
  ready: boolean
  left: number
  top: number
  width: number
  height: number
  onStart: (event: ReactPointerEvent, id: string, mode: 'move' | 'resize') => void
  children: ReactNode
}

/**
 * 单个网格方块：位置与尺寸全部用 transform / width / height 表达，
 * 由 CSS transition 驱动补位动画，避免 layout 抖动带来的卡顿。
 */
const GridItem = memo(function GridItem({
  id,
  title,
  locked,
  active,
  ready,
  left,
  top,
  width,
  height,
  onStart,
  children
}: GridItemProps): JSX.Element {
  return (
    <div
      data-grid-item={id}
      className={cn('group/grid-item absolute left-0 top-0', active && 'z-30')}
      style={{
        width,
        height,
        transform: `translate3d(${left}px, ${top}px, 0)`,
        transition: !ready || active ? undefined : TRANSITION
      }}
    >
      <div className="h-full">{children}</div>

      {!locked ? (
        <>
          {/* 拖拽把手：位于卡片顶部内边距空白处，hover 时显现 */}
          <div
            role="button"
            tabIndex={-1}
            aria-label={`拖动 ${title}`}
            onPointerDown={(event) => onStart(event, id, 'move')}
            className={cn(
              'absolute inset-x-0 top-0 z-20 flex h-5 cursor-move touch-none items-center justify-center transition-opacity',
              active ? 'opacity-100' : 'opacity-0 group-hover/grid-item:opacity-100'
            )}
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
            aria-label={`调整 ${title} 大小`}
            onPointerDown={(event) => onStart(event, id, 'resize')}
            className={cn(
              'absolute bottom-1 right-1 z-20 flex h-4 w-4 cursor-se-resize touch-none items-end justify-end rounded-sm transition-opacity',
              active ? 'opacity-100' : 'opacity-0 group-hover/grid-item:opacity-100'
            )}
          >
            <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-muted-foreground">
              <path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M11 5L5 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M11 8.5L8.5 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
        </>
      ) : null}
    </div>
  )
})

/**
 * 通用可拖拽 / 可缩放网格看板
 * - 抓取方块顶部可自由摆放，按住右下角可拉伸宽高
 * - 拖动与缩放全程走 requestAnimationFrame + 直接写 DOM，不触发 React 重渲染，
 *   因此任意复杂度的图表卡片都能保持跟手；其他方块由 CSS transition 平滑补齐缺口
 * - 松手时才把最终布局写回 React 状态并持久化到 localStorage
 * - 窗口过窄时自动退化为纵向单列，保证内容不被压扁
 */
export function GridBoard({ entries, storageKey, className, toolbar = true }: GridBoardProps): JSX.Element {
  const [layout, setLayout] = useState<Cell[]>(() => mergeLayout(entries, readStoredLayout(storageKey)))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const [ready, setReady] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef(layout)
  const entriesRef = useRef(entries)
  const dragRef = useRef<DragState | null>(null)
  const metricsRef = useRef({ stepX: 76, stepY: ROW_HEIGHT + GAP })

  layoutRef.current = layout
  entriesRef.current = entries

  const entrySignature = entries.map((entry) => entry.id).join('|')

  // 测量容器宽度：决定栅格像素尺寸与是否退化为单列（layout effect 保证首帧就用正确尺寸）
  useLayoutEffect(() => {
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

  // 首帧后再启用过渡，避免初始布局出现飞入动画
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // 模块集合变化时补齐布局
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

  const stacked = width > 0 && width < STACK_BREAKPOINT
  const stepX = useMemo(() => Math.max(40, (width - GAP * (COLS - 1)) / COLS) + GAP, [width])
  const stepY = ROW_HEIGHT + GAP
  metricsRef.current = { stepX, stepY }

  /** 把一整套布局直接写进 DOM（跳过正在被操作的那一块） */
  const paintCells = useCallback((cells: Cell[], skipId: string) => {
    const { stepX: sx, stepY: sy } = metricsRef.current
    for (const cell of cells) {
      if (cell.id === skipId) continue
      const el = dragRef.current?.els.get(cell.id)
      if (!el) continue
      el.style.transform = `translate3d(${cell.x * sx}px, ${cell.y * sy}px, 0)`
      el.style.width = `${cell.w * sx - GAP}px`
      el.style.height = `${cell.h * ROW_HEIGHT + (cell.h - 1) * GAP}px`
    }
  }, [])

  const stopInteraction = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current
      dragRef.current = null
      setActiveId(null)
      if (!drag) return
      const element = drag.el
      if (commit) {
        // 让落点带过渡吸附到网格位置，随后交还给 React 托管
        element.style.transition = TRANSITION
        const { stepX: sx, stepY: sy } = metricsRef.current
        const cell = drag.cells.find((item) => item.id === drag.id)
        if (cell) {
          element.style.transform = `translate3d(${cell.x * sx}px, ${cell.y * sy}px, 0)`
          element.style.width = `${cell.w * sx - GAP}px`
          element.style.height = `${cell.h * ROW_HEIGHT + (cell.h - 1) * GAP}px`
        }
        window.requestAnimationFrame(() => {
          element.style.willChange = ''
          element.style.zIndex = ''
        })
        layoutRef.current = drag.cells
        setLayout(drag.cells)
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(drag.cells))
        } catch {
          /* 静默忽略 */
        }
        return
      }
      // 取消：恢复到拖动前的布局
      paintCells(layoutRef.current, '')
      element.style.transform = ''
      element.style.width = ''
      element.style.height = ''
      element.style.transition = ''
      element.style.willChange = ''
      element.style.zIndex = ''
    },
    [paintCells, storageKey]
  )

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      drag.clientX = event.clientX
      drag.clientY = event.clientY
      if (drag.rafId !== 0) return
      drag.rafId = window.requestAnimationFrame(() => {
        const current = dragRef.current
        if (!current) return
        current.rafId = 0
        const { stepX: sx, stepY: sy } = metricsRef.current
        const dx = current.clientX - current.startX
        const dy = current.clientY - current.startY
        if (!current.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) current.moved = true

        if (current.mode === 'move') {
          const gx = clamp(current.base.x + Math.round(dx / sx), 0, COLS - current.base.w)
          const gy = Math.max(0, current.base.y + Math.round(dy / sy))
          if (gx !== current.lastGX || gy !== current.lastGY) {
            current.lastGX = gx
            current.lastGY = gy
            current.cells = resolveLayout(
              current.cells.map((cell) => (cell.id === current.id ? { ...cell, x: gx, y: gy } : cell)),
              current.id
            )
            paintCells(current.cells, current.id)
          }
          // 被拖方块始终跟随指针，不做任何吸附延迟
          current.el.style.transform = `translate3d(${current.base.x * sx + dx}px, ${current.base.y * sy + dy}px, 0)`
          return
        }

        const minWpx = current.minW * sx - GAP
        const minHpx = current.minH * sy - GAP
        const maxWpx = (COLS - current.base.x) * sx - GAP
        const widthPx = clamp(current.baseWidth + dx, minWpx, maxWpx)
        const heightPx = Math.max(minHpx, current.baseHeight + dy)
        const gw = clamp(Math.round((widthPx + GAP) / sx), current.minW, COLS - current.base.x)
        const gh = Math.max(current.minH, Math.round((heightPx + GAP) / sy))
        if (gw !== current.lastGW || gh !== current.lastGH) {
          current.lastGW = gw
          current.lastGH = gh
          current.cells = resolveLayout(
            current.cells.map((cell) => (cell.id === current.id ? { ...cell, w: gw, h: gh } : cell)),
            current.id
          )
          paintCells(current.cells, current.id)
        }
        current.el.style.width = `${widthPx}px`
        current.el.style.height = `${heightPx}px`
      })
    }
    const onUp = (): void => {
      if (dragRef.current) stopInteraction(true)
    }
    const onCancel = (): void => {
      if (dragRef.current) stopInteraction(false)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
    }
  }, [paintCells, stopInteraction])

  const startInteraction = useCallback(
    (event: ReactPointerEvent, id: string, mode: 'move' | 'resize'): void => {
      if (stacked) return
      const entry = entriesRef.current.find((item) => item.id === id)
      const base = layoutRef.current.find((cell) => cell.id === id)
      if (!base || entry?.locked) return
      const element = (event.currentTarget as HTMLElement).closest('[data-grid-item]') as HTMLElement | null
      if (!element) return
      event.preventDefault()
      event.stopPropagation()

      // 一次性收集所有方块节点，拖动过程中直接操作 DOM
      const els = new Map<string, HTMLElement>()
      containerRef.current?.querySelectorAll<HTMLElement>('[data-grid-item]').forEach((node) => {
        const key = node.dataset.gridItem
        if (key) els.set(key, node)
      })

      const { stepX: sx, stepY: sy } = metricsRef.current
      element.style.transition = 'none'
      element.style.willChange = 'transform, width, height'
      element.style.zIndex = '40'

      dragRef.current = {
        id,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        base,
        baseWidth: base.w * sx - GAP,
        baseHeight: base.h * ROW_HEIGHT + (base.h - 1) * GAP,
        els,
        cells: layoutRef.current.map((cell) => ({ ...cell })),
        el: element,
        minW: entry?.minW ?? 2,
        minH: entry?.minH ?? 2,
        lastGX: base.x,
        lastGY: base.y,
        lastGW: base.w,
        lastGH: base.h,
        rafId: 0,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false
      }
      setActiveId(id)
    },
    [stacked]
  )

  const resetLayout = useCallback(() => {
    setLayout(defaultLayout(entriesRef.current))
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* 静默忽略 */
    }
  }, [storageKey])

  const ordered = useMemo(
    () => layout.filter((cell) => entries.some((entry) => entry.id === cell.id)),
    [layout, entries]
  )

  if (stacked) {
    const stackedItems = [...layout]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((cell) => ({ cell, entry: entries.find((item) => item.id === cell.id) }))
      .filter((item) => item.entry)
    return (
      <div className={cn('flex flex-col gap-5', className)}>
        {stackedItems.map(({ cell, entry }) => (
          <div key={cell.id} style={{ height: cell.h * ROW_HEIGHT + (cell.h - 1) * GAP }}>
            {entry?.node}
          </div>
        ))}
      </div>
    )
  }

  const maxY = ordered.reduce((max, cell) => Math.max(max, cell.y + cell.h), 0)

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      {toolbar ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <LayoutDashboard className="h-3.5 w-3.5" />
            拖动卡片顶部可自由摆放 · 按住右下角可拉伸大小 · 其他卡片会自动补齐缺口
          </span>
          <Button size="sm" variant="ghost" onClick={resetLayout} title="恢复默认布局">
            <RotateCcw className="h-3.5 w-3.5" />
            重置布局
          </Button>
        </div>
      ) : null}

      <div className="relative" style={{ height: Math.max(ROW_HEIGHT, maxY * stepY - GAP) }}>
        {ordered.map((cell) => {
          const entry = entries.find((item) => item.id === cell.id)
          if (!entry) return null
          return (
            <GridItem
              key={cell.id}
              id={cell.id}
              title={entry.title}
              locked={Boolean(entry.locked)}
              active={activeId === cell.id}
              ready={ready}
              left={cell.x * stepX}
              top={cell.y * stepY}
              width={cell.w * stepX - GAP}
              height={cell.h * ROW_HEIGHT + (cell.h - 1) * GAP}
              onStart={startInteraction}
            >
              {entry.node}
            </GridItem>
          )
        })}
      </div>
    </div>
  )
}
