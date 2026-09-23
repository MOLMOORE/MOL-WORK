import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
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
  Mouse,
  RotateCw,
  Scissors,
  GitCompare,
  Images,
  LayoutGrid,
  MoveHorizontal,
  Layers,
  RotateCcw,
  Star,
  ArrowUpToLine,
  ArrowDownToLine,
  Trash2,
  Type,
  CircleDashed,
  StickyNote,
  X
} from 'lucide-react'
import { TEXTUAL_DOC_FORMATS } from '@shared/constants'
import type { Note, NoteDocInfo, NoteMark, NoteMarkKind, NoteViewMode } from '@shared/types/domain'
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
import { blockEscapeFullscreen } from '../lib/escape'
import { cn, formatDateTime } from '../lib/utils'

/** 翻页动效：直切 / 淡入淡出 / 推移 / 覆盖 / 仿真翻书 */
type FlipEffect = 'none' | 'fade' | 'slide' | 'cover' | 'book'
/** 页面摆放：单页 / 双页 / 连续滚动 */
type StageLayout = 'single' | 'double' | 'continuous'
/** 缩放基准：适应宽度 / 适应整页 / 实际大小 */
type FitMode = 'width' | 'page' | 'actual'
type PanelTab = 'outline' | 'thumbs' | 'notes' | 'find' | 'page-text'

const FLIP_LABELS: { key: FlipEffect; label: string }[] = [
  { key: 'none', label: '直切' },
  { key: 'fade', label: '淡入' },
  { key: 'slide', label: '推移' },
  { key: 'cover', label: '覆盖' },
  { key: 'book', label: '翻书' }
]

/** 阅读字体（文本 / 排版模式）：auto = 不改文档与界面自带的字体 */
const READER_FONTS: { key: string; label: string; stack: string }[] = [
  { key: 'auto', label: '跟随原文', stack: '' },
  { key: 'hei', label: '黑体', stack: "'Microsoft YaHei', 'PingFang SC', 'Heiti SC', 'Noto Sans CJK SC', sans-serif" },
  { key: 'song', label: '宋体', stack: "'Songti SC', 'Noto Serif CJK SC', SimSun, Georgia, serif" },
  { key: 'kai', label: '楷体', stack: "Kaiti SC, KaiTi, 'TW-Kai', STKaiti, serif" },
  { key: 'fang', label: '仿宋', stack: "FangSong, STFangsong, 'Songti SC', serif" },
  { key: 'round', label: '圆体', stack: "Yuanti SC, 'Microsoft YaHei Round', 'PingFang SC', sans-serif" },
  { key: 'sans', label: '无衬线西文', stack: "Inter, 'Segoe UI', system-ui, sans-serif" },
  { key: 'serif', label: '衬线西文', stack: "Georgia, 'Times New Roman', serif" },
  { key: 'mono', label: '等宽', stack: "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace" }
]
/**
 * 阅读方式按格式分两类（用户 2026-09-23 指定）：
 * - PDF / PPT / Excel：版式本身就是内容，只走书页，整页放大缩小，不碰字体；
 * - Word 家族：正文在导入时已经抽进库里，默认按「文字」读，字体、字号、页面缩放都能调，
 *   要核对原版式再手动切回「书页」。
 * 判据放在渲染层：主进程 readNoteDoc() 只要看到 PDF 渲染件就回 pages，
 * 这样老资料不用重新导入也能立刻按文字读。
 */
function prefersTextView(doc: NoteDocInfo): boolean {
  return doc.viewMode === 'pages' && TEXTUAL_DOC_FORMATS.includes((doc.sourceFormat ?? '').toUpperCase()) && doc.text.trim() !== ''
}

const FONT_KEY = 'workstation.reader.font.v1'
const FONTSIZE_KEY = 'workstation.reader.fontsize.v1'

