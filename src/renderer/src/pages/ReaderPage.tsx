import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  Highlighter,
  List,
  Loader2,
  Minus,
  NotebookPen,
  Pencil,
  Plus,
  Rows3,
  Save,
  Search,
  Maximize2,
  Minimize2,
  RotateCw,
  Star,
  X
} from 'lucide-react'
import type { NoteDocInfo, NoteMark, NoteMarkKind } from '@shared/types/domain'
import { Button, IconButton } from '../components/ui/Button'
import { Spinner } from '../components/ui/Feedback'
import {
  forgetPdf,
  mountCanvas,
  openPdf,
  pageCanvas,
  pageSize,
  pageText,
  peekCanvas,
  SCREEN_SCALE,
  type PdfDocInfo
} from '../lib/pdf'
import { api } from '../lib/ipc'
import { cn, formatDateTime } from '../lib/utils'

/** 翻页动效：直切 / 淡入淡出 / 推移 / 覆盖 / 仿真翻书 */
type FlipEffect = 'none' | 'fade' | 'slide' | 'cover' | 'book'
/** 页面摆放：单页 / 双页 / 连续滚动 */
type StageLayout = 'single' | 'double' | 'continuous'
/** 缩放基准：适应宽度 / 适应整页 / 实际大小 */
type FitMode = 'width' | 'page' | 'actual'
type PanelTab = 'outline' | 'thumbs' | 'marks' | 'notes' | 'find' | 'page-text'

const FLIP_LABELS: { key: FlipEffect; label: string }[] = [
  { key: 'none', label: '直切' },
  { key: 'fade', label: '淡入' },
  { key: 'slide', label: '推移' },
  { key: 'cover', label: '覆盖' },
  { key: 'book', label: '翻书' }
]

/** 翻页动效时长，与 CSS 里五种动效的 340ms 完全一致：残影在动画收尾之后才卸载 */
const TURN_MS = 340

