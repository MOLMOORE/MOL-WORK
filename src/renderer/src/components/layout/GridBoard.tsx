import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { Check, History, LayoutDashboard, Pencil, RotateCcw, Save, Shuffle } from 'lucide-react'
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
  /** 功能/样式分组标识：「一键排列」时同组模块会摆在一起（缺省按 id 前缀推断） */
  group?: string
  node: ReactNode
}

export interface GridBoardProps {
  entries: GridEntry[]
  /** 布局持久化键（每个页面独立） */
  storageKey: string
  className?: string
  /** 是否显示顶部操作提示与「重置布局」按钮 */
  toolbar?: boolean
  /** 暂时隐藏的方块（保留其布局数据，仅不参与排版） */
  hiddenIds?: string[]
  /** 追加到工具栏的自定义按钮 */
  extraToolbar?: ReactNode
}

interface Cell {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** move=整块拖动；n/s/e/w/ne/nw/se/sw=八向缩放（四边 + 四角） */
type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface DragState {
  id: string
  mode: DragMode
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
  /** 允许落位的最大 y（拖动开始时按其余方块计算，避免越拖越远） */
  maxY: number
  lastGX: number
  lastGY: number
  lastGW: number
  lastGH: number
  /** 拖动悬停时命中的互换目标 */
  swapId: string | null
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

/**
 * 从期望落点开始向外螺旋搜索最近的「不与其他卡片重叠」的合法落点。
 * 找不到时回退到 fallback（通常是被拖卡片原位），确保任何情况下都不会产生边界侵入。
 */
function findFreeSpot(
  cells: Cell[],
  id: string,
  w: number,
  h: number,
  px: number,
  py: number,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const others = cells.filter((cell) => cell.id !== id)
  const fits = (x: number, y: number): boolean =>
    x >= 0 &&
    x + w <= COLS &&
    y >= 0 &&
    !others.some((cell) => x < cell.x + cell.w && x + w > cell.x && y < cell.y + cell.h && y + h > cell.y)
  const maxX = Math.max(0, COLS - w)
  const start = { x: clamp(px, 0, maxX), y: Math.max(0, py) }
  if (fits(start.x, start.y)) return start
  const maxRadius = COLS + 80
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const x = clamp(start.x + dx, 0, maxX)
        const y = Math.max(0, start.y + dy)
        if (fits(x, y)) return { x, y }
      }
    }
  }
  return { x: clamp(fallback.x, 0, maxX), y: Math.max(0, fallback.y) }
}

/**
 * 缩放专用：只把「与目标矩形真正重叠」的模块挪到附近空闲位置，其余模块保持原位不动。
 * （此前用整体重排会导致没有受影响的模块也被挪走，看起来像「莫名弹开」）
 */
function pushOverlapping(cells: Cell[], self: Cell): Cell[] {
  const result = cells.map((cell) => (cell.id === self.id ? { ...self } : { ...cell }))
  for (const cell of result) {
    if (cell.id === self.id || !overlaps(cell, self)) continue
    const others = result.filter((item) => item.id !== cell.id)
    const beneath = Math.max(cell.y, self.y + self.h)
    const spot = findFreeSpot(others, cell.id, cell.w, cell.h, cell.x, beneath, { x: cell.x, y: beneath })
    cell.x = spot.x
    cell.y = spot.y
  }
  return result
}

function defaultLayout(entries: GridEntry[]): Cell[] {
  return entries.map((entry) => ({ id: entry.id, x: entry.x, y: entry.y, w: entry.w, h: entry.h }))
}

/** 系统默认布局叠加「用户自定义默认布局」：用户保存过的模块优先使用自定义位置 */
function withCustomDefaults(entries: GridEntry[], custom: Cell[] | null): Cell[] {
  const base = defaultLayout(entries)
  if (!custom || custom.length === 0) return base
  return base.map((cell) => {
    const saved = custom.find((item) => item.id === cell.id)
    if (!saved) return cell
    const w = clamp(Math.round(saved.w), 1, COLS)
    const h = Math.max(1, Math.round(saved.h))
    return { id: cell.id, x: clamp(saved.x, 0, COLS - w), y: Math.max(0, saved.y), w, h }
  })
}

/** 文字稳定散列：给每块卡片一个固定的颤动相位，避免所有卡片同步抖动 */
function jigglePhase(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997
  return (hash % 5) * 90
}