/** 翻页动效时长，与 CSS 里五种动效的 380ms 完全一致：残影在动画收尾之后才卸载 */
const TURN_MS = 380
/** 并排对比最多几页 / 一次最多提取多少页 */
const MAX_COMPARE = 4

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
  const [panel, setPanel] = useState<PanelTab | null>('thumbs')
  const [marks, setMarks] = useState<NoteMark[]>([])
  const [readMinutes, setReadMinutes] = useState(0)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(FONTSIZE_KEY)) || 17)
  /** 文本 / 排版模式的正文字体，选一次就一直记住 */
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem(FONT_KEY) || 'auto')
  const fontStack = READER_FONTS.find((item) => item.key === fontFamily)?.stack ?? ''
  /** 原版式文档要不要按「文字」读（Word 家族默认要，PDF / PPT 没有这一项） */
  const [textView, setTextView] = useState(false)
  const canTextView = !!info && prefersTextView(info)
  /** 舞台实际采用的阅读方式：下面所有逻辑都读这个，不再直接读 info.viewMode */
  const mode: NoteViewMode = canTextView && textView ? 'text' : info?.viewMode ?? 'text'
  useEffect(() => {
    if (!canTextView) setTextView(false)
  }, [canTextView])
  /** 文字视图不再现场抽全文：只读库里已有的正文，秒开、也不会卡在「正在准备…」 */
  /** 文字模式也先给一张纸：布局不是「连续」时，正文就按纸张边界排成一栏一页 */
  const pagedText = mode === 'text' && layout !== 'continuous'
  /** 到底有没有「页」这个概念：书页与分页后的文字页都算，只有排版之外的连续滚动不算 */
  const hasPages = mode !== 'text' || pagedText
  /** 切到文字视图后「页面 / 本页」这两个书页专属标签就没内容了，顺手挪到注释 */
  useEffect(() => {
    if (mode !== 'text') return
    setPanel((current) => (current === 'thumbs' || current === 'page-text' ? 'notes' : current))
  }, [mode])
  /** 从「文字」切回「书页」：页数要交还给 PDF，否则文字页量出来的页数会把书页卡在 1 页翻不动 */
  useEffect(() => {
    if (mode === 'pages' && pdf) setPageCount(pdf.pageCount)
  }, [mode, pdf])

  useEffect(() => {
    localStorage.setItem(FONTSIZE_KEY, String(fontSize))
  }, [fontSize])
  useEffect(() => {
    localStorage.setItem(FONT_KEY, fontFamily)
  }, [fontFamily])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [turning, setTurning] = useState<{ from: number; to: number; dir: 1 | -1 } | null>(null)
  const [composer, setComposer] = useState<{
    kind: NoteMarkKind
    quote: string
    /** 圈画区域（归一化轨迹的 JSON），只对书页有效 */
    region?: string
    /** 双页时圈的可能不是当前页，按真正那一页存 */
    atPage?: number
  } | null>(null)
  /** 圈注模式：在当前这一页上按住拖动圈出一块，松手就写批注 */
  const [inkMode, setInkMode] = useState(false)
  /** 两个显示开关各管各的：纸上的圈画、边上与上下空白的批注 */
  const [showInk, setShowInk] = useState(() => localStorage.getItem(SHOW_INK_KEY) !== '0')
  const [showNotes, setShowNotes] = useState(() => localStorage.getItem(SHOW_NOTES_KEY) !== '0')
  /** 圈注形状：自由 / 矩形 / 圆圈 / 多边形，选一次记住 */
  const [inkShape, setInkShape] = useState<InkShape>(() => {
    const saved = localStorage.getItem(INK_SHAPE_KEY)
    return saved !== null && INK_SHAPES.includes(saved as InkShape) ? (saved as InkShape) : 'free'
  })
  /** 滚轮滚到页面边缘要不要翻页 */
  const [wheelFlip, setWheelFlip] = useState(() => localStorage.getItem(WHEEL_FLIP_KEY) !== '0')
  /** 文字页的纸张边界：null = 跟着舞台自适应；拖过纸边之后记住用户自己定的尺寸 */
  const [txPage, setTxPage] = useState<{ width: number; height: number } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TX_PAGE_KEY) ?? '') as { width?: unknown; height?: unknown }
      const width = Number(saved.width)
      const height = Number(saved.height)
      return width >= TX_MIN_W && height >= TX_MIN_H ? { width, height } : null
    } catch {
      return null
    }
  })
  /** 就地展开着的那条批注（note_marks.id）：贴着它圈住的位置显示气泡 */
  const [openNote, setOpenNote] = useState<number | null>(null)

  useEffect(() => {
    localStorage.setItem(SHOW_INK_KEY, showInk ? '1' : '0')
  }, [showInk])
  useEffect(() => {
    localStorage.setItem(SHOW_NOTES_KEY, showNotes ? '1' : '0')
  }, [showNotes])
  useEffect(() => {
    localStorage.setItem(INK_SHAPE_KEY, inkShape)
  }, [inkShape])
  useEffect(() => {
    localStorage.setItem(WHEEL_FLIP_KEY, wheelFlip ? '1' : '0')
  }, [wheelFlip])
  useEffect(() => {
    if (txPage === null) localStorage.removeItem(TX_PAGE_KEY)
    else localStorage.setItem(TX_PAGE_KEY, JSON.stringify(txPage))
  }, [txPage])
  /** 气泡是贴着某一页的圈画定位的：翻页、换书、退出书页模式就收起 */
  useEffect(() => {
    setOpenNote(null)
  }, [page, id, mode])
  /** 页面对比：挑出来并排看的页码（最多 4 页） */
  const [compare, setCompare] = useState<number[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  /** 页面提取：勾出来拼成新文档的页码 */
  const [extractOpen, setExtractOpen] = useState(false)
  /** 舞台就地提示：翻到头了、提取好了（阅读界面不套应用外壳，没有全局 Toaster） */
  const [hint, setHint] = useState('')
  const hintTimer = useRef<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const progressTimer = useRef<number | null>(null)
  const turnTimer = useRef<number | null>(null)
  /** pageRef 是「要去的那一页」，shownRef 是「屏幕上已经画出来的那一页」：
      连点翻页时动画必须从真正显示着的页开始，否则残影会跳一页 */
  const pageRef = useRef(1)
  const shownRef = useRef(1)
  const turnToken = useRef(0)
  const pendingTurn = useRef<{ from: number; to: number; dir: 1 | -1 } | null>(null)
  const pageCountRef = useRef(1)
  const flipRef = useRef<FlipEffect>('book')
  const pdfRef = useRef<PdfDocInfo | null>(null)
  const rotationRef = useRef(0)
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const anchor = useRef<{ x: number; y: number; r: number; cx: number; cy: number } | null>(null)
  const wheelAcc = useRef(0)
  const scaleRef = useRef(1)
  const layoutRef = useRef<StageLayout>('single')
  const stepRef = useRef<(delta: number) => void>(() => undefined)

  /** 一张纸最多就是一屏：再大既看不到整页，也会把整篇正文挤成「一页」，翻页按键形同虚设 */
  const txLimit = useMemo(
    () => ({
      width: Math.max(TX_MIN_W, Math.min(TX_MAX_W, stageSize.width - 24)),
      height: Math.max(TX_MIN_H, Math.min(TX_MAX_H, stageSize.height - 24))
    }),
    [stageSize]
  )
  /** 文字页的纸张尺寸（未缩放）：双页时这是一张纸的宽，里面排两栏 */
  const txSheet = useMemo(() => {
    const capW = Math.min(layout === 'double' ? 1500 : 980, txLimit.width)
    if (txPage !== null)
      return { width: Math.min(txPage.width, capW), height: Math.min(txPage.height, txLimit.height) }
    return { width: capW, height: Math.max(TX_MIN_H, txLimit.height - 16) }
  }, [txPage, layout, txLimit])
  /** 拖过纸边就固定下来（一屏封顶），Ctrl+0 复位时再交回给舞台 */
  const resizeTxSheet = useCallback(
    (width: number, height: number) => {
      setTxPage({
        width: Math.round(Math.min(width, txLimit.width)),
        height: Math.round(Math.min(height, txLimit.height))
      })
    },
    [txLimit]
  )

  /** 就地提示一条，1.6s 后自己消失；连着按方向键时不重复刷屏 */
  const showHint = useCallback((message: string) => {
    if (hintTimer.current) window.clearTimeout(hintTimer.current)
    setHint(message)
    hintTimer.current = window.setTimeout(() => {
      hintTimer.current = null
      setHint('')
    }, 1600)
  }, [])

  /** 直接跳到某一页（换书、读进度时），不带动效 */
  const resetPage = useCallback((next: number) => {
    turnToken.current += 1
    pendingTurn.current = null
    if (turnTimer.current) window.clearTimeout(turnTimer.current)
    turnTimer.current = null
    pageRef.current = next
    shownRef.current = next
    setTurning(null)
    setPage(next)
  }, [])

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
        setTextView(prefersTextView(doc))
        resetPage(Math.max(1, doc.note.lastPage || 1))
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
          resetPage(1)
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
  }, [id, resetPage])

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

  // ---------- 翻页动画：先把目标页画好，再启动动效 ----------
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  /** 这一「屏」包含哪几页：双页是左右两页 */
  const spreadOf = useCallback((target: number): number[] => {
    const total = Math.max(1, pageCountRef.current)
    if (layoutRef.current === 'double') return [target, target + 1].filter((n) => n >= 1 && n <= total)
    return [target]
  }, [])

  /**
   * 闪动的根因：新页还没画完，动画已经开跑了，于是先看到一张白纸再「蹦」出内容。
   * 所以动效启动前先把这一屏要用的画布要到手（命中缓存就是同步返回，几乎不耗时），
   * 最迟 900ms 也必须落地，不至于卡住不动。
   */
  const warmPages = useCallback((pages: number[]): Promise<void> => {
    const doc = pdfRef.current
    if (!doc) return Promise.resolve()
    const scaleNow = scaleRef.current
    const rotationNow = rotationRef.current
    const jobs = pages.map((number) =>
      pageCanvas(doc.doc, doc.uid, number, scaleNow, rotationNow, 80)
        .then(() => undefined)
        .catch(() => undefined)
    )
    return Promise.race([
      Promise.all(jobs).then(() => undefined),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 900)
      })
    ])
  }, [])

  /** 落地一次翻页：turn 为 null 就是不动效、直接切 */
  const applyTurn = useCallback((turn: { from: number; to: number; dir: 1 | -1 } | null) => {
    if (turn && pendingTurn.current !== turn) return
    pendingTurn.current = null
    if (turnTimer.current) {
      window.clearTimeout(turnTimer.current)
      turnTimer.current = null
    }
    const target = turn ? turn.to : pageRef.current
    shownRef.current = target
    setPage(target)
    if (!turn) {
      setTurning(null)
      return
    }
    setTurning(turn)
    turnTimer.current = window.setTimeout(() => {
      turnTimer.current = null
      setTurning(null)
    }, TURN_MS)
  }, [])

  const goPage = useCallback(
    (next: number, dir?: 1 | -1) => {
      const total = Math.max(1, pageCountRef.current)
      const target = Math.min(Math.max(1, Math.round(next)), total)
      const current = pageRef.current
      if (target === current) return
      const direction = dir ?? (target > current ? 1 : -1)
      pageRef.current = target
      const from = shownRef.current
      const stride = layoutRef.current === 'double' ? 2 : 1
      const animate =
        flipRef.current !== 'none' &&
        layoutRef.current !== 'continuous' &&
        Math.abs(target - from) === stride
      if (!animate) {
        turnToken.current += 1
        applyTurn(null)
        return
      }
      const turn = { from, to: target, dir: direction }
      const token = (turnToken.current += 1)
      pendingTurn.current = turn
      void warmPages([...spreadOf(from), ...spreadOf(target)]).then(() => {
        if (turnToken.current === token) applyTurn(turn)
      })
    },
    [applyTurn, spreadOf, warmPages]
  )

  /** 往前 / 往后翻一格；已经到头了就原地提示一声，不再空转 */
  const step = useCallback(
    (delta: number) => {
      const total = Math.max(1, pageCountRef.current)
      const current = pageRef.current
      if (delta > 0 && current >= total) {
        showHint('已到最后一页')
        return
      }
      if (delta < 0 && current <= 1) {
        showHint('已在第一页')
        return
      }
      const stride = layoutRef.current === 'double' ? 2 : 1
      goPage(current + delta * stride, delta > 0 ? 1 : -1)
    },
    [goPage, showHint]
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
    if (!info || !hasPages) return
    if (progressTimer.current) window.clearTimeout(progressTimer.current)
    progressTimer.current = window.setTimeout(() => {
      void api.note.progress(id, page, pageCount)
    }, 900)
    return () => {
      if (progressTimer.current) window.clearTimeout(progressTimer.current)
    }
  }, [id, page, pageCount, info, hasPages])

  // ---------- 快捷键：与主流阅读器对齐（Ctrl+滚轮 / Ctrl+- 缩放，方向键与空格翻页，F 全屏） ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) {
        if (event.key === 'Escape') (target as HTMLElement).blur()
        return
      }
      /* 对比 / 提取浮层开着时，方向键与翻页快捷键先留给浮层，别在背后偷偷翻书 */
      if (compareOpen || extractOpen) return
      const ctrl = event.ctrlKey || event.metaKey
      const pages = mode === 'pages' || pagedText
      const scrolling = layout === 'continuous'
      /** 排版与连续文字没有「缩放基准」这一说，Ctrl+± 与 +／- 直接改内容缩放 */
      const contentZoom = info !== null && mode !== 'pages' && !pagedText

      if (ctrl) {
        switch (event.key) {
          case '=':
          case '+':
            event.preventDefault()
            if (contentZoom) handleWheelZoomRich(1.2)
            else zoomBy(1.2)
            return
          case '-':
          case '_':
            event.preventDefault()
            if (contentZoom) handleWheelZoomRich(1 / 1.2)
            else zoomBy(1 / 1.2)
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
          if (contentZoom) handleWheelZoomRich(1.2)
          else zoomBy(1.2)
          break
        case '-':
        case '_':
          event.preventDefault()
          if (contentZoom) handleWheelZoomRich(1 / 1.2)
          else zoomBy(1 / 1.2)
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
          if (openNote !== null) setOpenNote(null)
          else if (inkMode) setInkMode(false)
          else if (composer) setComposer(null)
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
  }, [step, goPage, pageCount, panel, composer, info, mode, pagedText, flip, navigate, page, marks, layout, fullscreen, compareOpen, extractOpen, inkMode, openNote])

  // ---------- 标记 ----------
  const toggleMark = async (kind: NoteMarkKind, atPage?: number): Promise<void> => {
    const target = hasPages ? atPage ?? page : 0
    const existing = marks.find((mark) => mark.kind === kind && mark.page === target)
    if (existing) {
      await api.note.removeMark(existing.id)
      setMarks((list) => list.filter((mark) => mark.id !== existing.id))
      return
    }
    const quote = kind === 'note' ? '' : await currentQuote(target)
    const created = await api.note.saveMark({
      noteId: id,
      kind,
      page: target,
      label: kind === 'bookmark' ? `第 ${target} 页书签` : `重点：第 ${target} 页`,
      quote
    })
    setMarks((list) => [...list, created])
  }

  const currentQuote = async (target?: number): Promise<string> => {
    const selection = window.getSelection()?.toString().trim() ?? ''
    if (selection !== '') return selection.slice(0, 400)
    if (pdf) {
      try {
        const p = await pdf.doc.getPage(Math.min(target ?? page, pdf.pageCount))
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
    const region = composer?.region ?? ''
    const target = composer?.atPage ?? page
    /** 连续滚动没有页号，标成「正文」，别写成「第 0 页」 */
    const stamp = hasPages && target > 0 ? '第 ' + target + ' 页' : '正文'
    const created = await api.note.saveMark({
      noteId: id,
      kind: 'note',
      page: hasPages ? target : 0,
      label:
        region === ''
          ? '注释：' + stamp
          : parseRange(region)
            ? '旁注：' + stamp
            : '圈注：' + stamp,
      quote,
      body,
      region
    })
    setMarks((list) => [...list, created])
    setComposer(null)
    /* 刚写完的这条立刻在旁边展开，确认它落在圈住的位置上 */
    setOpenNote(created.id)
  }

  /** 文字页排完把栏数交回来：一栏就是一页，和书页共用同一套页码 */
  const handleTextPageCount = useCallback(
    (count: number) => {
      const next = Math.max(1, count)
      setPageCount((current) => (current === next ? current : next))
      if (pageRef.current > next) resetPage(next)
    },
    [resetPage]
  )

  /** 正文里的行内标记：荧光高亮与「选中一段文字写的旁注」，偏移量对的是渲染后的正文 */
  const rangeMarks = useMemo<RangeMark[]>(() => {
    const list: RangeMark[] = []
    marks.forEach((mark) => {
      if (mark.kind !== 'highlight' && mark.kind !== 'note') return
      const range = parseRange(mark.region)
      if (!range) return
      list.push({ mark, start: range.start, end: range.end, quote: mark.quote, tone: mark.kind === 'highlight' ? 'hl' : 'note' })
    })
    return list
  }, [marks])

  /** 涂荧光笔：同一段再点一下就取消（按区间起止认人，重排也不会认错） */
  const addHighlight = useCallback(
    async (range: TextRange, quote: string) => {
      const region = JSON.stringify({ kind: 'range', start: range.start, end: range.end })
      const dup = marks.find((mark) => mark.kind === 'highlight' && mark.region === region)
      if (dup) {
        await api.note.removeMark(dup.id)
        setMarks((list) => list.filter((mark) => mark.id !== dup.id))
        showHint('已取消这段高亮')
        return
      }
      const target = hasPages ? pageRef.current : 0
      const created = await api.note.saveMark({
        noteId: id,
        kind: 'highlight',
        page: target,
        label: target > 0 ? '高亮：第 ' + target + ' 页' : '高亮：正文',
        quote: quote.slice(0, 600),
        region
      })
      setMarks((list) => [...list, created])
      showHint('已涂亮这一段：点一下标记可以看它的原文，再点一次取消')
    },
    [id, marks, showHint, hasPages]
  )

  /** 选中一段正文 → 在旁边写条注释：区间和引文一起带进注释框 */
  const annotateRange = useCallback((range: TextRange, quote: string) => {
    setOpenNote(null)
    setComposer({
      kind: 'note',
      quote: quote.slice(0, 600),
      region: JSON.stringify({ kind: 'range', start: range.start, end: range.end }),
      atPage: hasPages ? pageRef.current : 0
    })
  }, [hasPages])

  /** 圈完一块：形状与归一化轨迹一起带进注释框，写完才落库 */
  const handleInk = useCallback((shape: InkShape, points: InkPoint[], target: number) => {
    setOpenNote(null)
    setComposer({ kind: 'note', quote: '', region: JSON.stringify({ kind: shape, points }), atPage: target })
  }, [])

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
    /* 文字页的纸本来就是照着舞台尺寸定的，再套一层 PDF 适页倍率会让「拖边界」和看到的大小对不上 */
    if (!pdf || mode === 'text') return 1
    const pad = 44
    const w = Math.max(120, stageSize.width - pad)
    const h = Math.max(120, stageSize.height - pad)
    const box = pageSize(pdf.baseWidth, pdf.baseHeight, 1, rotation)
    const base = layout === 'double' ? box.width * 2 + 16 : box.width
    // 连续滚动时按宽度铺满，整页适配没有意义
    if (fit === 'width' || layout === 'continuous') return w / box.width
    if (fit === 'page') return Math.min(w / base, h / box.height)
    return SCREEN_SCALE
  }, [pdf, mode, stageSize, fit, layout, rotation])
  const scale = Math.max(0.1, Math.min(12, fitScale * zoom))
  scaleRef.current = scale
  pageCountRef.current = pageCount
  flipRef.current = flip
  pdfRef.current = pdf
  rotationRef.current = rotation
  const zoomPercent = info && mode !== 'pages' ? Math.round(zoom * 100) : Math.round((scale / SCREEN_SCALE) * 100)
  /** 只有内容真的比舞台大才需要拖动平移 */
  const canPan = (mode === 'pages' || pagedText) && (layout === 'continuous' || scale > fitScale + 0.002 || zoom > 1.001)
  /**
   * 点书页左右两侧翻页：放大（可拖动）状态下自动收起，
   * 否则拖动看细节时松手就跳页，会误触。
   */
  const canZoneFlip =
    info !== null && hasPages && layout !== 'continuous' && zoom <= 1.02 && !canPan && !inkMode

  /** 缩放入口：书页与分页后的文字页放大整张纸，排版模式与连续文字放大内容本身 */
  const stepZoom = (factor: number, clientX?: number, clientY?: number): void => {
    if (mode === 'pages' || pagedText) zoomBy(factor, clientX, clientY)
    else handleWheelZoomRich(factor)
  }

  /** 连续滚动时由舞台回报「现在看到第几页」 */
  const handleActivePage = useCallback(
    (next: number) => {
      const target = Math.min(Math.max(1, next), Math.max(1, pageCount))
      if (pageRef.current === target) return
      pageRef.current = target
      shownRef.current = target
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
    if (!node || !info || !hasPages) return
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const factor = Math.exp(-event.deltaY * 0.0022)
        if (mode === 'rich' || (mode === 'text' && layout === 'continuous'))
          setZoom((value) => Math.max(0.35, Math.min(6, value * factor)))
        else zoomBy(factor, event.clientX, event.clientY)
        wheelAcc.current = 0
        return
      }
      if (mode === 'rich') return
      /* 关掉滚轮翻页：滚轮只滚这一页，翻页交给 ←／→、两侧热区和上方按键（Ctrl+滚轮缩放不受影响） */
      if (!wheelFlip) return
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
  }, [info, layout, mode, hasPages, pagedText, wheelFlip, zoomBy])

  // ---------- 左键按住拖动：放大后随手平移页面 ----------
  const onPanDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const node = scrollRef.current
    if (!node || !info || !hasPages) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, select, textarea, iframe, [role="switch"], [role="button"]')) return
    /* 没放大到溢出就别抢左键；文字页的左键要留给选词与选中正文，否则根本圈不出选区 */
    if (!canPan) return
    if (pagedText && target?.closest('.tx-flow')) return
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

  // 侧栏、注释框、圈注模式、对比 / 提取浮层开着时，Esc 先关它们；再按一次才退出全屏
  useEffect(() => {
    if (!panel && !composer && !compareOpen && !extractOpen && !inkMode && openNote === null) return undefined
    return blockEscapeFullscreen()
  }, [panel, composer, compareOpen, extractOpen, inkMode, openNote])

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

  /** 只有 kind=note 才往纸面和边上画，书签与重点页另有去处 */
  const noteMarks = marks.filter((mark) => mark.kind === 'note')
  /** 这一张纸有多宽：书页按画布算，文字页按纸张边界 × 缩放算 */
  const pageBoxWidth =
    mode === 'pages' && pdf
      ? pageSize(pdf.baseWidth, pdf.baseHeight, scale, rotation).width
      : mode === 'text'
        ? txSheet.width * scale
        : 0
  /** 舞台左右还剩多少地方：放得下旁注就贴纸边，放不下（含双页）就落到纸的上下空白 */
  const noteSide =
    pageBoxWidth > 0 &&
    layout !== 'double' &&
    stageSize.width - pageBoxWidth > 2 * (NOTE_RAIL_W + 28)
  const marksOnPage = marks.filter((mark) => (hasPages ? page : 0) === mark.page)
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

  const modeLabel = mode === 'pages' ? '书页' : mode === 'rich' ? '排版' : '文本'
  /** 文字视图显示的就是入库正文（正在编辑时显示草稿）；书页与排版模式用不到它 */
  const textBody = info === null ? '' : editing ? draft : info.text

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
            {hasPages ? ` · 共 ${pageCount} 页` : ` · ${textBody.length} 字`}
            {info.readonly ? ' · 只读' : ' · 可编辑'}
            {marks.length > 0 ? ` · ${marks.length} 条笔记` : ''}
          </p>
        </div>

        {/* 页码：只有真的有「页」的时候才有（连续滚动的文字模式没有页可跳） */}
        {hasPages ? (
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
        ) : null}
        {/* 页面摆放：书页与文字页都是「单页 / 双页 / 连续」，切去「连续」也随时切得回来 */}
        <Segmented
          value={layout}
          title="页面摆放"
          options={[
            { key: 'single', label: '单页', icon: <Rows3 className="h-3.5 w-3.5" /> },
            { key: 'double', label: '双页', icon: <Columns2 className="h-3.5 w-3.5" /> },
            { key: 'continuous', label: '连续', icon: <List className="h-3.5 w-3.5" /> }
          ]}
          onChange={(key) => {
            const next = key as StageLayout
            setLayout(next)
            /* 一张纸放两页：从偶数页开始会把下一页挤到下一张纸上，切过去先对齐到奇数页 */
            if (next === 'double' && page % 2 === 0) goPage(page - 1)
          }}
        />
        {hasPages ? (
          <Segmented
            value={flip}
            title="翻页动效"
            options={FLIP_LABELS.map((item) => ({ key: item.key, label: item.label }))}
            onChange={(key) => setFlip(key as FlipEffect)}
          />
        ) : null}
        {(mode === 'pages' || pagedText) && layout !== 'continuous' ? (
          <ToggleChip
            on={wheelFlip}
            label="滚轮翻页"
            hint={
              wheelFlip
                ? '滚轮滚到页面边缘就翻页：点一下关掉可以防误触（Ctrl+滚轮缩放不受影响）'
                : '滚轮翻页已关闭：滚轮只滚动这一页，翻页用 ←／→、两侧点击或上方按键'
            }
            icon={<Mouse className="h-3.5 w-3.5" />}
            onClick={() => {
              const next = !wheelFlip
              setWheelFlip(next)
              showHint(next ? '已开启滚轮翻页：滚到页面边缘就翻页' : '已关闭滚轮翻页：滚轮只滚动当前页面')
            }}
          />
        ) : null}
        {/* 字号：文字模式不管分页还是连续都要能改（书页是画布，字号与它无关） */}
        {mode === 'text' ? (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5">
            <IconButton label="减小字号" onClick={() => setFontSize((value) => Math.max(12, value - 1))}>
              <span className="text-[10px] font-semibold">A−</span>
            </IconButton>
            <span className="w-8 text-center text-[11px] tabular-nums text-foreground">{fontSize}</span>
            <IconButton label="增大字号" onClick={() => setFontSize((value) => Math.min(30, value + 1))}>
              <span className="text-[13px] font-semibold">A+</span>
            </IconButton>
          </div>
        ) : null}
        {/* 缩放：三种模式共用这一个按键组，不再并排摆出两个一模一样的 */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5">
          <IconButton label="缩小（Ctrl+滚轮 / Ctrl+-）" onClick={() => stepZoom(1 / 1.2)}>
            <Minus className="h-3.5 w-3.5" />
          </IconButton>
          <button
            type="button"
            title={mode === 'pages' ? '恢复适页（Ctrl+0）' : pagedText ? '恢复适页（Ctrl+0）：页面边界也交还给窗口' : '恢复 100%（Ctrl+0）'}
            onClick={() => {
              if (mode === 'pages') {
                resetZoom()
                return
              }
              setZoom(1)
              if (pagedText) setTxPage(null)
            }}
            className="w-14 shrink-0 cursor-pointer text-center text-[11px] tabular-nums text-foreground hover:text-tint-primary"
          >
            {zoomPercent}%
          </button>
          <IconButton label="放大（Ctrl+滚轮 / Ctrl++）" onClick={() => stepZoom(1.2)}>
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {mode === 'pages' ? (
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
        {mode !== 'pages' ? (
          <>
            <label className="flex items-center gap-1 rounded-lg border border-border bg-input px-1.5 py-1">
              <Type className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <select
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value)}
                title="正文字体"
                className="max-w-[7rem] cursor-pointer bg-transparent text-[11px] text-foreground outline-none"
              >
                {READER_FONTS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <div className="flex items-center gap-1">
          {canTextView ? (
            <Segmented
              value={textView ? 'text' : 'pages'}
              title="阅读方式：书页按原版式整页放大，文字可以换字体与字号"
              options={[
                { key: 'pages', label: '书页' },
                { key: 'text', label: '文字' }
              ]}
              onChange={(key) => setTextView(key === 'text')}
            />
          ) : null}
          <IconButton label="书签（B）" onClick={() => void toggleMark('bookmark')}>
            {hasBookmark ? <BookmarkCheck className="h-4 w-4 text-tint-primary" /> : <Bookmark className="h-4 w-4" />}
          </IconButton>
          <IconButton label="标为重点页（S）" onClick={() => void toggleMark('star')}>
            <Star className={cn('h-4 w-4', hasStar && 'fill-current text-tint-warning')} />
          </IconButton>
          {/* 注释工具组：五项共用一个边框、同一套「图标 + 文字」按键，点亮的那项走主色 */}
          <div className="mw-toolgroup">
            <ToolButton
              on={composer !== null}
              label="注释"
              hint="给这一页写一条注释（E）"
              icon={<NotebookPen className="h-3.5 w-3.5" />}
              onClick={() => setComposer({ kind: 'note', quote: '' })}
            />
            {(mode === 'pages' && pdf !== null) || pagedText ? (
              <>
                <span className="mw-tool-sep" />
                <ToolButton
                  on={inkMode}
                  label="圈注"
                  hint={inkMode ? '当前形状：' + (INK_SHAPE_LABELS.find((item) => item.key === inkShape)?.label ?? '') + ' · 再点一下退出圈注（Esc 也可以）' : '在页面上圈出一块（可选形状），松手就能给它写批注'}
                  icon={<Highlighter className="h-3.5 w-3.5" />}
                  onClick={() =>
                    setInkMode((value) => {
                      const next = !value
                      showHint(next ? '圈注模式：在页面上按住拖动圈住要注释的部分，松手写批注（Esc 退出）' : '已退出圈注模式')
                      return next
                    })}
                />
                <span className="mw-tool-sep" />
                <ToolButton
                  on={showInk}
                  label="圈画"
                  hint="显示 / 隐藏画在纸上的圈画与涂亮的正文"
                  icon={<CircleDashed className="h-3.5 w-3.5" />}
                  onClick={() => setShowInk((value) => !value)}
                />
                <ToolButton
                  on={showNotes}
                  label="旁注"
                  hint="显示 / 隐藏贴在页面边上（或上下空白）的整页注释"
                  icon={<StickyNote className="h-3.5 w-3.5" />}
                  onClick={() => setShowNotes((value) => !value)}
                />
              </>
            ) : null}
          </div>
          {inkMode ? (
            <Segmented
              value={inkShape}
              title="圈注形状：这一笔用什么形状圈"
              options={INK_SHAPE_LABELS.map((item) => ({ key: item.key, label: item.label }))}
              onChange={(key) => setInkShape(key as InkShape)}
            />
          ) : null}
          <IconButton label="页内查找（Ctrl+F）" onClick={() => setPanel(panel === 'find' ? null : 'find')}>
            <Search className="h-4 w-4" />
          </IconButton>
          {mode === 'pages' && pdf ? (
            <>
              <IconButton
                label={compare.length >= 2 ? '页面对比（已选 ' + compare.length + ' 页）' : '页面对比：把任意几页并排放着比'}
                onClick={() => {
                  setCompare((list) => (list.includes(page) ? list : [...list, page].sort((a, b) => a - b).slice(0, MAX_COMPARE)))
                  setCompareOpen(true)
                }}
              >
                <GitCompare className={cn('h-4 w-4', compare.length >= 2 && 'text-tint-primary')} />
              </IconButton>
              <IconButton label="页面提取：把任意几页拼成一份新资料" onClick={() => setExtractOpen(true)}>
                <Scissors className="h-4 w-4" />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label={panel ? '收起侧栏' : '展开页面 / 目录 / 注释'}
            onClick={() => setPanel(panel ? null : 'thumbs')}
          >
            <List className="h-4 w-4" />
          </IconButton>
          <IconButton label={fullscreen ? '退出全屏（F）' : '全屏阅读（F）'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
          {mode === 'text' && !info.readonly && info.viewMode === 'text' ? (
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
            /* 点纸面空白处收起就地气泡（圈画、圆点、页顶按键与气泡自己都不往这儿冒泡） */
            onClick={() => setOpenNote(null)}
            onDoubleClick={() => {
              /* 圈注模式下双击是在画圈中途松手，不该顺手放大；
                 文字页的双击是用来选词的，也不放大 */
              if (mode !== 'pages' || inkMode) return
              if (zoom !== 1) resetZoom()
              else zoomBy(1.6)
            }}
          >
            {mode === 'pages' && pdf ? (
              <PdfStage
                pdf={pdf}
                page={page}
                pageCount={pageCount}
                scale={scale}
                rotation={rotation}
                layout={layout}
                turning={turning}
                notes={noteMarks}
                inkMode={inkMode}
                showInk={showInk}
                showNotes={showNotes}
                noteSide={noteSide}
                onInk={handleInk}
                inkShape={inkShape}
                openNoteId={openNote}
                onOpenNote={setOpenNote}
                onRemoveNote={(markId) => void removeMark(markId)}
                  onScrollNode={attachScrollNode}
                  onJump={goPage}
                onActivePage={handleActivePage}
              />
            ) : mode === 'rich' ? (
              <RichStage
                html={info.html ?? ''}
                page={page}
                zoom={zoom}
                fontFamily={fontStack}
                layout={layout}
                onPageCount={setPageCount}
                onActivePage={handleActivePage}
                onWheelZoom={handleWheelZoomRich}
              />
            ) : pagedText && !editing ? (
              <TextBook
                text={textBody}
                fontSize={fontSize}
                fontFamily={fontStack}
                sheet={txSheet}
                scale={scale}
                layout={layout}
                page={page}
                turning={turning}
                onPageCount={handleTextPageCount}
                onResize={resizeTxSheet}
                onScrollNode={attachScrollNode}
                notes={noteMarks}
                ranges={rangeMarks}
                onHighlight={(range, quote) => void addHighlight(range, quote)}
                onAnnotate={annotateRange}
                inkMode={inkMode}
                showInk={showInk}
                showNotes={showNotes}
                noteSide={noteSide}
                onInk={handleInk}
                inkShape={inkShape}
                openNoteId={openNote}
                onOpenNote={setOpenNote}
                onRemoveNote={(markId) => void removeMark(markId)}
              />
            ) : (
              <TextStage
                text={textBody}
                editing={editing}
                onEdit={setDraft}
                fontSize={fontSize}
                fontFamily={fontStack}
                zoom={zoom}
                readonly={info.readonly}
                onWheelZoom={handleWheelZoomRich}
                ranges={rangeMarks}
                showInk={showInk}
                onHighlight={(range, quote) => void addHighlight(range, quote)}
                onAnnotate={annotateRange}
                onRemoveNote={(markId) => void removeMark(markId)}
              />
            )}

            {/* 左右点击热区：点右边下一页、点左边上一页（放大后不可用） */}
            {canZoneFlip ? (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="上一页"
                  title="上一页（点左侧小按键，或按 ←）"
                  className="mw-pagezone mw-pagezone-left"
                  onClick={() => step(-1)}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <span>
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="下一页"
                  title="下一页（点右侧小按键，或按 →）"
                  className="mw-pagezone mw-pagezone-right"
                  onClick={() => step(1)}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </>
            ) : null}

            {/* 到头了 / 刚提取完，就地提示一声，不用弹全局气泡 */}
            {hint !== '' ? (
              <div className="reader-hint animate-fade-in">{hint}</div>
            ) : null}
          </div>

          {/* 底部状态条：页码进度与快捷键提示 */}
          <footer className="reader-foot flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {hasPages ? `第 ${page} / ${pageCount} 页` : '连续阅读 · 点上方「单页」即可分页'}
            </span>
            <span className="h-3 w-px bg-border" />
            <span>← → 翻页</span>
            <span>空格 下一页</span>
            <span>点两侧小按键翻页</span>
            <span>到头会提示</span>
            <span>Ctrl+滚轮 缩放</span>
            <span>放大后按住左键拖动</span>
            <span>B 书签</span>
            <span>S 重点</span>
            <span>E 注释</span>
            <span>圈注可选形状</span>
            <span>点圈看在旁边</span>
            {mode === 'text' ? <span>选中正文可涂亮或写旁注</span> : null}
            {pagedText ? <span>拖纸边改页面边界，文字量跟着变</span> : null}
            <span>R 旋转</span>
            <span>F / F11 全屏 · Esc 退出</span>
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
            view={mode}
            pdf={pdf}
            page={page}
            pageCount={pageCount}
            marks={marks}
            onClose={() => setPanel(null)}
            onJump={(target) => goPage(target)}
            onRemoveMark={(markId) => void removeMark(markId)}
            onToggleMark={(kind, target) => void toggleMark(kind, target)}
            onCompose={(quote) => setComposer({ kind: 'note', quote })}
          />
        ) : null}
      </div>

      {compareOpen && pdf ? (
        <CompareOverlay
          pdf={pdf}
          pages={compare}
          pageCount={pageCount}
          limit={MAX_COMPARE}
          onClose={() => setCompareOpen(false)}
          onChange={(list) => setCompare(list)}
          onGo={(target) => {
            setCompareOpen(false)
            goPage(target)
          }}
        />
      ) : null}

      {extractOpen && pdf ? (
        <ExtractDialog
          pdf={pdf}
          noteId={id}
          sourceTitle={info.note.title}
          current={page}
          onClose={() => setExtractOpen(false)}
          onHint={showHint}
          onOpened={(note) => navigate('/reader/' + note.id)}
        />
      ) : null}

      {composer ? (
        <MarkComposer
          page={composer.atPage ?? page}
          ink={composer.region !== undefined && composer.region !== ''}
          ranged={composer.region !== undefined && parseRange(composer.region) !== null}
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

/* ==================== 圈画批注（v1.2.5）：任意形状圈一块 + 就地气泡 + 页顶快捷按键 ==================== */
/** 圈注轨迹上的一点：归一化到页面自身坐标（0~1，x 向右 y 向下），缩放与旋转都不影响它 */
type InkPoint = [number, number]
/**
 * 正文实际排到了第几栏：看最后几个块「最后一个矩形片段」落在哪一栏。
 * 实测（Chromium）column-count 给少了会自己往外长、给多了会留空栏，
 * 只有片段的左边界能同时判出这两种情况，所以拿它当唯一依据。
 */
function usedColumnCount(root: HTMLElement, colW: number, gap: number, scale: number): number {
  const fr = root.getBoundingClientRect()
  const kids = root.children
  const step = colW + gap
  let used = 1
  for (let i = kids.length - 1; i >= 0 && i >= kids.length - 3; i -= 1) {
    const rects = kids[i].getClientRects()
    if (rects.length === 0) continue
    const last = rects[rects.length - 1]
    /* 取片段右沿（往回让半个字）而不是左沿：正好压在栏分界上的块，
       左沿会因亚像素误差在「这一栏 / 上一栏」之间来回跳，栏数永远收敛不了 */
    const probe = last.right - Math.min(1, last.width / 2)
    const col = Math.floor((probe - fr.left) / scale / step) + 1
    if (col > used) used = col
  }
  return Math.min(TX_MAX_COLS, used)
}

/** 圈注形状：自由手绘 / 矩形 / 圆圈（椭圆）/ 多边形（逐点落点，点回起点闭合成形） */
type InkShape = 'free' | 'rect' | 'ellipse' | 'polygon'
/** 一处圈画：形状 + 顶点。矩形与圆圈只存对角的两个点，画的时候再展开 */
interface InkRegion {
  kind: InkShape
  points: InkPoint[]
}

const INK_SHAPE_LABELS: { key: InkShape; label: string; hint: string }[] = [
  { key: 'free', label: '自由', hint: '按住拖动，想怎么圈就怎么圈' },
  { key: 'rect', label: '矩形', hint: '按住拖出一个矩形框' },
  { key: 'ellipse', label: '圆圈', hint: '按住拖出一个椭圆，往斜角拖就是圆圈' },
  { key: 'polygon', label: '多边形', hint: '单击逐个落点，点回起点或按 Enter 闭合成形，Esc 作废' }
]
const INK_SHAPES = INK_SHAPE_LABELS.map((item) => item.key)

/** 旁注列宽度；两个显示开关各自记住，圈画和整页注释可以分开看 */
const NOTE_RAIL_W = 208
/** 就地气泡宽度：贴着圈住的那块显示，右边放不下就翻到左边 */
const NOTE_POP_W = 244
const SHOW_INK_KEY = 'workstation.reader.showink.v1'
const SHOW_NOTES_KEY = 'workstation.reader.shownotes.v1'
const INK_SHAPE_KEY = 'workstation.reader.inkshape.v1'
/** 滚轮翻页开关：默认开（沿用以前的行为），关掉只是不想滚页面时误翻页 */
const WHEEL_FLIP_KEY = 'workstation.reader.wheelflip.v1'
/** 文字页的纸张边界：存的是「用户拖过的尺寸」，没拖过就跟着舞台自适应 */
const TX_PAGE_KEY = 'workstation.reader.txpage.v1'
/** 正文区离纸边的距离（未缩放的排版像素）：像书页一样留出出血 */
const TX_PAD_X = 44
const TX_PAD_Y = 46
/** 双页时两栏之间的书脊间距 */
const TX_GAP = 26
const TX_MIN_W = 320
const TX_MAX_W = 1900
const TX_MIN_H = 280
const TX_MAX_H = 2600
/** 一栏最多排到多少页，防止极端内容把 DOM 撑爆 */
const TX_MAX_COLS = 4000
/** 文字页可见窗口在正文区两侧各多留的一点余量：必须小于栏间距，否则邻栏会漏一条字出来 */
const TX_BLEED = 8

/** note_marks.region 存的是 { kind, points }；第三轮的老数据没有 kind，按自由手绘读 */
function parseInk(json: string): InkRegion | null {
  if (json === '') return null
  try {
    const raw = JSON.parse(json) as { points?: unknown; kind?: unknown }
    const list = Array.isArray(raw.points) ? (raw.points as unknown[]) : []
    const points = list
      .filter((point): point is number[] => Array.isArray(point) && point.length === 2)
      .map((point): InkPoint => [Number(point[0]), Number(point[1])])
    const kind = typeof raw.kind === 'string' && INK_SHAPES.includes(raw.kind as InkShape) ? (raw.kind as InkShape) : 'free'
    if (kind === 'rect' || kind === 'ellipse') return points.length >= 2 ? { kind, points: points.slice(0, 2) } : null
    return points.length > 2 ? { kind, points } : null
  } catch {
    return null
  }
}

/** 文字页的行内标记：起止是「渲染后正文的第几个字」，与排版无关，换字体改边界都不会错位 */
interface TextRange {
  start: number
  end: number
}

/** note_marks.region 里 { kind:'range', start, end } 这一种存法；圈画的 {kind,points} 走 parseInk */
function parseRange(json: string): TextRange | null {
  if (json === '') return null
  try {
    const raw = JSON.parse(json) as { kind?: unknown; start?: unknown; end?: unknown }
    if (raw.kind !== 'range') return null
    const start = Number(raw.start)
    const end = Number(raw.end)
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null
  } catch {
    return null
  }
}

/** 一条行内标记量出来的落点：第几栏（= 第几页）与栏内坐标（未缩放排版像素） */
interface RangeSpot {
  id: number
  col: number
  x: number
  y: number
}

interface RangeItem extends TextRange {
  id: number
  quote: string
  /** hl = 纯荧光笔；note = 带着一条旁注 */
  tone: 'hl' | 'note'
}

/** 把 [start,end) 这段正文套上 <mark>：区间里的每个文字节点各套一层，跨元素也不会漏 */
function wrapRange(root: HTMLElement, start: number, end: number, id: number, tone: 'hl' | 'note'): void {
  const hits: { node: Text; from: number }[] = []
  let pos = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const len = node.data.length
    if (pos + len > start && pos < end) hits.push({ node, from: pos })
    pos += len
  }
  hits.forEach(({ node, from }) => {
    const a = Math.max(0, start - from)
    const b = Math.min(node.data.length, end - from)
    if (b <= a) return
    const mid = node.splitText(a)
    const after = mid.splitText(b - a)
    const mark = document.createElement('mark')
    mark.className = 'tx-hl' + (tone === 'note' ? ' is-annotated' : '')
    mark.dataset.txId = String(id)
    mid.parentNode?.insertBefore(mark, after)
    mark.appendChild(mid)
  })
}

/**
 * 重画正文里的所有行内标记：先把上一轮自己塞进去的 <mark> 拆干净，再按偏移量重新套。
 * React 只管正文本身，这些包裹节点在每次重绘前都会被拆掉，两方不会抢同一批子节点。
 * 偏移量对不上原文（正文被编辑过）时退回按引文再找一次，找不到就这条不画。
 */
function applyTextRanges(
  root: HTMLElement,
  items: RangeItem[],
  geom: { colW: number; gap: number; scale: number }
): RangeSpot[] {
  root.querySelectorAll('mark[data-tx-id]').forEach((node) => {
    const parent = node.parentNode
    if (!parent) return
    while (node.firstChild) parent.insertBefore(node.firstChild, node)
    parent.removeChild(node)
  })
  root.normalize()
  const full = root.textContent ?? ''
  const placed: { id: number; tone: 'hl' | 'note' }[] = []
  items.forEach((item) => {
    let start = item.start
    let end = item.end
    if (!full.startsWith(item.quote, start)) {
      const at = item.quote === '' ? -1 : full.indexOf(item.quote)
      if (at < 0) return
      start = at
      end = at + item.quote.length
    }
    if (end <= start) return
    wrapRange(root, start, end, item.id, item.tone)
    placed.push({ id: item.id, tone: item.tone })
  })
  if (geom.colW < 8) return []
  const fr = root.getBoundingClientRect()
  return placed.map((entry) => {
    const node = root.querySelector('mark[data-tx-id="' + entry.id + '"]')
    if (!node) return null
    const rects = node.getClientRects()
    if (rects.length === 0) return null
    const first = rects[0]
    const raw = (first.left - fr.left) / geom.scale
    const col = Math.min(TX_MAX_COLS, Math.max(1, Math.floor(raw / (geom.colW + geom.gap)) + 1))
    return {
      id: entry.id,
      col,
      x: raw - (col - 1) * (geom.colW + geom.gap),
      y: (first.top - fr.top) / geom.scale
    } satisfies RangeSpot
  }).filter((spot): spot is RangeSpot => spot !== null)
}

/** 选区 → 正文里的字符区间：用 Range.toString() 量到起终点，元素级容器也能算准 */
function rangeOffsets(root: HTMLElement, range: Range): TextRange | null {
  const before = document.createRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const after = document.createRange()
  after.selectNodeContents(root)
  after.setEnd(range.endContainer, range.endOffset)
  let start = before.toString().length
  let end = after.toString().length
  if (end < start) return null
  const full = root.textContent ?? ''
  while (start < end && /\s/.test(full[start] ?? '')) start += 1
  while (end > start && /\s/.test(full[end - 1] ?? '')) end -= 1
  return end > start ? { start, end } : null
}
/** 选中一段正文后浮出来的那条小条：位置是相对宿主元素算的 */
interface SelectionSpot {
  range: TextRange
  quote: string
  left: number
  top: number
}

/**
 * 「选中正文 → 涂荧光 / 在旁边写注释」：分页的文字纸和连续滚动共用同一套。
 * root = 正文容器（偏移量按它的 textContent 数），host = 浮条定位的宿主（需要 position: relative）。
 */
function useTextSelection(opts: {
  rootRef: RefObject<HTMLElement | null>
  hostRef: RefObject<HTMLElement | null>
  onHighlight: (range: TextRange, quote: string) => void
  onAnnotate: (range: TextRange, quote: string) => void
}): { sel: SelectionSpot | null; pick: () => void; clear: () => void } {
  const { rootRef, hostRef } = opts
  const [sel, setSel] = useState<SelectionSpot | null>(null)
  const clear = useCallback((): void => setSel(null), [])
  /** 松手后读选区：两头削掉空白，量出来的起止就是正文里的字符位置 */
  const pick = (): void => {
    const root = rootRef.current
    const host = hostRef.current
    if (!root || !host) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSel(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) {
      setSel(null)
      return
    }
    const span = rangeOffsets(root, range)
    if (!span) {
      setSel(null)
      return
    }
    const quote = (root.textContent ?? '').slice(span.start, span.end)
    const rects = range.getClientRects()
    const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    setSel({
      range: span,
      quote,
      left: Math.min(Math.max(4, rect.left - hostRect.left), Math.max(4, hostRect.width - 186)),
      top: Math.max(4, rect.top - hostRect.top - 40)
    })
  }
  return { sel, pick, clear }
}

/** 选中后浮出来的小条：涂荧光笔 / 给这段写注释 */
function SelectionBar(props: {
  sel: SelectionSpot
  onHighlight: (range: TextRange, quote: string) => void
  onAnnotate: (range: TextRange, quote: string) => void
  onClose: () => void
}): JSX.Element {
  const { sel, onHighlight, onAnnotate, onClose } = props
  return (
    <div
      className="tx-selbar"
      style={{ left: sel.left, top: sel.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="tx-selbar-btn"
        title="把选中的这段涂成荧光笔（再点一下标记可取消）"
        onClick={() => {
          onHighlight(sel.range, sel.quote)
          onClose()
        }}
      >
        <Highlighter className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="tx-selbar-btn"
        title="给选中的这段在旁边写条注释"
        onClick={() => {
          onAnnotate(sel.range, sel.quote)
          onClose()
        }}
      >
        <NotebookPen className="h-3.5 w-3.5" />
      </button>
      <span className="max-w-[9rem] truncate text-[11px] text-muted-foreground">「{sel.quote.slice(0, 16)}」</span>
    </div>
  )
}

/** 纸面被旋转时显示框和页面自身不是一回事：存的时候一律转回页面坐标 */
function displayToPage(x: number, y: number, rotation: number): InkPoint {
  const angle = ((rotation % 360) + 360) % 360
  if (angle === 90) return [y, 1 - x]
  if (angle === 180) return [1 - x, 1 - y]
  if (angle === 270) return [1 - y, x]
  return [x, y]
}
/** 画的时候再按当前旋转转回显示坐标 */
function pageToDisplay(x: number, y: number, rotation: number): InkPoint {
  const angle = ((rotation % 360) + 360) % 360
  if (angle === 90) return [1 - y, x]
  if (angle === 180) return [1 - x, 1 - y]
  if (angle === 270) return [y, 1 - x]
  return [x, y]
}

/** 矩形与圆圈只存对角两点，画之前展开成顶点；圆圈取 36 段折线，放大到多少倍都看不出台阶 */
function inkOutline(region: InkRegion): InkPoint[] {
  const first = region.points[0]
  const last = region.points[region.points.length - 1]
  if (region.kind === 'rect') return [first, [last[0], first[1]], last, [first[0], last[1]]]
  if (region.kind === 'ellipse') {
    const cx = (first[0] + last[0]) / 2
    const cy = (first[1] + last[1]) / 2
    const rx = Math.abs(last[0] - first[0]) / 2
    const ry = Math.abs(last[1] - first[1]) / 2
    return Array.from({ length: 36 }, (_, index) => {
      const angle = (index / 36) * Math.PI * 2
      return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry] as InkPoint
    })
  }
  return region.points
}

/** 一组页面坐标的点在显示框里的外接矩形（0~1）：用来定位气泡与热区 */
function displayBox(points: InkPoint[], rotation: number): { x0: number; y0: number; x1: number; y1: number } {
  const list = points.map((point) => pageToDisplay(point[0], point[1], rotation))
  const xs = list.map((point) => point[0])
  const ys = list.map((point) => point[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** 纸面上的圈画：SVG 铺在画布上，线宽固定，缩放纸面不会跟着变粗；点这一块就把批注气泡开在旁边 */
function InkStrokes(props: {
  strokes: { id: number; region: InkRegion; active: boolean }[]
  box: { width: number; height: number }
  rotation: number
  onOpen?: (id: number) => void
}): JSX.Element | null {
  const { strokes, box, rotation, onOpen } = props
  if (strokes.length === 0) return null
  return (
    <svg
      className="mw-ink"
      width={box.width}
      height={box.height}
      viewBox={'0 0 ' + box.width + ' ' + box.height}
      aria-hidden
    >
      {strokes.map((stroke) => {
        const d = inkOutline(stroke.region)
          .map((point, index) => {
            const [dx, dy] = pageToDisplay(point[0], point[1], rotation)
            return (index === 0 ? 'M' : 'L') + (dx * box.width).toFixed(1) + ',' + (dy * box.height).toFixed(1)
          })
          .join('')
        return (
          <path
            key={stroke.id}
            d={d + 'Z'}
            className={stroke.active ? 'is-active' : undefined}
            onClick={
              onOpen
                ? (event) => {
                    event.stopPropagation()
                    onOpen(stroke.id)
                  }
                : undefined
            }
          />
        )
      })}
    </svg>
  )
}

/** 每处圈画角上的编号圆点：和页顶快捷按键、气泡里的编号一一对应，点一下就地展开批注 */
function InkDots(props: {
  items: { id: number; index: number; at: InkPoint }[]
  rotation: number
  activeId: number | null
  onOpen: (id: number) => void
}): JSX.Element | null {
  const { items, activeId, onOpen } = props
  if (items.length === 0) return null
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title="在这一页旁边展开这条圈注"
          onClick={(event) => {
            event.stopPropagation()
            onOpen(item.id)
          }}
          className={cn('mw-ink-dot', activeId === item.id && 'is-active')}
          style={{ left: item.at[0] * 100 + '%', top: item.at[1] * 100 + '%' }}
        >
          {item.index}
        </button>
      ))}
    </>
  )
}

/** 这条批注是怎么来的：整页 / 圈住一块 / 选中一段文字 / 只涂了荧光笔 */
function noteKindLabel(mark: NoteMark): string {
  if (mark.kind === 'highlight') return '荧光标记'
  if (mark.region === '') return '整页旁注'
  return parseRange(mark.region) ? '选中旁注' : '圈注'
}

/** 页面上方的快捷按键：这一页所有注释都在纸顶上排一排，点一下就展开，不用去页面下面找 */
function NoteQuickBar(props: {
  items: { mark: NoteMark; index: number }[]
  activeId: number | null
  onOpen: (id: number) => void
}): JSX.Element | null {
  const { items, activeId, onOpen } = props
  if (items.length === 0) return null
  return (
    <div className="mw-note-quick" title="这一页的注释：点一下就在旁边展开">
      {items.map(({ mark, index }) => (
        <button
          key={mark.id}
          type="button"
          className={cn('mw-note-chip', mark.region === '' ? 'is-page' : 'is-ink', activeId === mark.id && 'is-active')}
          title={noteKindLabel(mark) + ' ' + index + '：' + (mark.body !== '' ? mark.body : mark.quote).slice(0, 60)}
          onClick={(event) => {
            event.stopPropagation()
            onOpen(mark.id)
          }}
        >
          <span className="mw-note-chip-no">{index}</span>
          <span className="mw-note-chip-text">{mark.body.split('\n')[0].slice(0, 12)}</span>
        </button>
      ))}
    </div>
  )
}

/** 整页旁注列：贴在纸的右边，纸两侧没地方就落到纸的上下空白 */
function NoteRail(props: {
  items: { mark: NoteMark; index: number }[]
  side: boolean
  pageWidth: number
  onRemove: (id: number) => void
}): JSX.Element | null {
  const { items, side, pageWidth, onRemove } = props
  if (items.length === 0) return null
  return (
    <div className={cn('mw-note-rail', side ? 'is-side' : 'is-below')} style={side ? undefined : { width: pageWidth }}>
      {items.map(({ mark, index }) => (
        <article key={mark.id} className="mw-note-card" data-note-card={mark.id}>
          <header className="flex items-center gap-1.5">
            <span className="mw-note-no">{index}</span>
            <span className="mw-note-kind">旁注</span>
            <span className="mw-note-page">{mark.page > 0 ? '第 ' + mark.page + ' 页' : '正文'}</span>
            <button type="button" className="mw-note-del" title="删除这条注释" onClick={() => onRemove(mark.id)}>
              <Trash2 className="h-3 w-3" />
            </button>
          </header>
          {mark.quote !== '' ? <p className="mw-note-quote">「{mark.quote}」</p> : null}
          <p className="mw-note-body">{mark.body}</p>
        </article>
      ))}
    </div>
  )
}

/** 就地气泡：贴着圈住的那块显示（右边放不下就翻到左边），点纸上的圈或页顶按键都会开在这里 */
function NotePopover(props: {
  mark: NoteMark
  index: number
  left: number
  top: number
  onRemove: (id: number) => void
  onClose: () => void
}): JSX.Element {
  const { mark, index, left, top, onRemove, onClose } = props
  return (
    <div
      className="mw-note-pop"
      style={{ left, top, width: NOTE_POP_W }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex items-center gap-1.5">
        <span className="mw-note-no">{index}</span>
        <span className="mw-note-kind">{noteKindLabel(mark)}</span>
        <span className="mw-note-page">{mark.page > 0 ? '第 ' + mark.page + ' 页' : '正文'}</span>
        <button type="button" className="mw-note-del" title="删除这条注释" onClick={() => onRemove(mark.id)}>
          <Trash2 className="h-3 w-3" />
        </button>
        <button type="button" className="mw-note-del" title="收起" onClick={onClose}>
          <X className="h-3 w-3" />
        </button>
      </header>
      {mark.quote !== '' ? <p className="mw-note-quote">「{mark.quote}」</p> : null}
      <p className="mw-note-body">{mark.body}</p>
    </div>
  )
}

/** 注释工具组里的按键：图标 + 文字，点亮走主色底；全组共用一个边框，风格与「滚轮翻页」那类开关一致 */
function ToolButton(props: { on: boolean; label: string; hint: string; icon: ReactNode; onClick: () => void }): JSX.Element {
  const { on, label, hint, icon, onClick } = props
  return (
    <button
      type="button"
      className="mw-tool"
      data-on={on || undefined}
      title={hint}
      aria-pressed={on}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

/** 顶栏上的小开关：圈注 / 显示圈画 / 显示旁注，按下就记住 */
function ToggleChip(props: { on: boolean; label: string; hint: string; icon: ReactNode; onClick: () => void }): JSX.Element {
  const { on, label, hint, icon, onClick } = props
  return (
    <button
      type="button"
      title={hint}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1 rounded-lg border px-1.5 text-[11px] transition-colors',
        on ? 'border-primary bg-muted font-medium text-tint-primary' : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
/* ==================== 书页舞台（PDF / 原版式） ==================== */
/** 落在一张纸上的批注：纸上的圈画、文字页的行内标记、整页旁注，编号顺序与圆点、气泡一致 */
interface SheetNotes {
  pageNotes: NoteMark[]
  inkAll: { mark: NoteMark; region: InkRegion }[]
  railItems: { mark: NoteMark; index: number }[]
  chips: { mark: NoteMark; index: number }[]
  dots: { id: number; index: number; at: InkPoint }[]
}

/** 行内标记在这张纸上的位置（已经是纸面像素，倍率由调用方换算好） */
interface SheetRange {
  mark: NoteMark
  x: number
  y: number
}

function sheetNotes(
  notes: NoteMark[],
  pages: number[],
  showInk: boolean,
  showNotes: boolean,
  rotation: number,
  ranges: SheetRange[]
): SheetNotes {
  const pageNotes = notes.filter((mark) => pages.indexOf(mark.page) >= 0)
  const inkAll = pageNotes.reduce<{ mark: NoteMark; region: InkRegion }[]>((acc, mark) => {
    const region = parseInk(mark.region)
    if (region) acc.push({ mark, region })
    return acc
  }, [])
  /** 边上那一列只放整页旁注：圈注与行内注释都贴着本体就地展开 */
  const railItems = showNotes
    ? pageNotes.filter((mark) => mark.region === '').map((mark, index) => ({ mark, index: index + 1 }))
    : []
  const chips = [
    ...(showInk ? inkAll.map((item) => item.mark) : []),
    /* 纯荧光标记不上页顶按键：它自己就在纸上，点它即可 */
    ...(showInk ? ranges.filter((item) => item.mark.kind === 'note').map((item) => item.mark) : []),
    ...(showNotes ? pageNotes.filter((mark) => mark.region === '') : [])
  ].map((mark, index) => ({ mark, index: index + 1 }))
  const dots = showInk
    ? inkAll.flatMap((item) => {
        const at = chips.findIndex((entry) => entry.mark.id === item.mark.id)
        if (at < 0) return []
        const first = inkOutline(item.region)[0]
        return [{ id: item.mark.id, index: at + 1, at: pageToDisplay(first[0], first[1], rotation) }]
      })
    : []
  return { pageNotes, inkAll, railItems, chips, dots }
}

/**
 * 纸上那一层批注：圈画 + 编号圆点 + 页顶快捷按键 + 边上旁注 + 就地气泡 + 圈注手势。
 * 书页（pdf 画布）和文字页（正文排出来的纸）共用同一套，区别只是 box 与 rotation。
 */
function PageInkLayer(props: {
  pageNumber: number
  box: { width: number; height: number }
  rotation: number
  items: SheetNotes
  /** 文字页才有：选中正文写的注释 / 荧光标记，气泡贴着它落点显示 */
  ranges?: SheetRange[]
  inkMode?: boolean
  showInk: boolean
  showNotes: boolean
  noteSide: boolean
  onInk?: (kind: InkShape, points: InkPoint[], page: number) => void
  inkShape?: InkShape
  openNoteId?: number | null
  onOpenNote?: (id: number | null) => void
  onRemoveNote?: (id: number) => void
}): JSX.Element {
  const {
    pageNumber, box, rotation, items, ranges = [], inkMode, showInk, showNotes, noteSide,
    onInk, inkShape, openNoteId = null, onOpenNote, onRemoveNote
  } = props
  const { inkAll, railItems, chips, dots } = items
  /** 展开着的那条批注 */
  const opened = openNoteId === null ? null : chips.find((entry) => entry.mark.id === openNoteId)?.mark ?? null
  const openedIndex = opened === null ? 0 : chips.findIndex((entry) => entry.mark.id === opened.id) + 1
  /** 气泡位置：贴着圈住的那块 / 行内标记右边显示，纸的右边放不下就翻到左边；整页旁注钉在纸顶右侧 */
  const popSpot = (() => {
    if (opened === null) return { left: 0, top: 0 }
    const ranged = ranges.find((item) => item.mark.id === opened.id)
    if (ranged) {
      const right = ranged.x + 16
      const left = right + NOTE_POP_W > box.width ? Math.max(6, ranged.x - 12 - NOTE_POP_W) : right
      return { left, top: Math.min(Math.max(26, ranged.y - 8), Math.max(26, box.height - 96)) }
    }
    const entry = inkAll.find((item) => item.mark.id === opened.id)
    if (!entry) return { left: Math.max(8, box.width - NOTE_POP_W - 8), top: 34 }
    const area = displayBox(inkOutline(entry.region), rotation)
    const right = area.x1 * box.width + 12
    const left =
      right + NOTE_POP_W > box.width ? Math.max(6, area.x0 * box.width - 12 - NOTE_POP_W) : right
    const top = Math.min(Math.max(30, area.y0 * box.height), Math.max(30, box.height - 96))
    return { left, top }
  })()
  /** 点圈画 / 圆点 / 行内标记 / 页顶按键：同一条再点一下就收起 */
  const toggleNote = (markId: number): void => onOpenNote?.(openNoteId === markId ? null : markId)
  /** 正在画的这一笔：先按显示框记，落库前统一转成页面自身坐标 */
  const [sketch, setSketch] = useState<InkRegion | null>(null)
  const drawing = useRef<InkRegion | null>(null)

  const normPoint = (event: ReactPointerEvent<HTMLDivElement>): InkPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return [0, 0]
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    ]
  }
  /** 一笔收尾：转成页面自身坐标交给上层去写批注 */
  const commit = (region: InkRegion | null): void => {
    drawing.current = null
    setSketch(null)
    if (!region || !onInk) return
    const points = region.points.map((point) => displayToPage(point[0], point[1], rotation))
    if (region.kind === 'polygon' ? points.length < 3 : points.length < 2) return
    onInk(region.kind, points, pageNumber)
  }
  const drop = (): void => {
    drawing.current = null
    setSketch(null)
  }
  const inkDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !inkShape) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = normPoint(event)
    const current = drawing.current
    if (inkShape === 'polygon') {
      if (!current || current.kind !== 'polygon') {
        drawing.current = { kind: 'polygon', points: [point] }
        setSketch(drawing.current)
        return
      }
      const first = current.points[0]
      const backToStart =
        Math.hypot((point[0] - first[0]) * box.width, (point[1] - first[1]) * box.height) < 14
      if (current.points.length >= 3 && backToStart) {
        commit(current)
        return
      }
      drawing.current = { kind: 'polygon', points: [...current.points, point] }
      setSketch(drawing.current)
      return
    }
    drawing.current = { kind: inkShape, points: [point, point] }
    setSketch(drawing.current)
  }
  const inkMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drawing.current
    if (!current) return
    const point = normPoint(event)
    /* 多边形：橡皮筋只是预览，落库的顶点存在 drawing 里，不收游标 */
    if (current.kind === 'polygon') {
      setSketch({ kind: 'polygon', points: [...current.points, point] })
      return
    }
    if (current.kind === 'free') {
      const last = current.points[current.points.length - 1]
      /* 太密的点没意义还拖慢重绘：纸面上挪不到 3px 就丢掉 */
      if (Math.abs(point[0] - last[0]) * box.width + Math.abs(point[1] - last[1]) * box.height < 3) return
      current.points.push(point)
      setSketch({ kind: 'free', points: [...current.points] })
      return
    }
    current.points = [current.points[0], point]
    setSketch({ kind: current.kind, points: [...current.points] })
  }
  const inkUp = (): void => {
    const current = drawing.current
    if (!current || current.kind === 'polygon') return
    if (current.kind === 'free') {
      if (current.points.length < 6) drop()
      else commit(current)
      return
    }
    const [a, b] = [current.points[0], current.points[current.points.length - 1]]
    /* 拖得太小当误触 */
    if (Math.abs(b[0] - a[0]) * box.width < 8 || Math.abs(b[1] - a[1]) * box.height < 8) drop()
    else commit({ kind: current.kind, points: [a, b] })
  }
  /* 多边形画到一半时：Enter 闭合成形，Esc 作废这一笔（capture 抢在退全屏之前） */
  useEffect(() => {
    if (!sketch || sketch.kind !== 'polygon') return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        commit(drawing.current ?? sketch)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        drop()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketch])

  return (
    <>
      {showInk ? (
        <InkStrokes
          strokes={inkAll.map((item) => ({
            id: item.mark.id,
            region: item.region,
            active: opened !== null && opened.id === item.mark.id
          }))}
          box={box}
          rotation={rotation}
          onOpen={toggleNote}
        />
      ) : null}
      {sketch ? (
        <InkStrokes strokes={[{ id: -1, region: sketch, active: false }]} box={box} rotation={rotation} />
      ) : null}
      <InkDots items={dots} rotation={rotation} activeId={openNoteId} onOpen={toggleNote} />
      <NoteQuickBar items={chips} activeId={openNoteId} onOpen={toggleNote} />
      <NoteRail
        items={railItems}
        side={noteSide}
        pageWidth={box.width}
        onRemove={(markId) => onRemoveNote?.(markId)}
      />
      {opened ? (
        <NotePopover
          mark={opened}
          index={openedIndex}
          left={popSpot.left}
          top={popSpot.top}
          onRemove={(markId) => {
            onOpenNote?.(null)
            onRemoveNote?.(markId)
          }}
          onClose={() => onOpenNote?.(null)}
        />
      ) : null}
      {inkMode ? (
        <div
          className="mw-ink-catch"
          title={INK_SHAPE_LABELS.find((item) => item.key === inkShape)?.hint ?? '按住拖动圈出要注释的部分'}
          onPointerDown={inkDown}
          onPointerMove={inkMove}
          onPointerUp={inkUp}
          onPointerCancel={inkUp}
        />
      ) : null}
    </>
  )
}

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
  /** 全书的注释（圈注 + 整页旁注），每一页自己挑 */
  notes?: NoteMark[]
  /** 圈注模式：在当前页上按住拖动圈一块 */
  inkMode?: boolean
  /** 两个显示开关：纸上的圈画、边上的批注，各管各的 */
  showInk?: boolean
  showNotes?: boolean
  /** 旁注贴纸边（true）还是落到纸的上下空白（false） */
  noteSide?: boolean
  /** 圈注形状：按住拖动（自由 / 矩形 / 圆圈）或逐点落点（多边形） */
  onInk?: (kind: InkShape, points: InkPoint[], page: number) => void
  inkShape?: InkShape
  /** 当前展开着的那条批注（就地气泡），null = 没有 */
  openNoteId?: number | null
  onOpenNote?: (id: number | null) => void
  onRemoveNote?: (id: number) => void
}

function PdfStage(props: StageProps): JSX.Element {
  const {
    pdf, page, pageCount, scale, rotation, layout, turning,
    onScrollNode, onJump, onActivePage, notes, inkMode, showInk, showNotes, noteSide, onInk, onRemoveNote,
    inkShape, openNoteId, onOpenNote
  } = props

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
        notes={notes}
        inkMode={inkMode}
        showInk={showInk}
        showNotes={showNotes}
        noteSide={noteSide}
        onInk={onInk}
        onRemoveNote={onRemoveNote}
        inkShape={inkShape}
        openNoteId={openNoteId}
        onOpenNote={onOpenNote}
      />
    )
  }

  const double = layout === 'double'
  const right = double ? page + 1 : 0
  const ghostPages = turning ? (double ? [turning.from, turning.from + 1] : [turning.from]) : []
  const currentPages = double ? [page, right] : [page]
  const box = pageSize(pdf.baseWidth, pdf.baseHeight, scale, rotation)

  return (
    <div ref={onScrollNode} className={cn('reader-page-area h-full overflow-auto', turning && 'is-turning')}>
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
                  notes={notes}
                  inkMode={inkMode}
                  showInk={showInk}
                  showNotes={showNotes}
                  noteSide={noteSide}
                  onInk={onInk}
                  onRemoveNote={onRemoveNote}
                  inkShape={inkShape}
                  openNoteId={openNoteId}
                  onOpenNote={onOpenNote}
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
  const {
    pdf, page, pageCount, scale, rotation, onScrollNode, onJump, onActivePage,
    notes, inkMode, showInk, showNotes, noteSide, onInk, onRemoveNote,
    inkShape, openNoteId, onOpenNote
  } = props
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
            notes={notes}
            inkMode={inkMode && number === page}
            showInk={showInk}
            showNotes={showNotes}
            noteSide={noteSide}
            onInk={onInk}
            onRemoveNote={onRemoveNote}
            inkShape={inkShape}
            openNoteId={openNoteId}
            onOpenNote={onOpenNote}
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
  /** 这一页要显示的注释（圈注与整页旁注都算在内） */
  notes?: NoteMark[]
  /** 圈注模式：在当前页上按住拖动圈出一块（形状由 inkShape 决定） */
  inkMode?: boolean
  showInk?: boolean
  showNotes?: boolean
  noteSide?: boolean
  /** 圈注形状：按住拖动（自由 / 矩形 / 圆圈）或逐点落点（多边形） */
  onInk?: (kind: InkShape, points: InkPoint[], page: number) => void
  inkShape?: InkShape
  /** 当前展开着的那条批注（就地气泡），null = 没有 */
  openNoteId?: number | null
  onOpenNote?: (id: number | null) => void
  onRemoveNote?: (id: number) => void
}): JSX.Element {
  const {
    pdf, pageNumber, scale, rotation, active, ghost, lazy, priority = 0, onJump,
    notes, inkMode, showInk = true, showNotes = true, noteSide = false, onInk, onRemoveNote,
    inkShape, openNoteId = null, onOpenNote
  } = props
  const holder = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [visible, setVisible] = useState(!lazy)
  const rounded = Math.round(scale * 100) / 100
  const box = pageSize(pdf.baseWidth, pdf.baseHeight, rounded, rotation)
  const mountKey = pdf.uid + '|' + pageNumber + '|' + rounded + '|' + rotation
  const mounted = useRef('')

  /* ---------- 这一页的批注：与文字页共用同一套（圈画 + 页顶按键 + 边上旁注 + 就地气泡） ---------- */
  const items = sheetNotes(notes ?? [], [pageNumber], showInk, showNotes, rotation, [])
  const { chips } = items
  const opened = openNoteId === null ? null : chips.find((entry) => entry.mark.id === openNoteId)?.mark ?? null
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
      className={cn(
        'mw-page',
        active && 'is-active',
        ghost && 'is-ghost',
        (chips.length > 0 || opened !== null) && 'has-rail',
        state === 'loading' && 'is-loading',
        state === 'error' && 'is-error'
      )}
      style={{ width: box.width, height: box.height }}
      onClick={() => onJump?.(pageNumber)}
    >
      {/* 画布由 pdf.js 直接挂到这个宿主节点上：React 不往里面渲染任何东西，避免两方争抢同一批子节点 */}
      <div ref={holder} className="mw-page-host" />
      <span className="mw-page-no">{pageNumber}</span>
      <PageInkLayer
        pageNumber={pageNumber}
        box={box}
        rotation={rotation}
        items={items}
        inkMode={inkMode && active}
        showInk={showInk}
        showNotes={showNotes}
        noteSide={noteSide}
        onInk={onInk}
        inkShape={inkShape}
        openNoteId={openNoteId}
        onOpenNote={onOpenNote}
        onRemoveNote={onRemoveNote}
      />      {state === 'loading' ? (
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
  /** 正文字体栈；空串 = 跟随排版文档自带字体 */
  fontFamily: string
  layout: StageLayout
  onPageCount: (count: number) => void
  onActivePage: (page: number) => void
  onWheelZoom: (factor: number) => void
}): JSX.Element {
  const { html, page, zoom, fontFamily, layout, onPageCount, onActivePage, onWheelZoom } = props
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
    /* 字体覆盖只在用户主动选字体时注入，默认不动排版文档自带的字体 */
    if (doc.head) {
      let fontStyle = doc.getElementById('mw-reader-font')
      if (!fontStyle) {
        fontStyle = doc.createElement('style')
        fontStyle.id = 'mw-reader-font'
        doc.head.appendChild(fontStyle)
      }
      fontStyle.textContent =
        fontFamily === '' ? '' : 'html body, html body * { font-family: ' + fontFamily + ' !important; }'
    }
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
  }, [ready, zoom, fontFamily, layout, onPageCount, onActivePage, onWheelZoom])

  // 翻页 = 把 iframe 滚到对应位置（保持原版式，不做二次排版）
  useEffect(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc || !ready) return
    try {
      ignoreScrollUntil.current = Date.now() + 400
      const top = ((page - 1) * frame.clientHeight) / zoom
      doc.defaultView?.scrollTo({ top, behavior: 'smooth' })
    } catch {
      /* 忽略 */
    }
  }, [page, zoom, ready])

  if (html === '') {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">这份资料的排版文件读不到了</div>
  }

  return (
    <div className="reader-page-area relative flex h-full items-center justify-center overflow-hidden px-6 py-5">
      {/* 排版模式整页就是这一个 iframe：重挂一次就白屏一下，所以这里不挂翻页图层，
          只让内容平滑滚过去 —— 效果比强行套一层平移更稳，也不会有闪动 */}
      <div className="mw-book mw-book-fill">
        <div className="mw-layer mw-layer-in">
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

/* ==================== 文本舞台（连续滚动 / 可编辑） ==================== */
function TextStage(props: {
  text: string
  editing: boolean
  onEdit: (value: string) => void
  fontSize: number
  /** 正文字体栈；空串 = 用界面默认字体 */
  fontFamily: string
  zoom: number
  readonly: boolean
  onWheelZoom: (factor: number) => void
  /** 「连续」也要能涂荧光与选中注释：与分页文字纸同一套存法、同一套浮条 */
  ranges: RangeMark[]
  showInk: boolean
  onHighlight: (range: TextRange, quote: string) => void
  onAnnotate: (range: TextRange, quote: string) => void
  onRemoveNote: (id: number) => void
}): JSX.Element {
  const {
    text, editing, onEdit, fontSize, fontFamily, zoom, readonly, onWheelZoom,
    ranges, showInk, onHighlight, onAnnotate, onRemoveNote
  } = props
  const isPlain = !/[#*`>|-]{1}/.test(text.slice(0, 200)) && !/^#{1,6}\s/m.test(text)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLElement | null>(null)
  const { sel, pick, clear } = useTextSelection({ rootRef: bodyRef, hostRef, onHighlight, onAnnotate })
  /** 点开的那条行内注释：连续滚动没有「页」，气泡就贴在点到的那段下面 */
  const [pop, setPop] = useState<{ mark: NoteMark; index: number; left: number; top: number } | null>(null)

  /* Ctrl+滚轮缩放：React 的 onWheel 是 passive 监听，拦不住浏览器自己的缩放，挂原生监听 */
  useEffect(() => {
    const node = hostRef.current
    if (!node) return undefined
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onWheelZoom(Math.exp(-event.deltaY * 0.0022))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
    }
  }, [onWheelZoom])

  /* ---------- 把行内标记画进正文：colW 给 0 = 只画不定位（连续滚动没有栏可归位） ---------- */
  useLayoutEffect(() => {
    const root = bodyRef.current
    if (!root || editing) return
    const items: RangeItem[] = (showInk ? ranges : []).map((item) => ({
      id: item.mark.id,
      start: item.start,
      end: item.end,
      quote: item.quote,
      tone: item.tone
    }))
    applyTextRanges(root, items, { colW: 0, gap: 0, scale: 1 })
  }, [ranges, showInk, text, isPlain, editing, zoom])

  /** 点荧光标记：就地展开它那条注释；点别处收起 */
  const onBodyClick = (event: ReactMouseEvent<HTMLElement>): void => {
    const node = (event.target as HTMLElement | null)?.closest?.('mark[data-tx-id]') as HTMLElement | null
    const host = hostRef.current
    const markId = node === null ? Number.NaN : Number(node.dataset.txId)
    const at = ranges.findIndex((item) => item.mark.id === markId)
    if (!node || !host || at < 0) {
      setPop(null)
      return
    }
    if (pop !== null && pop.mark.id === markId) {
      setPop(null)
      return
    }
    const hr = host.getBoundingClientRect()
    const r = node.getBoundingClientRect()
    setPop({
      mark: ranges[at].mark,
      index: at + 1,
      left: Math.min(Math.max(8, r.left - hr.left), Math.max(8, hr.width - NOTE_POP_W - 24)),
      top: r.bottom - hr.top + host.scrollTop + 6
    })
  }

  return (
    <div ref={hostRef} className="reader-scroll relative h-full overflow-auto px-6 py-8">
      <article
        ref={bodyRef}
        className="reader-text mx-auto max-w-[46rem]"
        style={{
          fontSize: fontSize + 'px',
          fontFamily: fontFamily === '' ? undefined : fontFamily,
          zoom: zoom === 1 ? undefined : String(zoom)
        }}
        onPointerUp={editing ? undefined : pick}
        onClick={editing ? undefined : onBodyClick}
      >
        {editing ? (
          <textarea
            value={text}
            onChange={(event) => onEdit(event.target.value)}
            className="field-base min-h-[70vh] w-full resize-y font-mono text-sm leading-relaxed"
            spellCheck={false}
          />
        ) : isPlain ? (
          <pre className="reader-plain whitespace-pre-wrap break-words leading-[1.85]">{text}</pre>
        ) : (
          <div className="md-body leading-[1.85]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {readonly && !editing ? (
          <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
            这份资料是只读的（导入时按原版式保存）。想要做笔记，用上方「注释」，它会像批注一样跟着页码存进这本书。
          </p>
        ) : null}
      </article>
      {sel && !editing ? (
        <SelectionBar
          sel={sel}
          onHighlight={(range, quote) => void onHighlight(range, quote)}
          onAnnotate={onAnnotate}
          onClose={clear}
        />
      ) : null}
      {pop ? (
        <NotePopover
          mark={pop.mark}
          index={pop.index}
          left={pop.left}
          top={pop.top}
          onRemove={(markId) => {
            setPop(null)
            onRemoveNote(markId)
          }}
          onClose={() => setPop(null)}
        />
      ) : null}
    </div>
  )
}

/* ==================== 文字模式的纸：整篇正文按页面边界排成一栏一页 ==================== */
/** 一条落在正文里的行内标记：偏移量对的是渲染后的正文，与排版无关 */
interface RangeMark {
  mark: NoteMark
  start: number
  end: number
  quote: string
  /** hl = 只涂荧光笔；note = 带着一条旁注 */
  tone: 'hl' | 'note'
}

interface TextBookProps {
  text: string
  fontSize: number
  fontFamily: string
  /** 纸张边界（未缩放的排版像素）：双页时一张纸 = 两栏 */
  sheet: { width: number; height: number }
  /** 页面缩放：只把纸放大，不重排，所以栏数不受它影响 */
  scale: number
  layout: StageLayout
  page: number
  turning: { from: number; to: number; dir: 1 | -1 } | null
  onPageCount: (count: number) => void
  onResize: (width: number, height: number) => void
  onScrollNode: (node: HTMLDivElement | null) => void
  /** 整本书的注释（圈注 + 整页旁注），每一栏自己挑 */
  notes: NoteMark[]
  /** 正文里的行内标记（高亮与选中旁注） */
  ranges: RangeMark[]
  onHighlight: (range: TextRange, quote: string) => void
  onAnnotate: (range: TextRange, quote: string) => void
  inkMode: boolean
  showInk: boolean
  showNotes: boolean
  noteSide: boolean
  onInk: (kind: InkShape, points: InkPoint[], page: number) => void
  inkShape: InkShape
  openNoteId: number | null
  onOpenNote: (id: number | null) => void
  onRemoveNote: (id: number) => void
}

/**
 * 文字模式也有一张纸：正文按「页面边界」排成多栏，一栏就是一页。
 * 栏宽靠 column-count + 容器宽度算死（只给 column-width 会被拉伸填满，实测），
 * 栏数靠量最后一个块的最后一个片段落在第几栏得出（column-count 给少了自己往外长），两步收敛。
 * 拖纸边就改边界，正文跟着重排；翻页动效、圈注、旁注与书页共用同一套。
 */
function TextBook(props: TextBookProps): JSX.Element {
  const {
    text, fontSize, fontFamily, sheet, scale, layout, page, turning,
    onPageCount, onResize, onScrollNode, notes, ranges, onHighlight, onAnnotate,
    inkMode, showInk, showNotes, noteSide, onInk, inkShape, openNoteId, onOpenNote, onRemoveNote
  } = props
  const stageRef = useRef<HTMLDivElement | null>(null)
  const flowRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const resize = useRef<{ axis: 'w' | 'h' | 'wh'; x: number; y: number; w: number; h: number } | null>(null)
  const [spots, setSpots] = useState<Record<number, RangeSpot>>({})
  /* 选中一段正文 → 浮出「涂荧光 / 写旁注」：与连续滚动共用同一套 */
  const { sel, pick: pickSelection, clear: clearSel } = useTextSelection({
    rootRef: flowRef,
    hostRef: sheetRef,
    onHighlight,
    onAnnotate
  })

  const perSheet = layout === 'double' ? 2 : 1
  const colW = Math.max(140, (sheet.width - TX_PAD_X * 2 - (perSheet - 1) * TX_GAP) / perSheet)
  const colH = Math.max(140, sheet.height - TX_PAD_Y * 2)
  const sheetW = perSheet * colW + (perSheet - 1) * TX_GAP + TX_PAD_X * 2
  /** 可见窗口：正文区 + 左右各 TX_BLEED 的余量。
     纸的出血（44）比栏距（26）还宽，直接拿纸宽当窗口会把上一页 / 下一页的一条字留在纸上，
     这就是「上一页会露出下一页的片段」；窗口收紧到栏距以内就不漏了。 */
  const contentW = perSheet * colW + (perSheet - 1) * TX_GAP
  const clipW = contentW + TX_BLEED * 2
  const isPlain = !/[#*`>|-]{1}/.test(text.slice(0, 200)) && !/^#{1,6}\s/m.test(text)
  /** 正文只认 text：翻页、缩放都复用同一棵 DOM，不会每翻一页重解析一遍 Markdown */
  const body = useMemo(
    () =>
      isPlain ? (
        <pre className="reader-plain whitespace-pre-wrap break-words leading-[1.85]">{text}</pre>
      ) : (
        <div className="md-body leading-[1.85]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ),
    [text, isPlain]
  )

  const attachStage = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node
      onScrollNode(node)
    },
    [onScrollNode]
  )

  /* ---------- 报页数：容器只有一栏宽，正文排不下的部分自己长成新的一栏，
     所以量一次「排到了第几栏」就是总页数；栏数不再回写布局，也就不会再出现
     量不准 → 全挤进一页 → 翻不动 的反馈环（上一版就是这么卡的） ---------- */
  useLayoutEffect(() => {
    const root = flowRef.current
    if (!root || colW < 60 || colH < 60) return
    onPageCount(usedColumnCount(root, colW, TX_GAP, scale))
  }, [text, fontSize, fontFamily, colW, colH, scale, onPageCount])

  /* ---------- 把行内标记画进正文：翻页残影那份是另一张纸，也要画 ---------- */
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const shown = showInk ? ranges : []
    const items: RangeItem[] = shown.map((item) => ({
      id: item.mark.id,
      start: item.start,
      end: item.end,
      quote: item.quote,
      tone: item.tone
    }))
    const flows = Array.from(stage.querySelectorAll<HTMLElement>('.tx-flow'))
    const next: Record<number, RangeSpot> = {}
    flows.forEach((flow, index) => {
      const found = applyTextRanges(flow, items, { colW, gap: TX_GAP, scale })
      if (index === 0) found.forEach((spot) => { next[spot.id] = spot })
    })
    setSpots((prev) => {
      const keys = Object.keys(next)
      if (keys.length !== Object.keys(prev).length) return next
      const same = keys.every((key) => {
        const a = prev[Number(key)]
        const b = next[Number(key)]
        return !!a && !!b && a.col === b.col && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
      })
      return same ? prev : next
    })
  }, [ranges, showInk, text, isPlain, colW, colH, scale, turning])

  /* 翻页 / 换书就把浮条收掉，别让它钉在旧位置 */
  useEffect(() => {
    clearSel()
  }, [page, text, clearSel])

  /** 落在某一栏里的行内标记：气泡与页顶按键都按这个位置摆 */
  const rangesOf = (pageNumber: number): SheetRange[] => {
    const list: SheetRange[] = []
    ranges.forEach((item) => {
      const spot = spots[item.mark.id]
      if (!spot || spot.col !== pageNumber) return
      list.push({ mark: item.mark, x: spot.x * scale, y: spot.y * scale })
    })
    return list
  }

  /** 点纸上的荧光标记：有旁注就地展开，纯高亮点一下就收起气泡 */
  const onFlowClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const node = (event.target as HTMLElement | null)?.closest?.('mark[data-tx-id]') as HTMLElement | null
    if (!node) return
    event.stopPropagation()
    const markId = Number(node.dataset.txId)
    if (!Number.isFinite(markId)) return
    onOpenNote(openNoteId === markId ? null : markId)
  }

  /* ---------- 拖纸边：改的就是「页面边界」，正文跟着重排 ---------- */
  const startResize = (axis: 'w' | 'h' | 'wh') => (event: ReactPointerEvent<HTMLSpanElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    resize.current = { axis, x: event.clientX, y: event.clientY, w: sheet.width, h: sheet.height }
  }
  const moveResize = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const drag = resize.current
    if (!drag) return
    const dx = (event.clientX - drag.x) / scale
    const dy = (event.clientY - drag.y) / scale
    const width = drag.axis === 'h' ? drag.w : Math.min(TX_MAX_W, Math.max(TX_MIN_W, drag.w + dx))
    const height = drag.axis === 'w' ? drag.h : Math.min(TX_MAX_H, Math.max(TX_MIN_H, drag.h + dy))
    onResize(width, height)
  }
  const endResize = (): void => {
    if (!resize.current) return
    resize.current = null
    clearSel()
  }

  const buildSheet = (first: number, ghost: boolean): JSX.Element => {
    const pages = perSheet === 2 ? [first, first + 1] : [first]
    const off = (first - 1) * (colW + TX_GAP)
    const items = pages.map((pageNumber) => sheetNotes(notes, [pageNumber], showInk, showNotes, 0, rangesOf(pageNumber)))
    const hasNotes = items.some((entry) => entry.chips.length > 0)
    return (
      <div
        key={ghost ? 'out' : 'in'}
        ref={ghost ? null : sheetRef}
        className={cn('mw-page tx-sheet', ghost && 'is-ghost', hasNotes && 'has-rail')}
        style={{ width: sheetW * scale, height: sheet.height * scale }}
      >
        <div
          className="tx-zoom"
          style={{ zoom: scale, left: TX_PAD_X - TX_BLEED, width: clipW, height: sheet.height }}
        >
          <div
            ref={ghost ? null : flowRef}
            className="reader-text tx-flow"
            style={{
              left: TX_BLEED,
              top: TX_PAD_Y,
              width: colW,
              height: colH,
              columnCount: 'auto',
              columnWidth: colW,
              columnGap: TX_GAP,
              fontSize: fontSize + 'px',
              fontFamily: fontFamily === '' ? undefined : fontFamily,
              transform: 'translateX(' + -off + 'px)'
            }}
            onPointerUp={ghost ? undefined : pickSelection}
            onClick={ghost ? undefined : onFlowClick}
          >
            {body}
          </div>
        </div>
        {ghost ? null : <span className="mw-page-no">{page}</span>}
        {ghost
          ? null
          : pages.map((pageNumber, index) => (
              <div
                key={pageNumber}
                className="tx-col"
                style={{
                  position: 'absolute',
                  left: (TX_PAD_X + index * (colW + TX_GAP)) * scale,
                  top: TX_PAD_Y * scale,
                  width: colW * scale,
                  height: colH * scale
                }}
              >
                <PageInkLayer
                  pageNumber={pageNumber}
                  box={{ width: colW * scale, height: colH * scale }}
                  rotation={0}
                  items={items[index]}
                  ranges={rangesOf(pageNumber)}
                  inkMode={inkMode}
                  showInk={showInk}
                  showNotes={showNotes}
                  noteSide={noteSide}
                  onInk={onInk}
                  inkShape={inkShape}
                  openNoteId={openNoteId}
                  onOpenNote={onOpenNote}
                  onRemoveNote={onRemoveNote}
                />
              </div>
            ))}
        {ghost ? null : (
          <>
            <span
              className="tx-grip tx-grip-w"
              title="按住拖动改页面宽度：正文跟着重排，装不下的推到下一页（一张纸最多一屏）"
              onPointerDown={startResize('w')}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <span
              className="tx-grip tx-grip-h"
              title="按住拖动改页面高度：正文跟着重排，装不下的推到下一页（一张纸最多一屏）"
              onPointerDown={startResize('h')}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <span
              className="tx-grip tx-grip-wh"
              title="按住拖动同时改页面的宽和高"
              onPointerDown={startResize('wh')}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            {sel ? (
              <SelectionBar
                sel={sel}
                onHighlight={(range, quote) => void onHighlight(range, quote)}
                onAnnotate={onAnnotate}
                onClose={clearSel}
              />
            ) : null}
          </>
        )}
      </div>
    )
  }

  return (
    <div ref={attachStage} className={cn('reader-page-area h-full overflow-auto', turning && 'is-turning')}>
      {/* 与书页同一套动效结构：当前页留在文档流里撑尺寸，残影浮在它上面 */}
      <div className="mw-book-frame">
        <div className={cn('mw-book', turning && 'is-turning', turning?.dir === -1 && 'is-reverse')}>
          <div className="mw-layer mw-layer-in">{buildSheet(page, false)}</div>
          {turning ? <div className="mw-layer mw-layer-out">{buildSheet(turning.from, true)}</div> : null}
        </div>
      </div>
    </div>
  )
}