export function ReaderPage(): JSX.Element {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const id = Number(noteId)

  const [info, setInfo] = useState<NoteDocInfo | null>(null)
  const [error, setError] = useState('')
  const [pdf, setPdf] = useState<PdfDocInfo | null>(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [layout, setLayout] = useState<StageLayout>('single')
  const [fit, setFit] = useState<FitMode>('page')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [panning, setPanning] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [flip, setFlip] = useState<FlipEffect>('book')
  const [panel, setPanel] = useState<PanelTab | null>('outline')
  const [marks, setMarks] = useState<NoteMark[]>([])
  const [readMinutes, setReadMinutes] = useState(0)
  const [fontSize, setFontSize] = useState(17)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [turning, setTurning] = useState<{ from: number; to: number; dir: 1 | -1 } | null>(null)
  const [composer, setComposer] = useState<{ kind: NoteMarkKind; quote: string } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const progressTimer = useRef<number | null>(null)
  const turnTimer = useRef<number | null>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const anchor = useRef<{ x: number; y: number; r: number; cx: number; cy: number } | null>(null)
  const wheelAcc = useRef(0)
  const scaleRef = useRef(1)
  const layoutRef = useRef<StageLayout>('single')
  const stepRef = useRef<(delta: number) => void>(() => undefined)

  // ---------- 载入文档 ----------
  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setError('')
    setPdf(null)
    void (async () => {
      try {
        const doc = await api.note.doc(id)
        if (cancelled) return
        setInfo(doc)
        setDraft(doc.text)
        setPage(Math.max(1, doc.note.lastPage || 1))
        if (doc.viewMode === 'pages' && doc.data) {
          const opened = await openPdf(doc.data, (outline) => {
            opened.outline = outline
            setPdf((current) => (current && current.doc === opened.doc ? { ...opened } : current))
          })
          if (cancelled) {
            forgetPdf(opened.uid)
            void opened.doc.destroy()
            return
          }
          setPdf(opened)
          setPageCount(opened.pageCount)
          void api.note.progress(id, Math.max(1, doc.note.lastPage || 1), opened.pageCount)
        } else if (doc.viewMode === 'rich') {
          setPageCount(Math.max(1, doc.note.pageCount || 1))
        } else {
          setPageCount(1)
          setPage(1)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    void api.note.marks(id).then((list) => !cancelled && setMarks(list))
    void api.focus.readingMinutes(id).then((minutes) => !cancelled && setReadMinutes(minutes)).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id])

  // 换书 / 关书时丢掉这本书的画布缓存，长文档不至于一直占着内存
  useEffect(() => {
    if (!pdf) return undefined
    const uid = pdf.uid
    return () => forgetPdf(uid)
  }, [pdf])

  // ---------- 舞台尺寸：自适应窗口，等比缩放都以此为基准 ----------
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = (): void => setStageSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [info])

  // ---------- 翻页动画：只有逐页翻才做动效，动画结束再清掉残影 ----------
  const pageRef = useRef(1)
  useEffect(() => {
    pageRef.current = page
  }, [page])
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const goPage = useCallback(
    (next: number, dir?: 1 | -1) => {
      const target = Math.min(Math.max(1, Math.round(next)), Math.max(1, pageCount))
      const current = pageRef.current
      if (target === current) return
      const direction = dir ?? (target > current ? 1 : -1)
      pageRef.current = target
      if (flip !== 'none' && Math.abs(target - current) === 1) {
        if (turnTimer.current) window.clearTimeout(turnTimer.current)
        setTurning({ from: current, to: target, dir: direction })
        turnTimer.current = window.setTimeout(() => {
          turnTimer.current = null
          setTurning(null)
        }, TURN_MS)
      } else {
        if (turnTimer.current) window.clearTimeout(turnTimer.current)
        turnTimer.current = null
        setTurning(null)
      }
      setPage(target)
    },
    [pageCount, flip]
  )

  const step = useCallback(
    (delta: number) => {
      const stride = layout === 'double' ? 2 : 1
      goPage(pageRef.current + delta * stride, delta > 0 ? 1 : -1)
    },
    [goPage, layout]
  )
  useEffect(() => {
    stepRef.current = step
  }, [step])

  // ---------- 阅读计时：读了多久就记到关联的任务 / 项目（课程）的专注时间里 ----------
  const readTarget = useMemo(() => {
    if (!info) return null
    const taskId = info.note.taskId ?? null
    const projectId = info.note.projectId ?? null
    if (taskId === null && projectId === null) return null
    return { taskId, projectId, title: info.note.title }
  }, [info?.note.taskId, info?.note.projectId, info?.note.title])

  useEffect(() => {
    if (!readTarget) return undefined
    let seconds = 0
    const timer = window.setInterval(() => {
      // 窗口隐藏 / 切到别的标签页时不计入
      if (document.hidden) return
      seconds += 15
      if (seconds < 60) return
      const minutes = Math.floor(seconds / 60)
      seconds -= minutes * 60
      void api.focus
        .logReading({
          noteId: id,
          taskId: readTarget.taskId,
          projectId: readTarget.projectId,
          minutes,
          label: '阅读《' + readTarget.title.slice(0, 20) + '》'
        })
        .then((session) => {
          if (session) setReadMinutes((value) => value + session.durationMinutes)
        })
        .catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [id, readTarget])

  // ---------- 阅读进度：停留 900ms 再落库，避免翻页时频繁写库 ----------
  useEffect(() => {
    if (!info || info.viewMode === 'text') return
    if (progressTimer.current) window.clearTimeout(progressTimer.current)
    progressTimer.current = window.setTimeout(() => {
      void api.note.progress(id, page, pageCount)
    }, 900)
    return () => {
      if (progressTimer.current) window.clearTimeout(progressTimer.current)
    }
  }, [id, page, pageCount, info])

  // ---------- 快捷键：与主流阅读器对齐（Ctrl+滚轮 / Ctrl+- 缩放，方向键与空格翻页，F 全屏） ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) {
        if (event.key === 'Escape') (target as HTMLElement).blur()
        return
      }
      const ctrl = event.ctrlKey || event.metaKey
      const pages = info?.viewMode === 'pages'
      const scrolling = layout === 'continuous' || info?.viewMode === 'text'

      if (ctrl) {
        switch (event.key) {
          case '=':
          case '+':
            event.preventDefault()
            zoomBy(1.2)
            return
          case '-':
          case '_':
            event.preventDefault()
            zoomBy(1 / 1.2)
            return
          case '0':
            event.preventDefault()
            resetZoom()
            return
          case 'f':
          case 'F':
            event.preventDefault()
            setPanel('find')
            return
          default:
            return
        }
      }

      switch (event.key) {
        case 'ArrowRight':
          if (pages) {
            event.preventDefault()
            step(1)
          }
          break
        case 'ArrowDown':
          if (scrolling) {
            event.preventDefault()
            scrollPages(1, 0.28)
          } else if (canScrollStage()) {
            event.preventDefault()
            scrollPages(1, 0.28)
          } else {
            event.preventDefault()
            step(1)
          }
          break
        case 'ArrowLeft':
          if (pages) {
            event.preventDefault()
            step(-1)
          }
          break
        case 'ArrowUp':
          if (scrolling) {
            event.preventDefault()
            scrollPages(-1, 0.28)
          } else if (canScrollStage()) {
            event.preventDefault()
            scrollPages(-1, 0.28)
          } else {
            event.preventDefault()
            step(-1)
          }
          break
        case ' ':
        case 'PageDown':
        case 'PageUp': {
          const back = event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)
          event.preventDefault()
          if (scrolling) scrollPages(back ? -1 : 1, 1)
          else step(back ? -1 : 1)
          break
        }
        case 'Home':
          event.preventDefault()
          goPage(1, -1)
          break
        case 'End':
          event.preventDefault()
          goPage(pageCount, 1)
          break
        case '+':
        case '=':
          event.preventDefault()
          zoomBy(1.2)
          break
        case '-':
        case '_':
          event.preventDefault()
          zoomBy(1 / 1.2)
          break
        case '0':
          event.preventDefault()
          resetZoom()
          break
        case 'r':
        case 'R':
          if (pages) {
            event.preventDefault()
            setRotation((value) => (value + 90) % 360)
          }
          break
        case 'b':
        case 'B':
          event.preventDefault()
          void toggleMark('bookmark')
          break
        case 's':
        case 'S':
          event.preventDefault()
          void toggleMark('star')
          break
        case 'e':
        case 'E':
          event.preventDefault()
          setComposer({ kind: 'note', quote: '' })
          break
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFullscreen()
          break
        case 'l':
        case 'L': {
          event.preventDefault()
          const order: StageLayout[] = ['single', 'double', 'continuous']
          setLayout(order[(order.indexOf(layout) + 1) % order.length])
          break
        }
        case '1':
          event.preventDefault()
          setLayout('single')
          break
        case '2':
          event.preventDefault()
          setLayout('double')
          break
        case '3':
          event.preventDefault()
          setLayout('continuous')
          break
        case 'Escape':
          if (composer) setComposer(null)
          else if (panel) setPanel(null)
          else if (fullscreen) void api.win.setFullscreen(false).catch(() => undefined)
          else navigate(-1)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, goPage, pageCount, panel, composer, info, flip, navigate, page, marks, layout, fullscreen])

  // ---------- 标记 ----------
  const toggleMark = async (kind: NoteMarkKind): Promise<void> => {
    const existing = marks.find((mark) => mark.kind === kind && mark.page === (info?.viewMode === 'text' ? 0 : page))
    if (existing) {
      await api.note.removeMark(existing.id)
      setMarks((list) => list.filter((mark) => mark.id !== existing.id))
      return
    }
    const quote = kind === 'note' ? '' : await currentQuote()
    const created = await api.note.saveMark({
      noteId: id,
      kind,
      page: info?.viewMode === 'text' ? 0 : page,
      label: kind === 'bookmark' ? `第 ${page} 页书签` : `重点：第 ${page} 页`,
      quote
    })
    setMarks((list) => [...list, created])
  }

  const currentQuote = async (): Promise<string> => {
    const selection = window.getSelection()?.toString().trim() ?? ''
    if (selection !== '') return selection.slice(0, 400)
    if (pdf) {
      try {
        const p = await pdf.doc.getPage(Math.min(page, pdf.pageCount))
        const text = await pageText(p)
        return text.slice(0, 200)
      } catch {
        return ''
      }
    }
    return ''
  }

  const removeMark = async (markId: number): Promise<void> => {
    await api.note.removeMark(markId)
    setMarks((list) => list.filter((mark) => mark.id !== markId))
  }

  const saveComposer = async (body: string, quote: string): Promise<void> => {
    const created = await api.note.saveMark({
      noteId: id,
      kind: 'note',
      page: info?.viewMode === 'text' ? 0 : page,
      label: `注释：第 ${page} 页`,
      quote,
      body
    })
    setMarks((list) => [...list, created])
    setComposer(null)
  }

  // ---------- 保存正文（仅文本模式） ----------
  const saveText = async (): Promise<void> => {
    if (!info) return
    setSaving(true)
    try {
      const note = await api.note.save({ id, title: info.note.title, content: draft })
      setInfo({ ...info, note, text: draft })
    } finally {
      setSaving(false)
    }
  }

  // ---------- 缩放计算：适应基准 × 用户倍率，窗口变化时自动跟随 ----------
  const fitScale = useMemo(() => {
    if (!pdf) return 1
    const pad = 44
    const w = Math.max(120, stageSize.width - pad)
    const h = Math.max(120, stageSize.height - pad)
    const box = pageSize(pdf.baseWidth, pdf.baseHeight, 1, rotation)
    const base = layout === 'double' ? box.width * 2 + 16 : box.width
    // 连续滚动时按宽度铺满，整页适配没有意义
    if (fit === 'width' || layout === 'continuous') return w / box.width
    if (fit === 'page') return Math.min(w / base, h / box.height)
    return SCREEN_SCALE
  }, [pdf, stageSize, fit, layout, rotation])
  const scale = Math.max(0.1, Math.min(12, fitScale * zoom))
  scaleRef.current = scale
  const zoomPercent = info?.viewMode === 'rich' ? Math.round(zoom * 100) : Math.round((scale / SCREEN_SCALE) * 100)
  /** 只有内容真的比舞台大才需要拖动平移 */
  const canPan = info?.viewMode === 'pages' && (layout === 'continuous' || scale > fitScale + 0.002 || zoom > 1.001)
  /**
   * 点书页左右两侧翻页：放大（可拖动）状态下自动收起，
   * 否则拖动看细节时松手就跳页，会误触。
   */
  const canZoneFlip =
    info !== null && info.viewMode !== 'text' && layout !== 'continuous' && zoom <= 1.02 && !canPan

  /** 连续滚动时由舞台回报「现在看到第几页」 */
  const handleActivePage = useCallback(
    (next: number) => {
      const target = Math.min(Math.max(1, next), Math.max(1, pageCount))
      if (pageRef.current === target) return
      pageRef.current = target
      setPage(target)
    },
    [pageCount]
  )
  const handleWheelZoomRich = useCallback((factor: number) => {
    setZoom((value) => Math.max(0.35, Math.min(6, value * factor)))
  }, [])
  const attachScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
  }, [])

  /** 以指针为锚点缩放：先记下锚点，缩放落地后把滚动条调回指针下 */
  const zoomBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const node = scrollRef.current
    const before = scaleRef.current
    const after = Math.max(0.1, Math.min(12, before * factor))
    if (node && clientX !== undefined && clientY !== undefined) {
      const rect = node.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top
      anchor.current = { x: cx + node.scrollLeft, y: cy + node.scrollTop, r: after / before, cx, cy }
    }
    setZoom((value) => Math.max(0.1, Math.min(12, value * (after / before))))
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(1)
    setFit('page')
    setRotation(0)
  }, [])

  // 缩放落地后修正滚动位置：放大时指针指着的内容保持在原地
  useLayoutEffect(() => {
    const spot = anchor.current
    const node = scrollRef.current
    if (!spot || !node) return
    anchor.current = null
    node.scrollLeft = spot.x * spot.r - spot.cx
    node.scrollTop = spot.y * spot.r - spot.cy
  }, [scale])

  // ---------- Ctrl + 滚轮缩放；普通滚轮：单页滚到底再翻页，连续模式走原生滚动 ----------
  useEffect(() => {
    const node = scrollRef.current
    if (!node || !info || info.viewMode === 'text') return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const factor = Math.exp(-event.deltaY * 0.0022)
        if (info.viewMode === 'rich') setZoom((value) => Math.max(0.35, Math.min(6, value * factor)))
        else zoomBy(factor, event.clientX, event.clientY)
        wheelAcc.current = 0
        return
      }
      if (info.viewMode !== 'pages') return
      if (layoutRef.current === 'continuous') return
      const down = event.deltaY > 0
      const fits = node.scrollHeight <= node.clientHeight + 2
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2
      const atTop = node.scrollTop <= 2
      if (!fits && !(down ? atBottom : atTop)) {
        wheelAcc.current = 0
        return
      }
      wheelAcc.current += event.deltaY
      if (Math.abs(wheelAcc.current) < 140) return
      stepRef.current(down ? 1 : -1)
      wheelAcc.current = 0
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [info, layout, zoomBy])

  // ---------- 左键按住拖动：放大后随手平移页面 ----------
  const onPanDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const node = scrollRef.current
    if (!node || !info || info.viewMode === 'text') return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea, iframe, [role="switch"], [role="button"]')) return
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
      moved: false
    }
  }
  const onPanMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pan = panRef.current
    const node = scrollRef.current
    if (!pan || !node) return
    const dx = event.clientX - pan.x
    const dy = event.clientY - pan.y
    if (!pan.moved && Math.abs(dx) + Math.abs(dy) < 5) return
    pan.moved = true
    if (!panning) setPanning(true)
    node.scrollLeft = pan.left - dx
    node.scrollTop = pan.top - dy
  }
  const endPan = (): void => {
    const pan = panRef.current
    panRef.current = null
    if (panning) setPanning(false)
    if (pan && pan.moved) {
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 80)
    }
  }
  /** 刚拖完那一下不算点击，避免拖动变成跳页 */
  const onStageClickCapture = (event: ReactMouseEvent): void => {
    if (!suppressClick.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  // ---------- 全屏：与标题栏按钮、F11 共用窗口级全屏（Esc / F 退出） ----------
  const toggleFullscreen = useCallback((): void => {
    void api.win.setFullscreen().catch(() => undefined)
  }, [])
  useEffect(() => {
    void api.win.getState().then((state) => setFullscreen(state.fullscreen)).catch(() => undefined)
    return api.onWindowState((state) => setFullscreen(state.fullscreen))
  }, [])

  /** 连续滚动 / 文本模式下的滚动翻页 */
  const scrollPages = (direction: number, screens = 1): void => {
    const node = scrollRef.current
    if (!node) return
    node.scrollBy({ top: direction * Math.max(80, node.clientHeight - 72) * screens, behavior: 'smooth' })
  }
  const canScrollStage = (): boolean => {
    const node = scrollRef.current
    return !!node && node.scrollHeight > node.clientHeight + 4
  }

  const marksOnPage = marks.filter((mark) => (info?.viewMode === 'text' ? 0 : page) === mark.page)
  const hasBookmark = marksOnPage.some((mark) => mark.kind === 'bookmark')
  const hasStar = marksOnPage.some((mark) => mark.kind === 'star')

  if (error !== '') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <p className="text-sm">这份资料打不开：{error}</p>
        <Button variant="secondary" onClick={() => navigate('/notes')}>
          回到笔记页
        </Button>
      </div>
    )
  }
  if (!info) {
    return (
      <div className="flex h-full items-center justify-center gap-3 bg-background text-muted-foreground">
        <Spinner />
        <span className="text-sm">正在打开…</span>
      </div>
    )
  }

  const modeLabel = info.viewMode === 'pages' ? '书页' : info.viewMode === 'rich' ? '排版' : '文本'

  return (
    <div className="reader-shell flex h-full w-full flex-col overflow-hidden bg-background">
      {/* ---------------- 顶部工具条 ---------------- */}
      <header className="reader-bar flex min-h-[3.5rem] shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
        <IconButton label="返回（Esc）" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{info.note.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {modeLabel}
            {info.sourceFormat ? ` · ${info.sourceFormat}` : ''}
            {info.viewMode !== 'text' ? ` · 共 ${pageCount} 页` : ` · ${draft.length} 字`}
            {info.readonly ? ' · 只读' : ' · 可编辑'}
            {marks.length > 0 ? ` · ${marks.length} 条笔记` : ''}
          </p>
        </div>

        {info.viewMode !== 'text' ? (
          <>
            <div className="flex items-center gap-1">
              <IconButton label="上一页（←）" onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <input
                value={page}
                onChange={(event) => goPage(Number(event.target.value.replace(/\D/g, '')) || 1)}
                className="h-7 w-14 rounded-md border border-border bg-input px-1 text-center text-xs text-foreground"
                aria-label="页码"
              />
              <span className="text-xs text-muted-foreground">/ {pageCount}</span>
              <IconButton label="下一页（→）" onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            <Segmented
              value={layout}
              title="页面摆放"
              options={[
                { key: 'single', label: '单页', icon: <Rows3 className="h-3.5 w-3.5" /> },
                { key: 'double', label: '双页', icon: <Columns2 className="h-3.5 w-3.5" /> },
                { key: 'continuous', label: '连续', icon: <List className="h-3.5 w-3.5" /> }
              ]}
              onChange={(key) => setLayout(key as StageLayout)}
            />
            <Segmented
              value={flip}
              title="翻页动效"
              options={FLIP_LABELS.map((item) => ({ key: item.key, label: item.label }))}
              onChange={(key) => setFlip(key as FlipEffect)}
            />
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5">
              <IconButton label="缩小（Ctrl+滚轮 / Ctrl+-）" onClick={() => (info.viewMode === 'rich' ? handleWheelZoomRich(1 / 1.2) : zoomBy(1 / 1.2))}>
                <Minus className="h-3.5 w-3.5" />
              </IconButton>
              <button
                type="button"
                title="恢复适页（Ctrl+0）"
                onClick={resetZoom}
                className="w-14 shrink-0 cursor-pointer text-center text-[11px] tabular-nums text-foreground hover:text-tint-primary"
              >
                {zoomPercent}%
              </button>
              <IconButton label="放大（Ctrl+滚轮 / Ctrl++）" onClick={() => (info.viewMode === 'rich' ? handleWheelZoomRich(1.2) : zoomBy(1.2))}>
                <Plus className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            {info.viewMode === 'pages' ? (
              <>
                <Segmented
                  value={fit}
                  title="缩放基准"
                  options={[
                    { key: 'width', label: '适宽' },
                    { key: 'page', label: '适页' },
                    { key: 'actual', label: '100%' }
                  ]}
                  onChange={(key) => {
                    setFit(key as FitMode)
                    setZoom(1)
                  }}
                />
                <IconButton label="旋转 90°（R）" onClick={() => setRotation((value) => (value + 90) % 360)}>
                  <RotateCw className={cn('h-3.5 w-3.5', rotation !== 0 && 'text-tint-primary')} />
                </IconButton>
              </>
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5">
            <IconButton label="减小字号" onClick={() => setFontSize((value) => Math.max(12, value - 1))}>
              <span className="text-[10px] font-semibold">A−</span>
            </IconButton>
            <span className="w-8 text-center text-[11px] tabular-nums text-foreground">{fontSize}</span>
            <IconButton label="增大字号" onClick={() => setFontSize((value) => Math.min(30, value + 1))}>
              <span className="text-[13px] font-semibold">A+</span>
            </IconButton>
          </div>
        )}

        <div className="flex items-center gap-1">
          <IconButton label="书签（B）" onClick={() => void toggleMark('bookmark')}>
            {hasBookmark ? <BookmarkCheck className="h-4 w-4 text-tint-primary" /> : <Bookmark className="h-4 w-4" />}
          </IconButton>
          <IconButton label="标为重点页（S）" onClick={() => void toggleMark('star')}>
            <Star className={cn('h-4 w-4', hasStar && 'fill-current text-tint-warning')} />
          </IconButton>
          <IconButton label="写注释（E）" onClick={() => setComposer({ kind: 'note', quote: '' })}>
            <NotebookPen className="h-4 w-4" />
          </IconButton>
          <IconButton label="页内查找（Ctrl+F）" onClick={() => setPanel(panel === 'find' ? null : 'find')}>
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={panel ? '收起侧栏' : '展开目录 / 书签 / 注释'}
            onClick={() => setPanel(panel ? null : 'outline')}
          >
            <List className="h-4 w-4" />
          </IconButton>
          <IconButton label={fullscreen ? '退出全屏（F）' : '全屏阅读（F）'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
          {info.viewMode === 'text' && !info.readonly ? (
            <Button
              size="sm"
              variant={editing ? 'primary' : 'secondary'}
              icon={editing ? <Save className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              loading={saving}
              onClick={() => {
                if (editing) void saveText()
                setEditing(!editing)
              }}
            >
              {editing ? '保存' : '编辑'}
            </Button>
          ) : null}
          {info.sourcePath ? (
            <IconButton label="用系统默认程序打开源文件" onClick={() => void api.note.openSource(id)}>
              <Download className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </header>

      {/* ---------------- 主体：舞台 + 侧栏 ---------------- */}
      <div className="flex min-h-0 flex-1">
        <main className="reader-stage-wrap relative flex min-w-0 flex-1 flex-col">
          <div
            ref={stageRef}
            className={cn(
              'reader-stage relative flex-1 overflow-hidden',
              canPan && 'is-pannable',
              panning && 'is-panning'
            )}
            data-flip={flip}
            data-layout={layout}
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={endPan}
            onPointerLeave={endPan}
            onPointerCancel={endPan}
            onClickCapture={onStageClickCapture}
            onDoubleClick={() => {
              if (info.viewMode !== 'pages') return
              if (zoom !== 1) resetZoom()
              else zoomBy(1.6)
            }}
          >
            {info.viewMode === 'pages' && pdf ? (
              <PdfStage
                pdf={pdf}
                page={page}
                pageCount={pageCount}
                scale={scale}
                rotation={rotation}
                layout={layout}
                turning={turning}
                  onScrollNode={attachScrollNode}
                  onJump={goPage}
                onActivePage={handleActivePage}
              />
            ) : info.viewMode === 'rich' ? (
              <RichStage
                html={info.html ?? ''}
                page={page}
                zoom={zoom}
                layout={layout}
                turning={turning}
                onPageCount={setPageCount}
                onActivePage={handleActivePage}
                onWheelZoom={handleWheelZoomRich}
              />
            ) : (
              <TextStage
                text={editing ? draft : info.text}
                editing={editing}
                onEdit={setDraft}
                fontSize={fontSize}
                readonly={info.readonly}
              />
            )}

            {/* 左右点击热区：点右边下一页、点左边上一页（放大后不可用） */}
            {canZoneFlip ? (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="上一页"
                  title="上一页（点击书页左侧）"
                  className="mw-pagezone mw-pagezone-left"
                  onClick={() => step(-1)}
                >
                  <span>
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="下一页"
                  title="下一页（点击书页右侧）"
                  className="mw-pagezone mw-pagezone-right"
                  onClick={() => step(1)}
                >
                  <span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </>
            ) : null}
          </div>

          {/* 底部状态条：页码进度与快捷键提示 */}
          <footer className="reader-foot flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {info.viewMode === 'text' ? '连续阅读' : `第 ${page} / ${pageCount} 页`}
            </span>
            <span className="h-3 w-px bg-border" />
            <span>← → 翻页</span>
            <span>空格 下一页</span>
            <span>点书页左右侧翻页</span>
            <span>Ctrl+滚轮 缩放</span>
            <span>按住左键拖动</span>
            <span>B 书签</span>
            <span>S 重点</span>
            <span>E 注释</span>
            <span>R 旋转</span>
            <span>F / F11 全屏</span>
            {readMinutes > 0 ? (
              <>
                <span className="h-3 w-px bg-border" />
                <span className="tabular-nums">本篇已读 {readMinutes} 分钟</span>
              </>
            ) : null}
            <span className="ml-auto tabular-nums">{Math.round((page / Math.max(1, pageCount)) * 100)}%</span>
          </footer>
        </main>

        {panel ? (
          <ReaderPanel
            tab={panel}
            onTab={setPanel}
            info={info}
            pdf={pdf}
            page={page}
            pageCount={pageCount}
            marks={marks}
            onClose={() => setPanel(null)}
            onJump={(target) => goPage(target)}
            onRemoveMark={(markId) => void removeMark(markId)}
            onAddMark={(kind) => void toggleMark(kind)}
            onCompose={(quote) => setComposer({ kind: 'note', quote })}
          />
        ) : null}
      </div>

      {composer ? (
        <MarkComposer
          page={page}
          initialQuote={composer.quote}
          currentQuote={currentQuote}
          onCancel={() => setComposer(null)}
          onSave={(body, quote) => void saveComposer(body, quote)}
        />
      ) : null}
    </div>
  )
}
/* ==================== 分段按钮 ==================== */
function Segmented(props: {
  value: string
  title: string
  options: { key: string; label: string; icon?: JSX.Element }[]
  onChange: (key: string) => void
}): JSX.Element {
  const { value, title, options, onChange } = props
  return (
    <div className="seg-base inline-flex" title={title}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
            value === option.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ==================== 书页舞台（PDF / 原版式） ==================== */
interface StageProps {
  pdf: PdfDocInfo
  page: number
  pageCount: number
  scale: number
  rotation: number
  layout: StageLayout
  turning: { from: number; to: number; dir: 1 | -1 } | null
  /** 把真正滚动的节点交回上层：Ctrl+滚轮缩放与左键拖动都要挂在它上面 */
  onScrollNode: (node: HTMLDivElement | null) => void
  onJump: (page: number) => void
  onActivePage: (page: number) => void
}

function PdfStage(props: StageProps): JSX.Element {
  const { pdf, page, pageCount, scale, rotation, layout, turning, onScrollNode, onJump, onActivePage } = props

  /* 预取相邻页：真正翻页时那一页已经在缓存里，动效第一帧就是成品画面，
     不会再出现「先空白一下再蹦出内容」的抽搐 */
  const roundedScale = Math.round(scale * 100) / 100
  useEffect(() => {
    if (layout === 'continuous') return
    const stride = layout === 'double' ? 2 : 1
    const targets = [page + stride, page - stride, page + stride * 2, page - stride * 2]
    targets.forEach((target, index) => {
      if (target < 1 || target > pageCount) return
      void pageCanvas(pdf.doc, pdf.uid, target, roundedScale, rotation, -4 - index).catch(() => undefined)
    })
  }, [pdf, page, pageCount, layout, roundedScale, rotation])

  if (layout === 'continuous') {
    return (
      <ContinuousPages
        pdf={pdf}
        page={page}
        pageCount={pageCount}
        scale={scale}
        rotation={rotation}
        onScrollNode={onScrollNode}
        onJump={onJump}
        onActivePage={onActivePage}
      />
    )
  }

  const double = layout === 'double'
  const right = double ? page + 1 : 0
  const ghostPages = turning ? (double ? [turning.from, turning.from + 1] : [turning.from]) : []
  const currentPages = double ? [page, right] : [page]
  const box = pageSize(pdf.baseWidth, pdf.baseHeight, scale, rotation)

  return (
    <div ref={onScrollNode} className="reader-page-area h-full overflow-auto">
      {/* 用 margin:auto 居中：放大超出舞台时上下左右都能滚到，不会被裁掉 */}
      <div className="mw-book-frame">
        <div className={cn('mw-book', turning && 'is-turning', turning?.dir === -1 && 'is-reverse')}>
          <div className="mw-layer mw-layer-in">
            {currentPages.map((number) =>
              number >= 1 && number <= pageCount ? (
                <PdfPageView
                  key={`i${number}`}
                  pdf={pdf}
                  pageNumber={number}
                  scale={scale}
                  rotation={rotation}
                  active
                  priority={10}
                />
              ) : (
                <div key={`blank${number}`} className="mw-page mw-page-blank" style={{ width: box.width, height: box.height }} />
              )
            )}
          </div>
          {ghostPages.length > 0 && turning ? (
            <div className="mw-layer mw-layer-out">
              {ghostPages.map((number) =>
                number >= 1 && number <= pageCount ? (
                  <PdfPageView
                    key={`o${number}`}
                    pdf={pdf}
                    pageNumber={number}
                    scale={scale}
                    rotation={rotation}
                    ghost
                  />
                ) : null
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** 连续模式：所有页顺排，滚到哪页算哪页；画布按队列逐页渲染，不会一次卡死 */
function ContinuousPages(props: Omit<StageProps, 'turning' | 'layout'>): JSX.Element {
  const { pdf, page, pageCount, scale, rotation, onScrollNode, onJump, onActivePage } = props
  const listRef = useRef<HTMLDivElement>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const setNode = (el: HTMLDivElement | null): void => {
    nodeRef.current = el
    onScrollNode(el)
  }
  const raf = useRef(0)
  const reported = useRef(page)
  reported.current = page

  const handleScroll = (): void => {
    if (raf.current) return
    raf.current = window.requestAnimationFrame(() => {
      raf.current = 0
      const node = nodeRef.current
      const list = listRef.current
      if (!node || !list) return
      const line = node.scrollTop + node.clientHeight * 0.4
      let found = 1
      const children = list.children
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index] as HTMLElement
        if (child.offsetTop <= line) found = index + 1
        else break
      }
      if (found !== reported.current) {
        reported.current = found
        onActivePage(found)
      }
    })
  }
  useEffect(
    () => () => {
      if (raf.current) window.cancelAnimationFrame(raf.current)
    },
    []
  )

  return (
    <div ref={setNode} className="reader-scroll h-full overflow-auto px-6 py-5" onScroll={handleScroll}>
      <div ref={listRef} className="mx-auto flex w-fit flex-col gap-4">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <PdfPageView
            key={number}
            pdf={pdf}
            pageNumber={number}
            scale={scale}
            rotation={rotation}
            active={number === page}
            lazy
            priority={Math.abs(number - page) <= 1 ? 30 : 4}
            onJump={onJump}
          />
        ))}
      </div>
    </div>
  )
}

/** 单页画布：走渲染队列 + 画布缓存，缩放来回切不重画，翻页残影也能立刻拿到图 */
function PdfPageView(props: {
  pdf: PdfDocInfo
  pageNumber: number
  scale: number
  rotation: number
  active?: boolean
  ghost?: boolean
  lazy?: boolean
  priority?: number
  onJump?: (page: number) => void
}): JSX.Element {
  const { pdf, pageNumber, scale, rotation, active, ghost, lazy, priority = 0, onJump } = props
  const holder = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [visible, setVisible] = useState(!lazy)
  const rounded = Math.round(scale * 100) / 100
  const box = pageSize(pdf.baseWidth, pdf.baseHeight, rounded, rotation)
  const mountKey = pdf.uid + '|' + pageNumber + '|' + rounded + '|' + rotation
  const mounted = useRef('')

  /* 缓存里已有这一页：这一帧就贴上，不等异步队列（翻页残影靠这个才不闪） */
  useLayoutEffect(() => {
    if (!visible || !holder.current) return
    const cached = peekCanvas(pdf.uid, pageNumber, rounded, rotation)
    if (!cached) return
    mountCanvas(holder.current, cached)
    mounted.current = mountKey
    setState('ready')
  }, [visible, mountKey, pdf.uid, pageNumber, rounded, rotation])
  const scrollRoot = useRef<HTMLElement | null>(null)
  if (!scrollRoot.current && typeof document !== 'undefined') {
    scrollRoot.current = boxRef.current?.closest('.reader-scroll, .reader-page-area') ?? null
  }

  useEffect(() => {
    if (!lazy || visible) return
    // 观察页面外框而不是画布宿主：宿主是 display:contents，没有盒子，观察者永远不触发
    const node = boxRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { root: scrollRoot.current, rootMargin: '600px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [lazy, visible])

  useEffect(() => {
    if (!visible || mounted.current === mountKey) return
    let cancelled = false
    void (async () => {
      try {
        // 残影是此刻屏幕上唯一可见的画面，优先级最高；当前页其次，预取页排最后
        const source = await pageCanvas(pdf.doc, pdf.uid, pageNumber, rounded, rotation, ghost ? 45 : priority)
        if (cancelled || !holder.current) return
        mountCanvas(holder.current, source)
        mounted.current = mountKey
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber, rounded, rotation, visible, ghost, priority, mountKey])

  /* 只有连续滚动模式需要把当前页滚进视野；逐页模式下这一句会在翻页瞬间
     把舞台滚动条挪一两像素，看上去就是「页面抖一下」 */
  useEffect(() => {
    if (!active || !onJump) return
    holder.current?.parentElement?.scrollIntoView({ block: 'nearest' })
  }, [active, onJump])

  return (
    <div
      ref={boxRef}
      className={cn('mw-page', active && 'is-active', ghost && 'is-ghost', state === 'loading' && 'is-loading', state === 'error' && 'is-error')}
      style={{ width: box.width, height: box.height }}
      onClick={() => onJump?.(pageNumber)}
    >
      {/* 画布由 pdf.js 直接挂到这个宿主节点上：React 不往里面渲染任何东西，避免两方争抢同一批子节点 */}
      <div ref={holder} className="mw-page-host" />
      <span className="mw-page-no">{pageNumber}</span>
      {state === 'loading' ? (
        <span className="mw-page-spin">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : null}
      {state === 'error' ? <span className="mw-page-error">这一页画不出来</span> : null}
    </div>
  )
}

/* ==================== 排版舞台（网页 / EPUB 的自包含 HTML） ==================== */
function RichStage(props: {
  html: string
  page: number
  zoom: number
  layout: StageLayout
  turning: { from: number; to: number; dir: 1 | -1 } | null
  onPageCount: (count: number) => void
  onActivePage: (page: number) => void
  onWheelZoom: (factor: number) => void
}): JSX.Element {
  const { html, page, zoom, layout, turning, onPageCount, onActivePage, onWheelZoom } = props
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  /** 程序滚动之后短暂忽略滚动回报，避免「滚到第几页」和「第几页滚过去」互相打架 */
  const ignoreScrollUntil = useRef(0)

  // 内容侧缩放：像浏览器缩放一样重排，一页 = 一屏高度
  useEffect(() => {
    if (!ready) return
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc) return
    doc.documentElement.style.zoom = String(zoom)
    const measure = (): void => {
      const screen = frame.clientHeight / Math.max(0.2, zoom)
      const view = doc.documentElement.scrollHeight
      if (!screen || !isFinite(screen) || !view) return
      onPageCount(Math.min(20000, Math.max(1, Math.ceil(view / screen))))
    }
    measure()
    const timer = window.setInterval(measure, 1500)
    // iframe 会自己吃掉滚轮事件，Ctrl+滚轮 要进到文档里监听才能拦下浏览器缩放
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onWheelZoom(Math.exp(-event.deltaY * 0.0022))
    }
    const onScroll = (): void => {
      if (layout !== 'continuous') return
      if (Date.now() < ignoreScrollUntil.current) return
      const screen = frame.clientHeight / Math.max(0.2, zoom)
      const current = Math.min(20000, Math.max(1, Math.floor(doc.documentElement.scrollTop / Math.max(1, screen)) + 1))
      onActivePage(current)
    }
    doc.addEventListener('wheel', onWheel, { passive: false })
    doc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearInterval(timer)
      doc.removeEventListener('wheel', onWheel)
      doc.removeEventListener('scroll', onScroll)
    }
  }, [ready, zoom, layout, onPageCount, onActivePage, onWheelZoom])

  // 翻页 = 把 iframe 滚到对应位置（保持原版式，不做二次排版）
  useEffect(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc || !ready) return
    try {
      ignoreScrollUntil.current = Date.now() + 400
      const top = ((page - 1) * frame.clientHeight) / zoom
      doc.defaultView?.scrollTo({ top, behavior: turning ? 'auto' : 'smooth' })
    } catch {
      /* 忽略 */
    }
  }, [page, zoom, ready, turning])

  if (html === '') {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">这份资料的排版文件读不到了</div>
  }

  return (
    <div className="reader-page-area relative flex h-full items-center justify-center overflow-hidden px-6 py-5">
      <div className={cn('mw-book mw-book-fill', turning && 'is-turning', turning?.dir === -1 && 'is-reverse')}>
        <div className="mw-layer mw-layer-in" key={`rich-${page}`}>
          <div className="mw-page mw-page-rich">
            <iframe
              ref={frameRef}
              title="rich-view"
              className="h-full w-full border-0 bg-white"
              sandbox="allow-same-origin"
              srcDoc={html}
              onLoad={() => setReady(true)}
            />
            <span className="mw-page-no">{page}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ==================== 文本舞台（可编辑） ==================== */
function TextStage(props: {
  text: string
  editing: boolean
  onEdit: (value: string) => void
  fontSize: number
  readonly: boolean
}): JSX.Element {
  const { text, editing, onEdit, fontSize, readonly } = props
  const isPlain = !/[#*`>|-]{1}/.test(text.slice(0, 200)) && !/^#{1,6}\s/m.test(text)
  return (
    <div className="reader-scroll h-full overflow-auto px-6 py-8">
      <article className="reader-text mx-auto max-w-[46rem]" style={{ fontSize: `${fontSize}px` }}>
        {editing ? (
          <textarea
            value={text}
            onChange={(event) => onEdit(event.target.value)}
            className="field-base min-h-[70vh] w-full resize-y font-mono text-sm leading-relaxed"
            spellCheck={false}
          />
        ) : isPlain ? (
          <pre className="whitespace-pre-wrap break-words font-body leading-[1.85]">{text}</pre>
        ) : (
          <div className="md-body leading-[1.85]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {readonly && !editing ? (
          <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
            这份资料是只读的（导入时按原版式保存）。想要做笔记，用右上角的「写注释」，它会像批注一样跟着页码存进这本书。
          </p>
        ) : null}
      </article>
    </div>
  )
}
/* ==================== 右侧面板：目录 / 缩略图 / 书签重点 / 注释 / 查找 / 本页文字 ==================== */
const PANEL_TABS: { key: PanelTab; label: string }[] = [
  { key: 'outline', label: '目录' },
  { key: 'thumbs', label: '页面' },
  { key: 'marks', label: '书签' },
  { key: 'notes', label: '注释' },
  { key: 'find', label: '查找' },
  { key: 'page-text', label: '本页' }
]

function ReaderPanel(props: {
  tab: PanelTab
  onTab: (tab: PanelTab | null) => void
  info: NoteDocInfo
  pdf: PdfDocInfo | null
  page: number
  pageCount: number
  marks: NoteMark[]
  onClose: () => void
  onJump: (page: number) => void
  onRemoveMark: (id: number) => void
  onAddMark: (kind: NoteMarkKind) => void
  onCompose: (quote: string) => void
}): JSX.Element {
  const { tab, onTab, info, pdf, page, pageCount, marks, onClose, onJump, onRemoveMark, onAddMark, onCompose } = props
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ page: number; snippet: string }[]>([])
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState('')
  const [thumbLimit, setThumbLimit] = useState(60)
  const [headings, setHeadings] = useState<{ title: string; page: number }[]>([])

  // 目录：PDF 用书签；HTML 解析标题；文本用 Markdown 标题
  useEffect(() => {
    if (pdf) {
      if (pdf.outline.length > 0) setHeadings(pdf.outline.filter((item) => item.title).map((item) => ({ title: item.title, page: item.page })))
      else setHeadings([])
      return
    }
    if (info.viewMode === 'rich' && info.html) {
      const doc = new DOMParser().parseFromString(info.html, 'text/html')
      const frameHeight = Math.max(1, window.innerHeight - 160)
      const list: { title: string; page: number }[] = []
      doc.querySelectorAll('h1, h2, h3').forEach((node) => {
        const title = (node.textContent ?? '').trim()
        if (title === '') return
        let top = 0
        let current: HTMLElement | null = node as HTMLElement
        while (current) {
          top += current.offsetTop
          current = current.offsetParent as HTMLElement | null
        }
        list.push({ title, page: Math.max(1, Math.ceil((top + 1) / frameHeight)) })
      })
      setHeadings(list)
      return
    }
    const list = [...info.text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => ({ title: match[1].trim(), page: 0 }))
    setHeadings(list)
  }, [pdf, info])

  // 本页文字：书页模式抽当页文本，供查找、摘录与朗读
  useEffect(() => {
    let cancelled = false
    if (!pdf) {
      setFound('')
      return
    }
    void (async () => {
      try {
        const target = await pdf.doc.getPage(Math.min(page, pdf.pageCount))
        const text = await pageText(target)
        if (!cancelled) setFound(text)
      } catch {
        if (!cancelled) setFound('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, page])

  const runFind = async (): Promise<void> => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return
    if (pdf) {
      setFinding(true)
      const results: { page: number; snippet: string }[] = []
      for (let number = 1; number <= pdf.pageCount && results.length < 200; number += 1) {
        try {
          const target = await pdf.doc.getPage(number)
          const text = await pageText(target)
          const index = text.toLowerCase().indexOf(needle)
          if (index >= 0) {
            results.push({ page: number, snippet: text.slice(Math.max(0, index - 26), index + needle.length + 46) })
          }
        } catch {
          /* 单页失败不影响整体 */
        }
      }
      setHits(results)
      setFinding(false)
      return
    }
    if (info.viewMode === 'rich') {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="rich-view"]')
      frame?.contentWindow?.focus()
      ;(frame?.contentWindow as unknown as { find?: (term: string) => boolean } | undefined)?.find?.(query)
      return
    }
    ;(window as unknown as { find?: (term: string) => boolean }).find?.(query)
  }

  const jumpToHeading = (title: string, target: number): void => {
    if (info.viewMode === 'text') {
      const node = [...document.querySelectorAll('.reader-text h1, .reader-text h2, .reader-text h3, .reader-text h4')].find(
        (item) => (item.textContent ?? '').trim() === title
      )
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    onJump(target || 1)
  }

  const bookmarks = marks.filter((mark) => mark.kind !== 'note')
  const notes = marks.filter((mark) => mark.kind === 'note')
  const tabs = PANEL_TABS.filter((item) => item.key !== 'thumbs' || !!pdf).filter(
    (item) => item.key !== 'page-text' || !!pdf
  )

  return (
    <aside className="reader-panel flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onTab(item.key)}
            className={cn(
              'whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] transition-colors',
              tab === item.key ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </button>
        ))}
        <IconButton label="关闭面板" className="ml-auto" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'outline' ? (
          headings.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">这份资料没有目录，用「页面」缩略图跳转更快。</p>
          ) : (
            <ul className="space-y-0.5">
              {headings.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <button
                    type="button"
                    onClick={() => jumpToHeading(item.title, item.page)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                      page === item.page && 'bg-muted text-foreground'
                    )}
                  >
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.page > 0 ? <span className="shrink-0 tabular-nums text-muted-foreground">{item.page}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === 'thumbs' && pdf ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: Math.min(thumbLimit, pdf.pageCount) }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => onJump(number)}
                className={cn(
                  'rounded-lg border p-1 transition-colors',
                  number === page ? 'border-primary' : 'border-border hover:border-muted-foreground/60'
                )}
              >
                <span
                  className="block overflow-hidden rounded bg-white"
                  style={{ height: Math.round((116 * pdf.baseHeight) / pdf.baseWidth) }}
                >
                  <PdfPageView pdf={pdf} pageNumber={number} scale={116 / pdf.baseWidth} rotation={0} lazy priority={2} />
                </span>
                <span className="mt-1 block text-center text-[10px] tabular-nums text-muted-foreground">{number}</span>
              </button>
            ))}
            {thumbLimit < pdf.pageCount ? (
              <button
                type="button"
                onClick={() => setThumbLimit((value) => value + 120)}
                className="col-span-2 rounded-lg border border-dashed border-border px-2 py-3 text-[11px] text-muted-foreground hover:text-foreground"
              >
                还有 {pdf.pageCount - thumbLimit} 页，点击继续加载缩略图
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === 'marks' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onAddMark('bookmark')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="h-3.5 w-3.5" />
              把第 {page} 页加书签（B）
            </button>
            {bookmarks.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">还没有书签与重点页。</p>
            ) : (
              bookmarks.map((mark) => (
                <MarkRow key={mark.id} mark={mark} onJump={onJump} onRemove={onRemoveMark} />
              ))
            )}
          </div>
        ) : null}

        {tab === 'notes' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onCompose('')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <NotebookPen className="h-3.5 w-3.5" />
              给第 {page} 页写注释（E）
            </button>
            {notes.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">还没有注释。选中页面文字后写下的注释会带着原文一起存。</p>
            ) : (
              notes.map((mark) => <MarkRow key={mark.id} mark={mark} onJump={onJump} onRemove={onRemoveMark} />)
            )}
          </div>
        ) : null}

        {tab === 'find' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runFind()
                }}
                placeholder="查找文中的一个词"
                className="field-base h-8 flex-1 text-xs"
              />
              <Button size="sm" loading={finding} onClick={() => void runFind()}>
                查找
              </Button>
            </div>
            {pdf ? (
              <p className="text-[11px] text-muted-foreground">
                {finding ? '正在逐页检索…' : hits.length > 0 ? `找到 ${hits.length} 页有这个词` : '回车或点「查找」，会逐页检索全文'}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">文本与排版模式用浏览器自带的页内查找，命中处会直接高亮。</p>
            )}
            {hits.map((hit) => (
              <button
                key={hit.page}
                type="button"
                onClick={() => onJump(hit.page)}
                className="block w-full rounded-lg border border-border px-2 py-1.5 text-left text-[11px] hover:border-primary/50"
              >
                <span className="font-medium text-foreground">第 {hit.page} 页</span>
                <span className="mt-0.5 block truncate text-muted-foreground">{hit.snippet}</span>
              </button>
            ))}
          </div>
        ) : null}

        {tab === 'page-text' && pdf ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">这一页的文字（可选中后引用去写注释）</p>
            <button
              type="button"
              onClick={() => onCompose(window.getSelection()?.toString().trim() ?? '')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Highlighter className="h-3.5 w-3.5" />
              引用所选写注释
            </button>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
              {found === '' ? '这一页没有可提取的文字（可能是扫描版或纯图片页）' : found}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{page}</span> / <span className="tabular-nums">{pageCount}</span> 页 ·
        {marks.length} 条标记
      </div>
    </aside>
  )
}

function MarkRow(props: {
  mark: NoteMark
  onJump: (page: number) => void
  onRemove: (id: number) => void
}): JSX.Element {
  const { mark, onJump, onRemove } = props
  const Icon = mark.kind === 'star' ? Star : mark.kind === 'bookmark' ? Bookmark : NotebookPen
  return (
    <div className="group rounded-lg border border-border px-2 py-1.5">
      <button type="button" onClick={() => onJump(mark.page || 1)} className="flex w-full items-start gap-2 text-left">
        <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', mark.kind === 'star' ? 'fill-current text-tint-warning' : 'text-tint-primary')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-foreground">
            {mark.page > 0 ? `第 ${mark.page} 页` : '正文'}
            {mark.label ? ` · ${mark.label}` : ''}
          </span>
          {mark.quote ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">「{mark.quote}」</span> : null}
          {mark.body ? <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground">{mark.body}</span> : null}
          <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{formatDateTime(mark.createdAt)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onRemove(mark.id)}
        className="mt-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        删除
      </button>
    </div>
  )
}

/* ==================== 注释编辑器 ==================== */
function MarkComposer(props: {
  page: number
  initialQuote: string
  currentQuote: () => Promise<string>
  onCancel: () => void
  onSave: (body: string, quote: string) => void
}): JSX.Element {
  const { page, initialQuote, currentQuote, onCancel, onSave } = props
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState(initialQuote)

  useEffect(() => {
    if (initialQuote !== '') return
    void currentQuote().then((text) => setQuote((value) => (value === '' ? text : value)))
  }, [initialQuote, currentQuote])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6" onMouseDown={onCancel}>
      <div
        className="glass-card w-full max-w-lg p-4"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="section-title text-sm font-semibold text-foreground">给第 {page} 页写注释</p>
        {quote !== '' ? (
          <blockquote className="mt-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {quote}
          </blockquote>
        ) : null}
        <textarea
          autoFocus
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="写下你的想法、疑问或总结…"
          className="field-base mt-3 min-h-[140px] w-full resize-y text-sm leading-relaxed"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" disabled={body.trim() === ''} onClick={() => onSave(body.trim(), quote)}>
            保存注释
          </Button>
        </div>
      </div>
    </div>
  )
}