/** 合并持久化布局与当前条目：保留已有位置，新增模块回落到（自定义/系统）默认位置，移除已不存在的模块 */
function mergeLayout(entries: GridEntry[], stored: Cell[] | null, custom: Cell[] | null = null): Cell[] {
  const fallback = withCustomDefaults(entries, custom)
  if (!stored || stored.length === 0) return fallback
  const needsAdd = fallback.some((cell) => !stored.some((item) => item.id === cell.id))
  const needsDrop = stored.some((cell) => !fallback.some((item) => item.id === cell.id))
  if (!needsAdd && !needsDrop) return stored
  const merged = fallback.map((cell) => {
    const saved = stored.find((item) => item.id === cell.id)
    if (!saved) return cell
    // 只保证不超过整行/高度为正：互换后的尺寸可能与默认最小尺寸不同，恢复时必须原样保留
    const w = clamp(Math.round(saved.w), 1, COLS)
    const h = Math.max(1, Math.round(saved.h))
    return { id: cell.id, x: clamp(saved.x, 0, COLS - w), y: Math.max(0, saved.y), w, h }
  })

  // 模块集合发生变化（切换视图 / 新增模块）时消解冲突：
  // 与已落位模块重叠的一方自动弹到最近的空闲位置，避免卡片互相压住造成边界侵入
  const placed: Cell[] = []
  for (const cell of merged) {
    const spot = findFreeSpot(placed, cell.id, cell.w, cell.h, cell.x, cell.y, { x: cell.x, y: cell.y })
    placed.push(spot.x === cell.x && spot.y === cell.y ? cell : { ...cell, x: spot.x, y: spot.y })
  }
  return placed
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

/**
 * 八向缩放手柄：视觉上是一条紧贴模块边缘的细白线（2px、直角、贴合边框），
 * 外层再包一圈更大的透明命中区，保证「线够细」的同时依然抓得住。
 */
const EDGES: { mode: DragMode; hit: string; bar: string }[] = [
  { mode: 'n', hit: 'left-1.5 right-1.5 top-0 h-3 cursor-ns-resize', bar: 'inset-x-0 top-0 h-[2px]' },
  { mode: 's', hit: 'bottom-0 left-1.5 right-1.5 h-3 cursor-ns-resize', bar: 'inset-x-0 bottom-0 h-[2px]' },
  { mode: 'w', hit: 'bottom-1.5 left-0 top-1.5 w-3 cursor-ew-resize', bar: 'inset-y-0 left-0 w-[2px]' },
  { mode: 'e', hit: 'bottom-1.5 right-0 top-1.5 w-3 cursor-ew-resize', bar: 'inset-y-0 right-0 w-[2px]' },
  { mode: 'nw', hit: 'left-0 top-0 h-2.5 w-2.5 cursor-nwse-resize', bar: 'left-0 top-0 h-1 w-1' },
  { mode: 'ne', hit: 'right-0 top-0 h-2.5 w-2.5 cursor-nesw-resize', bar: 'right-0 top-0 h-1 w-1' },
  { mode: 'sw', hit: 'bottom-0 left-0 h-2.5 w-2.5 cursor-nesw-resize', bar: 'bottom-0 left-0 h-1 w-1' },
  { mode: 'se', hit: 'bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize', bar: 'bottom-0 right-0 h-1 w-1' }
]

function ResizeHandles(props: {
  id: string
  title: string
  editing: boolean
  onStart: (e: ReactPointerEvent, id: string, mode: DragMode) => void
}): JSX.Element {
  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge.mode}
          role="button"
          tabIndex={-1}
          aria-label={`调整 ${props.title} 大小`}
          onPointerDown={(event) => props.onStart(event, props.id, edge.mode)}
          // 只有编辑模式才会渲染这些热区（见 GridItem），常规模式下不存在可拉伸的隐形边
          className={cn('absolute z-20 opacity-100', edge.hit)}
        >
          {/* 紧贴模块边缘的细白线（直角、2px），只在悬停/编辑时显现 */}
          <span className={cn('absolute rounded-[1px] bg-white/80', edge.bar)} />
        </div>
      ))}
    </>
  )
}