/* ==================== 右侧面板：目录 / 缩略图 / 书签重点 / 注释 / 查找 / 本页文字 ==================== */
const PANEL_TABS: { key: PanelTab; label: string }[] = [
  { key: 'thumbs', label: '页面' },
  { key: 'outline', label: '目录' },
  { key: 'notes', label: '注释' },
  { key: 'find', label: '查找' },
  { key: 'page-text', label: '本页' }
]

function ReaderPanel(props: {
  tab: PanelTab
  onTab: (tab: PanelTab | null) => void
  info: NoteDocInfo
  /** 当前阅读方式：书页专属的标签在文字视图里要收起 */
  view: NoteViewMode
  pdf: PdfDocInfo | null
  page: number
  pageCount: number
  marks: NoteMark[]
  onClose: () => void
  onJump: (page: number) => void
  onRemoveMark: (id: number) => void
  /** 给指定页加/去书签（缩略图角上直接点） */
  onToggleMark: (kind: NoteMarkKind, page: number) => void
  onCompose: (quote: string) => void
}): JSX.Element {
  const { tab, onTab, info, view, pdf, page, pageCount, marks, onClose, onJump, onRemoveMark, onToggleMark, onCompose } = props
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ page: number; snippet: string }[]>([])
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState('')
  const [thumbLimit, setThumbLimit] = useState(60)
  /** 「页面」侧栏：全部页面 / 只看加过书签与重点的页面 */
  const [thumbOnly, setThumbOnly] = useState<'all' | 'marked'>('all')
  const [headings, setHeadings] = useState<{ title: string; page: number }[]>([])

  // 目录：PDF 用书签；HTML 解析标题；文本用 Markdown 标题
  useEffect(() => {
    if (pdf) {
      if (pdf.outline.length > 0) setHeadings(pdf.outline.filter((item) => item.title).map((item) => ({ title: item.title, page: item.page })))
      else setHeadings([])
      return
    }
    if (view === 'rich' && info.html) {
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
    if (view === 'rich') {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="rich-view"]')
      frame?.contentWindow?.focus()
      ;(frame?.contentWindow as unknown as { find?: (term: string) => boolean } | undefined)?.find?.(query)
      return
    }
    ;(window as unknown as { find?: (term: string) => boolean }).find?.(query)
  }

  const jumpToHeading = (title: string, target: number): void => {
    if (view === 'text') {
      const node = [...document.querySelectorAll('.reader-text h1, .reader-text h2, .reader-text h3, .reader-text h4')].find(
        (item) => (item.textContent ?? '').trim() === title
      )
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    onJump(target || 1)
  }

  /** 注释列表带上荧光标记：不列出来的话，涂错了就没地方取消 */
  const notes = marks.filter((mark) => mark.kind === 'note' || mark.kind === 'highlight')
  const markedPages = [...new Set(marks.filter((mark) => mark.kind === 'bookmark' || mark.kind === 'star').map((mark) => mark.page))]
    .filter((number) => number >= 1)
    .sort((a, b) => a - b)
  const thumbPages =
    thumbOnly === 'marked'
      ? markedPages
      : Array.from({ length: Math.min(thumbLimit, pdf?.pageCount ?? 0) }, (_, index) => index + 1)
  const tabs = PANEL_TABS.filter((item) => item.key !== 'thumbs' || (!!pdf && view === 'pages')).filter(
    (item) => item.key !== 'page-text' || (!!pdf && view === 'pages')
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
          <div className="space-y-2">
            <div className="seg-base flex">
              {([
                { key: 'all', label: '全部页面', count: pdf.pageCount },
                { key: 'marked', label: '仅书签', count: markedPages.length }
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setThumbOnly(item.key)}
                  className={cn(
                    'flex-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] transition-colors',
                    thumbOnly === item.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.label}
                  <span className="ml-1 tabular-nums opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
            {thumbOnly === 'marked' && markedPages.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                还没有书签页。读的时候点顶上的书签（B）或标为重点页（S），这一页就会出现在这里。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {thumbPages.map((number) => (
                  <button
                    key={number}
                    type="button"
                    onClick={() => onJump(number)}
                    className={cn(
                      'relative rounded-lg border p-1 transition-colors',
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
                    {markedPages.includes(number) ? (
                      <span
                        role="button"
                        tabIndex={0}
                        title="取消这一页的书签与重点"
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleMark('bookmark', number)
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && onToggleMark('bookmark', number)}
                        className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded bg-muted/90 text-tint-primary"
                      >
                        <BookmarkCheck className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {thumbOnly === 'all' && thumbLimit < pdf.pageCount ? (
              <button
                type="button"
                onClick={() => setThumbLimit((value) => value + 120)}
                className="w-full rounded-lg border border-dashed border-border px-2 py-3 text-[11px] text-muted-foreground hover:text-foreground"
              >
                还有 {pdf.pageCount - thumbLimit} 页，点击继续加载缩略图
              </button>
            ) : null}
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
              给第 {page} 页写注释（E）· 可圈住局部，文字页还能选中一段再标注
            </button>
            {notes.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">还没有注释。圈住一块或选中一段文字写下的注释，会带着原文一起存，点纸上的标记就能就地展开。</p>
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
  const Icon = mark.kind === 'star' ? Star : mark.kind === 'bookmark' ? Bookmark : mark.kind === 'highlight' ? Highlighter : NotebookPen
  /** 圈出来 / 选中一段的批注：标题前面写清来历，一眼看得出不是整页注释 */
  const inked = mark.kind !== 'note' ? false : mark.region !== ''
  return (
    <div className="group rounded-lg border border-border px-2 py-1.5">
      <button type="button" onClick={() => onJump(mark.page || 1)} className="flex w-full items-start gap-2 text-left">
        <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', mark.kind === 'star' ? 'fill-current text-tint-warning' : 'text-tint-primary')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium text-foreground">
            {mark.kind === 'highlight' ? '荧光标记' : inked ? noteKindLabel(mark) : mark.page > 0 ? `第 ${mark.page} 页` : '正文'}
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
  /** 从纸面上圈了一块过来：不自动带整页原文，只写这块的批注 */
  ink?: boolean
  /** 选中一段正文带过来的注释 */
  ranged?: boolean
  initialQuote: string
  currentQuote: () => Promise<string>
  onCancel: () => void
  onSave: (body: string, quote: string) => void
}): JSX.Element {
  const { page, ink, ranged, initialQuote, currentQuote, onCancel, onSave } = props
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState(initialQuote)

  useEffect(() => {
    if (initialQuote !== '' || ink) return
    void currentQuote().then((text) => setQuote((value) => (value === '' ? text : value)))
  }, [initialQuote, ink, currentQuote])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6" onMouseDown={onCancel}>
      <div
        className="glass-card w-full max-w-lg p-4"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="section-title text-sm font-semibold text-foreground">
          {ranged
            ? `给第 ${page} 页选中的这段文字写注释`
            : ink
              ? `给第 ${page} 页圈出来的部分写批注`
              : `给第 ${page} 页写注释`}
        </p>
        {ranged ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            注释会跟着这段文字存：正文里标出主色下带，点它就在这段旁边展开。
          </p>
        ) : ink ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            批注会和这个圈一起存下来：纸面上保留你画的框，边上按编号列出内容。
          </p>
        ) : null}
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

/* ==================== 选页用的缩略图按钮（对比与提取共用） ==================== */
function PageThumbPicker(props: {
  pdf: PdfDocInfo
  number: number
  width: number
  selected: boolean
  onClick: () => void
}): JSX.Element {
  const { pdf, number, width, selected, onClick } = props
  const height = Math.round((width * pdf.baseHeight) / pdf.baseWidth)
  return (
    <button
      type="button"
      onClick={onClick}
      title={'第 ' + number + ' 页'}
      className={cn(
        'shrink-0 rounded-lg border p-1 transition-colors',
        selected ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/60'
      )}
    >
      <span className="block overflow-hidden rounded bg-white" style={{ width, height }}>
        <PdfPageView pdf={pdf} pageNumber={number} scale={width / pdf.baseWidth} rotation={0} lazy priority={selected ? 20 : 2} />
      </span>
      <span
        className={cn(
          'mt-1 block text-center text-[10px] tabular-nums',
          selected ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}
      >
        {number}
      </span>
    </button>
  )
}

/** 浮层通用外壳：点背景关闭、Esc 优先给浮层用（capture 抢在页面快捷键之前） */
function ReaderOverlay(props: { onClose: () => void; children: ReactNode; width?: string }): JSX.Element {
  const { onClose, children, width = 'max-w-6xl' } = props
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="mw-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div
        className={cn('glass-card flex max-h-full w-full flex-col overflow-hidden', width)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ==================== 页面对比：整页工作台，可自由拖动、单独放大细看 ==================== */
/** 一张对比页的状态：纸框在画布上的位置尺寸 + 内容的放大倍数与平移 */
interface CompareCard {
  x: number
  y: number
  w: number
  h: number
  zoom: number
  panX: number
  panY: number
  /** 显示优先级：数大的盖在数小的上面，可以手动调 */
  z: number
  /** panX / panY = 纸框自己的滚动位置（内容比框大时才能滚，见 clampScroll） */
}
/** 画布重画倍率走 1.15 阶梯：缩放不必每一档都重画，阶梯之间用 CSS 缩放补差，拖动才跟手 */
const CMP_LADDER = 1.15
const CMP_MIN_ZOOM = 0.5
const CMP_MAX_ZOOM = 8
/** 对比画布内边距、纸框间距、标题条高度 */
const CMP_PAD = 18
const CMP_GAP = 14
const CMP_BAR = 28
/** 纸框内边距：要和 index.css 里 .cmp-frame 的 padding 保持一致（放大锚点要按它换算） */
const CMP_FRAME_PAD = 8

/** 把任意倍率吸附到 1.15 的阶梯上（pdf.js 只按 0.01 的粒度缓存画布） */
function ladder(value: number): number {
  const step = Math.round(Math.log(Math.max(0.02, value)) / Math.log(CMP_LADDER))
  return Math.max(0.04, Math.round(Math.pow(CMP_LADDER, step) * 100) / 100)
}
/** 单页画布的像素预算：同屏最多四页，放大到极限时把画布压在 ~1200 万像素内，
    多出来的倍率交给 CSS 缩放补，宁可略微发虚也不吃掉几个 G 的内存 */
function budgetScale(baseWidth: number, baseHeight: number, want: number): number {
  const pixels = baseWidth * baseHeight * want * want
  const cap = 12_000_000
  return pixels <= cap ? want : Math.max(0.2, (want * Math.sqrt(cap)) / Math.sqrt(pixels))
}

/** 1-3 页横排、4 页两行两列；纸框按页面比例在各自格子里居中 */
function compareSlots(count: number, area: { width: number; height: number }, ratio: number): CompareCard[] {
  const cols = count >= 4 ? 2 : Math.max(1, count)
  const rows = count >= 4 ? 2 : 1
  const cellW = (area.width - CMP_PAD * 2 - CMP_GAP * (cols - 1)) / cols
  /* 每张纸上面还有一条标题栏：格子高度要先扣掉它，
     否则最后一行的下沿会被画布裁掉，放大到底也拖不出纸的最下面一段 */
  const cellH = (area.height - CMP_PAD * 2 - CMP_GAP * (rows - 1) - CMP_BAR) / rows
  const w = Math.max(140, Math.min(cellW, cellH * ratio))
  const h = Math.max(100, w / ratio)
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    return {
      x: Math.round(CMP_PAD + col * (cellW + CMP_GAP) + (cellW - w) / 2),
      y: Math.round(CMP_PAD + row * (cellH + CMP_GAP) + (cellH - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
      zoom: 1,
      panX: 0,
      panY: 0,
      z: count - index
    }
  })
}

/** 纸框可滚范围按「框尺寸 + 放大倍率」缓存：这两项没变时，DOM 量出来的最大值才是准的 */
function cmpKey(card: CompareCard): string {
  return card.w + 'x' + card.h + '@' + card.zoom
}

/** 这几页的层级编号是不是撞了（撞了就说明该重新编号） */
function zCollides(map: Record<number, CompareCard>, list: number[]): boolean {
  const seen = new Set<number>()
  return list.some((page) => {
    const z = map[page]?.z
    if (z === undefined || seen.has(z)) return true
    seen.add(z)
    return false
  })
}

/**
 * 重新编出一串互不相同的层级（1 = 最底下），原有的相对叠放次序保持不变。
 * 挑页 / 移出之后特别容易撞上：两张纸的 z 相等时，「上移 / 下移一层」是在交换两个一样的数，
 * 点了自然毫无反应 —— 用户三轮反馈的「上下层无效」就是这么来的。
 */
function normalizeZ(map: Record<number, CompareCard>, list: number[]): Record<number, CompareCard> {
  const order = list.filter((page) => map[page]).sort((a, b) => map[a].z - map[b].z || a - b)
  order.forEach((page, index) => {
    const card = map[page]
    const z = index + 1
    if (card.z !== z) map[page] = { ...card, z }
  })
  return map
}

/** 纸框不许跑出画布：跑出去的那部分既看不见也拖不回来 */
function clampCard(card: CompareCard, area: { width: number; height: number }): CompareCard {
  if (area.width < 40 || area.height < 40) return card
  const w = Math.min(card.w, Math.max(140, area.width - 8))
  const h = Math.min(card.h, Math.max(100, area.height - CMP_BAR - 8))
  return {
    ...card,
    w,
    h,
    x: Math.round(Math.min(Math.max(0, card.x), Math.max(0, area.width - w))),
    y: Math.round(Math.min(Math.max(0, card.y), Math.max(0, area.height - CMP_BAR - h)))
  }
}

function CompareOverlay(props: {
  pdf: PdfDocInfo
  pages: number[]
  pageCount: number
  limit: number
  onClose: () => void
  onChange: (pages: number[]) => void
  onGo: (page: number) => void
}): JSX.Element {
  const { pdf, pages, pageCount, limit, onClose, onChange, onGo } = props
  const canvasRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [cards, setCards] = useState<Record<number, CompareCard>>({})
  const [drawer, setDrawer] = useState(true)
  const [stripLimit, setStripLimit] = useState(60)
  const drag = useRef<{ mode: 'move' | 'pan' | 'resize'; page: number; sx: number; sy: number; base: CompareCard } | null>(null)
  const ratio = pdf.baseWidth / pdf.baseHeight

  /* Esc 先关对比层，再谈退出全屏（capture 抢在页面快捷键之前） */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  /* 画布尺寸以真实盒子为准：整页工作台不再拿 window 内部尺寸去猜，也就不会被任何东西盖住 */
  useEffect(() => {
    const node = canvasRef.current
    if (!node) return undefined
    const measure = (): void => setArea({ width: node.clientWidth, height: node.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /* 新挑进来的页补上默认格子，移出的页清掉状态；已经拖过的页保持用户摆的位置 */
  useEffect(() => {
    if (area.width < 60 || area.height < 60) return
    setCards((prev) => {
      const known = Object.keys(prev).length === pages.length && pages.every((page) => prev[page])
      if (known && !zCollides(prev, pages)) return prev
      const slots = compareSlots(pages.length, area, ratio)
      const next: Record<number, CompareCard> = {}
      pages.forEach((page, index) => {
        next[page] = clampCard(prev[page] ?? slots[index], area)
      })
      return normalizeZ(next, pages)
    })
  }, [pages, area, ratio])

  /** 每个纸框「实际能滚多远」，由 DOM 量出来（见下面的 useLayoutEffect） */
  const scrollMax = useRef<Record<number, { key: string; x: number; y: number }>>({})
  /** 这一页内容现在占多大（CSS 像素）：适配尺寸再乘这一页自己的放大倍率 */
  const contentSize = useCallback(
    (card: CompareCard): { width: number; height: number } => {
      const fit = Math.min(card.w / pdf.baseWidth, card.h / pdf.baseHeight)
      return { width: pdf.baseWidth * fit * card.zoom, height: pdf.baseHeight * fit * card.zoom }
    },
    [pdf]
  )

  /**
   * 平移改成「纸框自己滚动」而不是位移：位移那套要自己算钳制范围，纸框一旦比画布矮就永远拖不到底
   * （用户反馈的「只能看到左上那块」）。
   * 能滚多远改成优先采信 DOM 量出来的真值（见 scrollMax）：自己按公式推会把纸框那圈内边距漏掉，
   * 于是右下角总差几像素拖不到。
   */
  const clampScroll = useCallback(
    (page: number, card: CompareCard, left: number, top: number): { panX: number; panY: number } => {
      const measured = scrollMax.current[page]
      let maxX: number
      let maxY: number
      if (measured && measured.key === cmpKey(card)) {
        // 框和倍率都没变：直接采信 DOM 的真实滚动范围
        maxX = measured.x
        maxY = measured.y
      } else {
        // 刚改过倍率或框幅，DOM 还是旧的，先用公式兜一下（渲染完会被 DOM 纠正）
        const size = contentSize(card)
        maxX = Math.max(0, size.width - card.w)
        maxY = Math.max(0, size.height - card.h)
      }
      return {
        panX: Math.max(0, Math.min(maxX, left)),
        panY: Math.max(0, Math.min(maxY, top))
      }
    },
    [contentSize]
  )

  /** 单独放大某一页：带锚点时指针指着的那一点原地不动，放大后按住就能拖着看 */
  const setCardZoom = useCallback(
    (page: number, factor: number, origin?: { x: number; y: number }): void => {
      setCards((prev) => {
        const card = prev[page]
        if (!card) return prev
        const zoom = Math.max(CMP_MIN_ZOOM, Math.min(CMP_MAX_ZOOM, card.zoom * factor))
        if (Math.abs(zoom - card.zoom) < 0.0005) return prev
        const times = zoom / card.zoom
        /* 缩放以纸框边框左上角为原点（CSS zoom 就是这样），而内容前面还有一圈内边距：
           换算时先减掉这圈再贴回去，指针指着的那一点才真不动 */
        const ax = card.w / 2 + (origin ? origin.x : 0)
        const ay = card.h / 2 + (origin ? origin.y : 0)
        const spot = clampScroll(
          page,
          { ...card, zoom },
          (card.panX + ax - CMP_FRAME_PAD) * times + CMP_FRAME_PAD - ax,
          (card.panY + ay - CMP_FRAME_PAD) * times + CMP_FRAME_PAD - ay
        )
        return { ...prev, [page]: { ...card, zoom, panX: spot.panX, panY: spot.panY } }
      })
    },
    [clampScroll]
  )

  /* 滚轮缩放：React 的 onWheel 是 passive 监听，拦不住浏览器自己的页面缩放，这里挂原生监听 */
  useEffect(() => {
    const node = canvasRef.current
    if (!node) return undefined
    const onWheel = (event: WheelEvent): void => {
      const host = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cmp-page]')
      if (!host) return
      event.preventDefault()
      const page = Number(host.dataset.cmpPage)
      const rect = host.getBoundingClientRect()
      setCardZoom(page, Math.exp(-event.deltaY * 0.0018), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      })
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [setCardZoom])

  /** 中键：不管这一页放大到多少倍，按住都能把整张纸拖走（左键放大后是平移画面） */
  const middleDown = (event: ReactMouseEvent<HTMLElement>): void => {
    if (event.button === 1) event.preventDefault()
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>, page: number, mode: 'move' | 'pan' | 'resize'): void => {
    const middle = event.button === 1
    if (event.button !== 0 && !middle) return
    if ((event.target as HTMLElement | null)?.closest('button')) return
    /* 别抢纸框自己的滚动条：指针落在滚动条那一条上就不当作拖动。
       判据要按纸框自己的矩形量：offsetX 是相对「被命中的那个元素」算的，
       放大后按住纸面时它比纸框宽得多，拿它当判据会把右下那一大片全判成滚动条，
       结果就是「放大后右下角左键拖不动、中键也拖不动，但滚动条好使」（用户反馈） */
    if (mode === 'pan') {
      const frame = event.currentTarget
      const box = frame.getBoundingClientRect()
      if (event.clientX - box.left > frame.clientWidth || event.clientY - box.top > frame.clientHeight) return
    }
    const card = cards[page]
    if (!card) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    /* 只有真要把整张纸搬走（拖标题条 / 中键）才顺手置顶；
       左键按住纸面是「平移细看」，以前连这个也置顶，手动调好的上下层一点就白调 */
    if (mode === 'move' || middle) raise(page)
    drag.current = { mode: middle ? 'move' : mode, page, sx: event.clientX, sy: event.clientY, base: card }
  }

  const onDragMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.sx
    const dy = event.clientY - current.sy
    setCards((prev) => {
      const card = prev[current.page]
      if (!card) return prev
      const base = current.base
      if (current.mode === 'move') {
        return { ...prev, [current.page]: clampCard({ ...card, x: base.x + dx, y: base.y + dy }, area) }
      }
      if (current.mode === 'resize') {
        const w = Math.max(140, Math.min(area.width - 8, base.w + dx))
        const h = Math.max(100, Math.min(Math.max(120, area.height - CMP_BAR - 8), base.h + dy))
        const spot = clampScroll(current.page, { ...base, w, h }, base.panX, base.panY)
        return {
          ...prev,
          [current.page]: clampCard({ ...card, w, h, panX: spot.panX, panY: spot.panY }, area)
        }
      }
      /* 按住纸面往哪拖，内容就往哪走：滚动位置是反过来的 */
      const spot = clampScroll(current.page, base, base.panX - dx, base.panY - dy)
      return { ...prev, [current.page]: { ...card, panX: spot.panX, panY: spot.panY } }
    })
  }

  const endDrag = (): void => {
    drag.current = null
  }

  /** 置顶 / 上移一层 / 下移一层 / 置底：只在当前这几页之间比大小 */
  const raise = (page: number): void => {
    setCards((prev) => {
      const card = prev[page]
      if (!card) return prev
      const top = Math.max(...pages.map((item) => prev[item]?.z ?? 0))
      if (card.z === top) return prev
      return { ...prev, [page]: { ...card, z: top + 1 } }
    })
  }

  const shiftZ = (page: number, step: 1 | -1): void => {
    setCards((prev) => {
      const order = pages
        .map((item) => ({ page: item, z: prev[item]?.z ?? 0 }))
        .sort((a, b) => b.z - a.z)
      const index = order.findIndex((item) => item.page === page)
      /* order 是「从上往下」排的：上移一层要换的是前一个（index - 1），之前写反了，
         结果最上面那张点了没反应、下面的点了反而沉到底，看着就是「层级功能不能用」 */
      const swapWith = order[index - step]
      if (index < 0 || !swapWith) return prev
      const mine = prev[page]
      const theirs = prev[swapWith.page]
      if (!mine || !theirs) return prev
      return { ...prev, [page]: { ...mine, z: theirs.z }, [swapWith.page]: { ...theirs, z: mine.z } }
    })
  }

  /** 从上往下的页序（排在第一个的就盖在最上面）：角标与上移 / 下移的可用状态都读它 */
  const stackOrder = useMemo(
    () => [...pages].sort((a, b) => (cards[b]?.z ?? 0) - (cards[a]?.z ?? 0)),
    [pages, cards]
  )
  /** 这一页在第几层（1 = 最上面） */
  const layerNo = (page: number): number => stackOrder.indexOf(page) + 1

  /** 纸框的滚动位置以 DOM 为准：状态变了写回去，用户自己滚了也同步回状态 */
  const frameRefs = useRef<Record<number, HTMLDivElement | null>>({})
  useLayoutEffect(() => {
    const fixes: Record<number, { panX: number; panY: number }> = {}
    pages.forEach((page) => {
      const el = frameRefs.current[page]
      const card = cards[page]
      if (!el || !card) return
      /* 量的是 DOM 的真实滚动范围：滚动容器末端那圈 padding 各家浏览器算不算进可滚范围不一样，
         自己按公式推的总差那么一截，于是右下两个角怎么拖都差一点（用户反馈的「看不全」） */
      scrollMax.current[page] = {
        key: cmpKey(card),
        x: Math.max(0, el.scrollWidth - el.clientWidth),
        y: Math.max(0, el.scrollHeight - el.clientHeight)
      }
      const max = scrollMax.current[page]
      const wantX = Math.min(card.panX, max.x)
      const wantY = Math.min(card.panY, max.y)
      if (Math.abs(el.scrollLeft - wantX) > 0.5) el.scrollLeft = wantX
      if (Math.abs(el.scrollTop - wantY) > 0.5) el.scrollTop = wantY
      // 期望值超出实际能滚的范围就顺手收回状态：留着超大值，下次起拖会先空拖一段才动
      if (Math.abs(wantX - card.panX) > 0.5 || Math.abs(wantY - card.panY) > 0.5) {
        fixes[page] = { panX: wantX, panY: wantY }
      }
    })
    if (Object.keys(fixes).length > 0) {
      setCards((prev) => {
        const next = { ...prev }
        Object.entries(fixes).forEach(([page, spot]) => {
          const card = next[Number(page)]
          if (card) next[Number(page)] = { ...card, ...spot }
        })
        return next
      })
    }
  }, [cards, pages])
  const onFrameScroll = (page: number, el: HTMLDivElement): void => {
    setCards((prev) => {
      const card = prev[page]
      if (!card) return prev
      const spot = clampScroll(page, card, el.scrollLeft, el.scrollTop)
      if (Math.abs(spot.panX - card.panX) < 0.5 && Math.abs(spot.panY - card.panY) < 0.5) return prev
      return { ...prev, [page]: { ...card, panX: spot.panX, panY: spot.panY } }
    })
  }

  const resetCard = (page: number): void => {
    setCards((prev) => {
      const card = prev[page]
      if (!card) return prev
      return { ...prev, [page]: { ...card, zoom: 1, panX: 0, panY: 0 } }
    })
  }

  /** 重排：回到「1-3 页横排、4 页田字格」的默认摆位 */
  const relayout = (): void => {
    if (pages.length === 0 || area.width < 60 || area.height < 60) return
    const slots = compareSlots(pages.length, area, ratio)
    setCards(
      Object.fromEntries(pages.map((page, index): [number, CompareCard] => [page, clampCard(slots[index], area)]))
    )
  }

  /** 叠放：把这几页错开摞成一叠 —— 不重叠的话，上下层怎么调都看不出来（用户反馈的「无效」有一半是这个原因） */
  const stack = (): void => {
    if (pages.length < 2 || area.width < 60 || area.height < 60) return
    const slots = compareSlots(pages.length, area, ratio)
    const base = slots[0]
    setCards((prev) => {
      const next: Record<number, CompareCard> = {}
      pages.forEach((page, index) => {
        const card = prev[page]
        if (!card) return
        next[page] = clampCard(
          { ...card, x: base.x + index * 30, y: base.y + index * 26, w: base.w, h: base.h },
          area
        )
      })
      return normalizeZ(next, pages)
    })
  }

  const toggle = (number: number): void => {
    if (pages.includes(number)) {
      onChange(pages.filter((item) => item !== number))
      return
    }
    // 超出上限就挤掉最早选的那一页，始终保留最近挑的几页
    onChange([...pages, number].sort((a, b) => a - b).slice(-limit))
  }

  return createPortal(
    <div className="cmp-shell reader-stage fixed inset-0 z-[70] flex flex-col">
      <header className="cmp-bar flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">页面对比</p>
          <p className="truncate text-[11px] text-muted-foreground">
            拖标题条或中键搬整页 · 滚轮或 −／+ 单独放大 · 放大后左键按住纸面拖到任意一角 · 右下角拉大纸框 · 上下调层（两页得先重叠，点「叠放」最直观）
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-1 text-[11px] tabular-nums text-muted-foreground">
            {pages.length} / {limit} 页
          </span>
          <Button size="sm" variant="ghost" icon={<LayoutGrid className="h-3.5 w-3.5" />} onClick={relayout}>
            重排
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Layers className="h-3.5 w-3.5" />}
            onClick={stack}
            disabled={pages.length < 2}
            title="把挑出来的页错开摞成一叠，方便看谁盖着谁"
          >
            叠放
          </Button>
          <Button
            size="sm"
            variant={drawer ? 'secondary' : 'ghost'}
            icon={<Images className="h-3.5 w-3.5" />}
            onClick={() => setDrawer((value) => !value)}
          >
            挑页
          </Button>
          <IconButton label="关闭对比（Esc）" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
        {pages.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">还没挑页：在下方缩略图里点两页就能并排比</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setDrawer(true)}>
                去挑页
              </Button>
            </div>
          </div>
        ) : null}

        {pages.map((page) => {
          const card = cards[page]
          if (!card) return null
          const fit = Math.min(card.w / pdf.baseWidth, card.h / pdf.baseHeight)
          const renderScale = ladder(budgetScale(pdf.baseWidth, pdf.baseHeight, fit * card.zoom))
          const cssScale = (fit * card.zoom) / renderScale
          const panned = card.zoom > 1.02
          return (
            <div
              key={page}
              className="cmp-card absolute select-none"
              style={{ left: card.x, top: card.y, width: card.w, zIndex: card.z }}
              onMouseDown={middleDown}
            >
              <div
                className="cmp-card-bar flex items-center gap-1 border-b"
                style={{ height: CMP_BAR }}
                onPointerDown={(event) => startDrag(event, page, 'move')}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <MoveHorizontal className="h-3 w-3 shrink-0 opacity-45" />
                <button
                  type="button"
                  className="cmp-layer shrink-0"
                  title={
                    '第 ' + layerNo(page) + ' / ' + pages.length + ' 层（1 在最上面）：点一下把它提到最上层'
                  }
                  onClick={() => raise(page)}
                >
                  {layerNo(page)}
                </button>
                <button
                  type="button"
                  className="cmp-jump max-w-[7rem] truncate"
                  title={'翻到第 ' + page + ' 页'}
                  onClick={() => onGo(page)}
                >
                  第 {page} 页
                </button>
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button type="button" className="cmp-ico" title="缩小这一页" onClick={() => setCardZoom(page, 1 / 1.3)}>
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-11 text-center text-[10px] tabular-nums opacity-80">
                    {Math.round(card.zoom * 100)}%
                  </span>
                  <button type="button" className="cmp-ico" title="放大这一页" onClick={() => setCardZoom(page, 1.3)}>
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="cmp-ico"
                    title={layerNo(page) <= 1 ? '已经在最上面了' : '上移一层（盖到前面那页上面）'}
                    disabled={layerNo(page) <= 1}
                    onClick={() => shiftZ(page, 1)}
                  >
                    <ArrowUpToLine className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="cmp-ico"
                    title={layerNo(page) >= pages.length ? '已经在最下面了' : '下移一层（让到后面那页下面）'}
                    disabled={layerNo(page) >= pages.length}
                    onClick={() => shiftZ(page, -1)}
                  >
                    <ArrowDownToLine className="h-3 w-3" />
                  </button>
                  <button type="button" className="cmp-ico" title="复位这一页" onClick={() => resetCard(page)}>
                    <RotateCcw className="h-3 w-3" />
                  </button>
                  <button type="button" className="cmp-ico" title="移出对比" onClick={() => toggle(page)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>

              <div
                ref={(el) => {
                  frameRefs.current[page] = el
                }}
                data-cmp-page={page}
                className={cn('cmp-frame', panned ? 'is-pannable' : 'is-movable')}
                style={{ width: card.w, height: card.h }}
                onScroll={(event) => onFrameScroll(page, event.currentTarget)}
                onPointerDown={(event) => startDrag(event, page, panned ? 'pan' : 'move')}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setCardZoom(
                    page,
                    panned ? 1 / card.zoom : 2.4 / card.zoom,
                    {
                      x: event.clientX - rect.left - rect.width / 2,
                      y: event.clientY - rect.top - rect.height / 2
                    }
                  )
                }}
              >
                {/* 内容用 CSS zoom 真放大（会撑开尺寸），纸框自己出滚动条：
                    这样无论放大到多少倍，四个角都一定能拖到、看到，不再依赖手算的位移钳制 */}
                <div className="cmp-page" style={{ zoom: cssScale }}>
                  <PdfPageView pdf={pdf} pageNumber={page} scale={renderScale} rotation={0} priority={30} />
                </div>
              </div>
              {/* 拉手放在纸框外面：框现在会滚动，放在里面会跟着内容跑掉 */}
              <span
                className="cmp-grip"
                title="拖动调整这一页的纸框大小"
                onPointerDown={(event) => startDrag(event, page, 'resize')}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </div>
          )
        })}
      </div>

      {drawer ? (
        <footer className="cmp-drawer shrink-0 border-t border-border px-3 py-2">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>从下面挑最多 {limit} 页，再点一次取消选择</span>
            {pages.length > 0 ? (
              <button type="button" className="cmp-jump" onClick={() => onChange([])}>
                全部移出
              </button>
            ) : null}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: Math.min(stripLimit, pageCount) }, (_, index) => index + 1).map((number) => (
              <PageThumbPicker
                key={number}
                pdf={pdf}
                number={number}
                width={72}
                selected={pages.includes(number)}
                onClick={() => toggle(number)}
              />
            ))}
            {stripLimit < pageCount ? (
              <button
                type="button"
                onClick={() => setStripLimit((value) => value + 120)}
                className="flex h-[104px] w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                还有 {pageCount - stripLimit} 页
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>,
    document.body
  )
}
/* ==================== 页面提取：任意几页拼成一份新资料 ==================== */
/** 把「1,3,5-8，11」这种写法解析成页码数组 */
function parsePageSpec(text: string, total: number): number[] {
  const picked = new Set<number>()
  for (const chunk of text.split(/[,，;；s]+/)) {
    if (chunk === '') continue
    const range = chunk.match(/^(\d+)\s*[-~—到]\s*(\d+)$/)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      for (let n = Math.min(from, to); n <= Math.max(from, to); n += 1) {
        if (n >= 1 && n <= total) picked.add(n)
      }
      continue
    }
    const single = Number(chunk)
    if (Number.isFinite(single) && single >= 1 && single <= total) picked.add(Math.round(single))
  }
  return [...picked].sort((a, b) => a - b)
}

function ExtractDialog(props: {
  pdf: PdfDocInfo
  noteId: number
  sourceTitle: string
  current: number
  onClose: () => void
  onHint: (message: string) => void
  onOpened: (note: Note) => void
}): JSX.Element {
  const { pdf, noteId, sourceTitle, current, onClose, onHint, onOpened } = props
  const [picked, setPicked] = useState<number[]>([current])
  const [spec, setSpec] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState('')
  const [gridLimit, setGridLimit] = useState(120)
  const pageCount = pdf.pageCount

  const sorted = useMemo(() => [...picked].sort((a, b) => a - b), [picked])
  const toggle = (number: number): void =>
    setPicked((list) => (list.includes(number) ? list.filter((item) => item !== number) : [...list, number]))

  const applySpec = (): void => {
    const list = parsePageSpec(spec, pageCount)
    if (list.length === 0) {
      onHint('没看懂这串页码，可以写 1,3,5-8')
      return
    }
    setPicked(list)
    onHint('已选中 ' + list.length + ' 页')
  }

  const run = async (mode: 'book' | 'file'): Promise<void> => {
    if (sorted.length === 0) {
      onHint('先勾选要提取的页面')
      return
    }
    setBusy(mode)
    try {
      const suggested = (title.trim() || sourceTitle + '（提取 ' + sorted.length + ' 页）') + '.pdf'
      const saveTo = mode === 'file' ? await api.note.pickSavePath(suggested) : undefined
      if (mode === 'file' && (saveTo ?? '') === '') {
        setBusy('')
        return
      }
      const result = await api.note.extractPages({ noteId, pages: sorted, title: title.trim(), saveTo })
      if (mode === 'file') {
        onHint(result.savedPath ? '已导出：' + result.savedPath : '导出失败，换个路径再试')
        setBusy('')
        return
      }
      onHint('已提取 ' + sorted.length + ' 页，正在翻开新资料')
      onOpened(result.note)
    } catch (error) {
      onHint(error instanceof Error ? error.message : String(error))
      setBusy('')
    }
  }

  return (
    <ReaderOverlay onClose={onClose} width="max-w-4xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">页面提取</p>
          <p className="truncate text-[11px] text-muted-foreground">
            从《{sourceTitle}》里挑任意几页，拼成一份新的 PDF 资料
          </p>
        </div>
        <IconButton label="关闭（Esc）" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <input
            value={spec}
            onChange={(event) => setSpec(event.target.value)}
            placeholder="按页码写，如 1,3,5-8"
            className="field-base h-8 min-w-[180px] flex-1 text-xs"
          />
          <Button size="sm" variant="secondary" onClick={applySpec}>
            套用
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked([current])}>
            只要当前页
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicked(Array.from({ length: pageCount }, (_, index) => index + 1))}
          >
            全选
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
            清空
          </Button>
          <span className="tabular-nums text-muted-foreground">已选 {sorted.length} 页</span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="flex flex-wrap gap-2 content-start rounded-lg border border-border bg-muted/20 p-2">
            {Array.from({ length: Math.min(gridLimit, pageCount) }, (_, index) => index + 1).map((number) => (
              <PageThumbPicker
                key={number}
                pdf={pdf}
                number={number}
                width={86}
                selected={picked.includes(number)}
                onClick={() => toggle(number)}
              />
            ))}
            {gridLimit < pageCount ? (
              <button
                type="button"
                onClick={() => setGridLimit((value) => value + 160)}
                className="flex h-[120px] w-28 shrink-0 items-center justify-center rounded-lg border border-dashed border-border px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                还有 {pageCount - gridLimit} 页，点击继续加载
              </button>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">新资料标题</p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={sourceTitle + '（提取 ' + sorted.length + ' 页）'}
              className="field-base mt-1 h-8 w-full text-xs"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              提取会原样搬运页面（矢量文字与图片都不重画），新资料单独存进书柜，
              原书不受影响；也可以直接另存成一份 PDF 文件。
            </p>
            {sorted.length > 0 ? (
              <p className="mt-2 max-h-24 overflow-y-auto break-words text-[11px] leading-relaxed text-muted-foreground">
                页码：{sorted.join('、')}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        {busy !== '' ? <Spinner className="mr-auto h-4 w-4" /> : null}
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy !== ''}>
          取消
        </Button>
        <Button size="sm" variant="secondary" loading={busy === 'file'} disabled={busy !== ''} onClick={() => void run('file')}>
          另存为 PDF 文件
        </Button>
        <Button size="sm" variant="primary" loading={busy === 'book'} disabled={busy !== ''} onClick={() => void run('book')}>
          提取并存为新书
        </Button>
      </footer>
    </ReaderOverlay>
  )
}