interface GridItemProps {
  id: string
  title: string
  locked: boolean
  active: boolean
  ready: boolean
  /** 编辑模式：整块可拖动、内容不可点击、轻微颤动 */
  editing: boolean
  left: number
  top: number
  width: number
  height: number
  onStart: (event: ReactPointerEvent, id: string, mode: DragMode) => void
  /** 非编辑模式下用于识别「长按进入编辑模式」 */
  onSurfaceDown: (event: ReactPointerEvent, id: string) => void
  /** 长按刚结束时拦截一次 click，避免误触发卡片内交互 */
  onClickCapture: (event: ReactMouseEvent) => void
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
  editing,
  left,
  top,
  width,
  height,
  onStart,
  onSurfaceDown,
  onClickCapture,
  children
}: GridItemProps): JSX.Element {
  const editable = editing && !locked
  return (
    <div
      data-grid-item={id}
      onPointerDown={editable ? undefined : (event) => onSurfaceDown(event, id)}
      onClickCapture={onClickCapture}
      className={cn('group/grid-item absolute left-0 top-0', (active || editable) && 'z-30')}
      style={{
        width,
        height,
        transform: `translate3d(${left}px, ${top}px, 0)`,
        transition: !ready || active ? undefined : TRANSITION
      }}
    >
      {/* 内容裁剪在卡片边界内：互换后尺寸变小也不会溢出到相邻卡片，避免边界侵入 */}
      <div
        className={cn(
          'h-full overflow-hidden rounded-2xl',
          // 编辑模式：内容不可点击（只能拖拽/缩放），并以轻微颤动提示「可动」
          editable && 'pointer-events-none ring-1 ring-white/25',
          editable && !active && 'animate-jiggle'
        )}
        style={editable && !active ? { animationDelay: `${jigglePhase(id)}ms` } : undefined}
      >
        {children}
      </div>

      {/* 常规模式不提供任何拖拽 / 拉伸热区：只有进入编辑模式（工具条「编辑布局」或长按模块）才能摆放 */}
      {editable ? (
        <>
          <div
            role="button"
            tabIndex={-1}
            aria-label={`拖动 ${title}`}
            onPointerDown={(event) => onStart(event, id, 'move')}
            className="absolute inset-0 z-10 cursor-move touch-none"
          />
          <ResizeHandles id={id} title={title} editing onStart={onStart} />
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
export function GridBoard({
  entries,
  storageKey,
  className,
  toolbar = true,
  hiddenIds,
  extraToolbar
}: GridBoardProps): JSX.Element {
  /** 用户自定义默认布局的存储键：为「重置布局」提供用户自己的基准 */
  const defaultKey = `${storageKey}.default`
  const [customDefault, setCustomDefault] = useState<Cell[] | null>(() => readStoredLayout(defaultKey))
  const [layout, setLayout] = useState<Cell[]>(() =>
    mergeLayout(entries, readStoredLayout(storageKey), readStoredLayout(defaultKey))
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const [ready, setReady] = useState(false)
  /** 编辑模式：整块可拖、内容不可点、轻微颤动 */
  const [editing, setEditing] = useState(false)
  /** 工具栏的一次性提示文案 */
  const [hint, setHint] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef(layout)
  const entriesRef = useRef(entries)
  const dragRef = useRef<DragState | null>(null)
  const metricsRef = useRef({ stepX: 76, stepY: ROW_HEIGHT + GAP })
  const customDefaultRef = useRef(customDefault)
  const editingRef = useRef(editing)
  const stackedRef = useRef(false)
  /** 长按刚触发时拦截一次 click，避免进入编辑模式同时误触卡片按钮 */
  const suppressClickRef = useRef(false)
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)

  layoutRef.current = layout
  entriesRef.current = entries
  customDefaultRef.current = customDefault
  editingRef.current = editing

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
    setLayout((current) => mergeLayout(entriesRef.current, current, customDefaultRef.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySignature])

  // 工具栏提示 3 秒后自动淡出
  useEffect(() => {
    if (!hint) return undefined
    const timer = window.setTimeout(() => setHint(null), 3400)
    return () => window.clearTimeout(timer)
  }, [hint])

  // 持久化布局
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      /* 存储不可用时静默忽略 */
    }
  }, [layout, storageKey])

  const stacked = width > 0 && width < STACK_BREAKPOINT
  stackedRef.current = stacked
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
      for (const other of drag.cells) {
        if (other.id === drag.id) continue
        const oel = drag.els.get(other.id)
        if (oel) {
          oel.style.outline = ''
          oel.style.outlineOffset = ''
        }
      }
      if (commit) {
        // 让落点带过渡吸附到网格位置，随后交还给 React 托管
        element.style.transition = TRANSITION
        const { stepX: sx, stepY: sy } = metricsRef.current
        // 优先与悬停目标完全互换（位置与宽高严格对调，双方各占对方原区域，天然不重叠）
        const target = drag.swapId ? drag.cells.find((item) => item.id === drag.swapId) : undefined
        const nextCells = target
          ? drag.cells.map((cell) => {
              if (cell.id === drag.id) return { ...cell, x: target.x, y: target.y, w: target.w, h: target.h }
              if (cell.id === target.id) return { ...cell, x: drag.base.x, y: drag.base.y, w: drag.base.w, h: drag.base.h }
              return cell
            })
          : drag.cells.map((cell) => {
              if (cell.id !== drag.id) return cell
              // 自由落位：若落点与其它卡片重叠（未达到互换阈值），自动弹到最近的空闲位置
              const spot = findFreeSpot(drag.cells, drag.id, drag.base.w, drag.base.h, drag.lastGX, drag.lastGY, {
                x: drag.base.x,
                y: drag.base.y
              })
              return { ...cell, x: spot.x, y: spot.y }
            })
        for (const other of nextCells) {
          if (other.id === drag.id) continue
          const oel = drag.els.get(other.id)
          if (!oel) continue
          oel.style.transform = `translate3d(${other.x * sx}px, ${other.y * sy}px, 0)`
          oel.style.width = `${other.w * sx - GAP}px`
          oel.style.height = `${other.h * ROW_HEIGHT + (other.h - 1) * GAP}px`
        }
        const cell = nextCells.find((item) => item.id === drag.id)
        if (cell) {
          element.style.transform = `translate3d(${cell.x * sx}px, ${cell.y * sy}px, 0)`
          element.style.width = `${cell.w * sx - GAP}px`
          element.style.height = `${cell.h * ROW_HEIGHT + (cell.h - 1) * GAP}px`
        }
        window.requestAnimationFrame(() => {
          element.style.willChange = ''
          element.style.zIndex = ''
        })
        layoutRef.current = nextCells
        setLayout(nextCells)
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(nextCells))
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
          const gy = clamp(current.base.y + Math.round(dy / sy), 0, Math.max(0, current.maxY))
          if (gx !== current.lastGX || gy !== current.lastGY) {
            current.lastGX = gx
            current.lastGY = gy
            // 只寻找互换目标，不推挤其他方块
            const rect = { id: current.id, x: gx, y: gy, w: current.base.w, h: current.base.h }
            const area = rect.w * rect.h
            let best: Cell | null = null
            let bestArea = 0
            for (const cell of current.cells) {
              if (cell.id === current.id) continue
              const ox = Math.min(rect.x + rect.w, cell.x + cell.w) - Math.max(rect.x, cell.x)
              const oy = Math.min(rect.y + rect.h, cell.y + cell.h) - Math.max(rect.y, cell.y)
              const ov = ox > 0 && oy > 0 ? ox * oy : 0
              const need = Math.min(area, cell.w * cell.h) * 0.35
              if (ov > bestArea && ov > need) {
                bestArea = ov
                best = cell
              }
            }
            const nextSwap = best?.id ?? null
            if (nextSwap !== current.swapId) {
              const prev = current.swapId ? current.els.get(current.swapId) : undefined
              if (prev) {
                prev.style.outline = ''
                prev.style.outlineOffset = ''
              }
              current.swapId = nextSwap
              const next = nextSwap ? current.els.get(nextSwap) : undefined
              if (next) {
                next.style.outline = '2px solid rgba(99,102,241,0.85)'
                next.style.outlineOffset = '2px'
              }
            }
          }
          // 被拖方块始终跟随指针，不做任何吸附延迟
          const rx = clamp(dx - (gx - current.base.x) * sx, -sx / 2, sx / 2)
          const ry = clamp(dy - (gy - current.base.y) * sy, -sy / 2, sy / 2)
          current.el.style.transform = `translate3d(${gx * sx + rx}px, ${gy * sy + ry}px, 0)`
          return
        }

        const west = current.mode.includes('w')
        const north = current.mode.includes('n')
        const minWpx = current.minW * sx - GAP
        const minHpx = current.minH * sy - GAP
        // 西侧缩放：右边缘让位，允许一直向左扩展（最多占满整行）；东侧缩放仍受页面右边界限制
        const maxWpx = (west ? COLS : COLS - current.base.x) * sx - GAP
        const gwMax = west ? COLS : COLS - current.base.x
        const growX = current.mode.includes('e') ? dx : west ? -dx : 0
        const growY = current.mode.includes('s') ? dy : north ? -dy : 0
        const widthPx = clamp(current.baseWidth + growX, minWpx, maxWpx)
        const heightPx = Math.max(minHpx, current.baseHeight + growY)
        const gw = clamp(Math.round((widthPx + GAP) / sx), current.minW, gwMax)
        const gh = Math.max(current.minH, Math.round((heightPx + GAP) / sy))
        const gx = west ? clamp(current.base.x + current.base.w - gw, 0, COLS - gw) : current.base.x
        const gy = north ? Math.max(0, current.base.y + current.base.h - gh) : current.base.y
        if (gw !== current.lastGW || gh !== current.lastGH || gx !== current.lastGX || gy !== current.lastGY) {
          current.lastGW = gw
          current.lastGH = gh
          current.lastGX = gx
          current.lastGY = gy
          // 只推开与当前模块真正重叠的模块，未被影响的模块保持原位
          current.cells = pushOverlapping(
            current.cells.map((cell) => (cell.id === current.id ? { ...cell, x: gx, y: gy, w: gw, h: gh } : cell)),
            { id: current.id, x: gx, y: gy, w: gw, h: gh }
          )
          paintCells(current.cells, current.id)
        }
        const bc = current.base
        current.el.style.width = `${widthPx}px`
        current.el.style.height = `${heightPx}px`
        const right = bc.x * sx + bc.w * sx - GAP
        const bottom = bc.y * sy + bc.h * ROW_HEIGHT + (bc.h - 1) * GAP
        const left = west ? Math.max(0, right - widthPx) : bc.x * sx
        const top = north ? Math.max(0, bottom - heightPx) : bc.y * sy
        current.el.style.transform = `translate3d(${left}px, ${top}px, 0)`
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
    (event: ReactPointerEvent, id: string, mode: DragMode): void => {
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
        // 互换后的尺寸可能小于条目的默认最小值：以「当前尺寸」为实际下限，避免一拖就跳变
        minW: Math.min(entry?.minW ?? 2, base.w),
        minH: Math.min(entry?.minH ?? 2, base.h),
        maxY: Math.max(
          0,
          layoutRef.current.reduce((m, cell) => (cell.id === base.id ? m : Math.max(m, cell.y + cell.h)), base.y + base.h) -
            base.h
        ),
        swapId: null,
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

  /** 直接落定一整套布局（状态 + 持久化） */
  const applyLayout = useCallback(
    (cells: Cell[]) => {
      layoutRef.current = cells
      setLayout(cells)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(cells))
      } catch {
        /* 静默忽略 */
      }
    },
    [storageKey]
  )

  /** 重置：优先回到「我的默认布局」，没有自定义默认时回到系统默认 */
  const resetLayout = useCallback(() => {
    const custom = customDefaultRef.current
    applyLayout(withCustomDefaults(entriesRef.current, custom))
    setHint(custom && custom.length > 0 ? '已回到「我的默认布局」' : '已回到系统默认布局')
  }, [applyLayout])

  /**
   * 一键排列：顺序随机 + 宽高随机 + 整页紧贴铺满。
   * - 先按功能分组（group，缺省用 id 前缀）聚拢，组间与组内顺序都随机，所以每次点都不一样；
   * - 每个模块抽一个随机权重，行内按权重分配宽度，每一行必定占满 12 列；
   * - 每行的行高在「该行最低要求」之上再随机加 0-3 格，于是宽高都随机；
   * - 行与行自上而下紧密堆叠，页面不会出现大块空白。
   */
  const arrangeRandom = useCallback(() => {
    const entryMap = new Map(entriesRef.current.map((entry) => [entry.id, entry]))
    const groupOf = (cell: Cell): string => entryMap.get(cell.id)?.group ?? cell.id.split('-')[0]
    const minHOf = (id: string): number => Math.max(2, entryMap.get(id)?.minH ?? 2)
    const minWOf = (id: string): number => Math.max(2, entryMap.get(id)?.minW ?? 2)

    // 同组排在一起，组间与组内顺序随机
    const groups = new Map<string, Cell[]>()
    for (const cell of layoutRef.current) {
      const key = groupOf(cell)
      const bucket = groups.get(key)
      if (bucket) bucket.push(cell)
      else groups.set(key, [cell])
    }
    const ordered: Cell[] = []
    for (const bucket of [...groups.values()].sort(() => Math.random() - 0.5)) {
      ordered.push(...bucket.sort(() => Math.random() - 0.5))
    }

    // 随机权重决定每块占多宽；一行最多 4 块，保证每块都够宽
    const weight = new Map(ordered.map((cell) => [cell.id, 0.55 + Math.random() * 2.1]))
    const rows: Cell[][] = []
    let row: Cell[] = []
    let acc = 0
    let minWidths = 0
    const flush = (): void => {
      if (row.length > 0) {
        rows.push(row)
        row = []
        acc = 0
        minWidths = 0
      }
    }
    for (const cell of ordered) {
      const need = minWOf(cell.id)
      if (row.length > 0 && (acc + (weight.get(cell.id) ?? 1) > 3.4 || row.length >= 4 || minWidths + need > COLS)) flush()
      row.push(cell)
      acc += weight.get(cell.id) ?? 1
      minWidths += need
    }
    flush()

    // 行内按权重分宽并强制占满 12 列；行高随机；行与行紧密堆叠
    const placed: Cell[] = []
    let y = 0
    for (const rowCells of rows) {
      const total = rowCells.reduce((sum, cell) => sum + (weight.get(cell.id) ?? 1), 0)
      const widths = rowCells.map((cell) =>
        Math.max(minWOf(cell.id), Math.min(COLS - (rowCells.length - 1), Math.round(((weight.get(cell.id) ?? 1) / total) * COLS)))
      )
      // 把行宽精确校正到 12 列：偏窄就加给最宽的一块，偏宽就从最宽且仍高于下限的一块扣掉
      let diff = COLS - widths.reduce((sum, value) => sum + value, 0)
      while (diff > 0) {
        widths[widths.indexOf(Math.max(...widths))] += 1
        diff -= 1
      }
      while (diff < 0) {
        const widest = Math.max(...widths)
        const index = widths.findIndex((value, at) => value === widest && value > minWOf(rowCells[at].id))
        if (index < 0) break
        widths[index] -= 1
        diff += 1
      }
      const floorH = Math.max(...rowCells.map((cell) => minHOf(cell.id)))
      const rowHeight = floorH + Math.floor(Math.random() * 4)
      let x = 0
      rowCells.forEach((cell, index) => {
        placed.push({ ...cell, x, y, w: widths[index], h: rowHeight })
        x += widths[index]
      })
      y += rowHeight
    }
    applyLayout(placed)
    setHint('已随机重排：顺序与宽高都随机，同组相邻且整页紧贴铺满，可继续拖动微调')
  }, [applyLayout])


  /** 把当前布局存为「我的默认布局」，重置布局时都会回到它 */
  const saveAsDefault = useCallback(() => {
    const map = new Map<string, Cell>()
    for (const cell of customDefaultRef.current ?? []) map.set(cell.id, cell)
    for (const cell of layoutRef.current) map.set(cell.id, { ...cell })
    const next = [...map.values()]
    try {
      window.localStorage.setItem(defaultKey, JSON.stringify(next))
    } catch {
      /* 静默忽略 */
    }
    customDefaultRef.current = next
    setCustomDefault(next)
    setHint('已保存为「我的默认布局」：以后点重置就回到这里')
  }, [defaultKey])

  /** 恢复系统默认：清除自定义默认并回到各页面出厂的布局 */
  const restoreSystemDefault = useCallback(() => {
    try {
      window.localStorage.removeItem(defaultKey)
    } catch {
      /* 静默忽略 */
    }
    customDefaultRef.current = null
    setCustomDefault(null)
    applyLayout(defaultLayout(entriesRef.current))
    setHint('已恢复系统默认布局')
  }, [applyLayout, defaultKey])

  /** 进入编辑模式 */
  const enterEditing = useCallback(() => {
    setEditing(true)
    setHint('编辑模式：直接拖动模块或拉边改变大小，模块内容暂不可点击')
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer)
      longPressRef.current = null
    }
  }, [])

  /** 长按任意模块（约 0.55 秒）即进入编辑模式 */
  const handleSurfaceDown = useCallback(
    (event: ReactPointerEvent, id: string) => {
      if (editingRef.current || stackedRef.current) return
      const entry = entriesRef.current.find((item) => item.id === id)
      if (entry?.locked) return
      // 只跳过真正需要输入的元素：卡片本身就是按钮时（如指标卡 StatCard）也应能长按进入编辑，
      // 因此不排除 button / [role="button"]，长按触发后会拦截随后的 click，避免误触卡片交互
      const target = event.target as HTMLElement | null
      if (target?.closest('input, select, textarea, a, [role="switch"]')) return
      cancelLongPress()
      const x = event.clientX
      const y = event.clientY
      longPressRef.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          longPressRef.current = null
          suppressClickRef.current = true
          setEditing(true)
          setHint('已通过长按进入编辑模式：拖动或拉边调整布局')
          window.setTimeout(() => {
            suppressClickRef.current = false
          }, 600)
        }, 550)
      }
    },
    [cancelLongPress]
  )

  /** 长按刚结束时拦截一次 click，避免进入编辑模式的同时触发卡片内按钮 */
  const handleClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  // 指针移动或抬起即取消长按
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const press = longPressRef.current
      if (!press) return
      if (Math.abs(event.clientX - press.x) > 6 || Math.abs(event.clientY - press.y) > 6) cancelLongPress()
    }
    const onUp = (): void => cancelLongPress()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [cancelLongPress])

  // 编辑模式下点击页面空白处即退出编辑（本次调整自动保留）
  useEffect(() => {
    if (!editing) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-grid-item]') || target.closest('[data-grid-toolbar]')) return
      setEditing(false)
      setHint('已退出编辑模式，本次调整已保留')
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [editing])

  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds])
  const ordered = useMemo(
    () => layout.filter((cell) => entries.some((entry) => entry.id === cell.id) && !hidden.has(cell.id)),
    [layout, entries, hidden]
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
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2" data-grid-toolbar>
          {hint ? (
            <span className="mr-auto text-[11px] text-tint-primary">{hint}</span>
          ) : (
            <span className="mr-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <LayoutDashboard className="h-3.5 w-3.5" />
              {editing
                ? '编辑模式：整块拖动即可摆放 · 四边与四角拉伸大小 · 模块内容暂不可点击'
                : '常规模式下模块固定不可拖动 · 长按任意模块或点「编辑布局」即可调整'}
            </span>
          )}
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={arrangeRandom} title="随机重新排列本页所有模块">
                <Shuffle className="h-3.5 w-3.5" />
                一键排列
              </Button>
              <Button size="sm" variant="ghost" onClick={saveAsDefault} title="把当前布局保存为自己的默认布局">
                <Save className="h-3.5 w-3.5" />
                保存为我的默认
              </Button>
              <Button size="sm" variant="ghost" onClick={restoreSystemDefault} title="删除自定义默认布局，回到系统出厂布局">
                <History className="h-3.5 w-3.5" />
                恢复系统默认
              </Button>
              <Button size="sm" variant="secondary" onClick={resetLayout} title="回到我的默认布局（未设置时回到系统默认）">
                <RotateCcw className="h-3.5 w-3.5" />
                重置
              </Button>
              <Button size="sm" variant="primary" onClick={() => setEditing(false)}>
                <Check className="h-3.5 w-3.5" />
                完成
              </Button>
            </>
          ) : (
            <>
              {extraToolbar}
              <Button size="sm" variant="ghost" onClick={resetLayout} title="回到默认布局">
                <RotateCcw className="h-3.5 w-3.5" />
                重置布局
              </Button>
              <Button size="sm" variant="secondary" onClick={enterEditing} title="进入编辑模式，自由调整模块位置与大小">
                <Pencil className="h-3.5 w-3.5" />
                编辑布局
              </Button>
            </>
          )}
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
              editing={editing}
              left={cell.x * stepX}
              top={cell.y * stepY}
              width={cell.w * stepX - GAP}
              height={cell.h * ROW_HEIGHT + (cell.h - 1) * GAP}
              onStart={startInteraction}
              onSurfaceDown={handleSurfaceDown}
              onClickCapture={handleClickCapture}
            >
              {entry.node}
            </GridItem>
          )
        })}
      </div>
    </div>
  )
}
