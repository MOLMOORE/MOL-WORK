import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Star,
  X
} from 'lucide-react'
import type { NoteDocInfo, NoteMark, NoteMarkKind } from '@shared/types/domain'
import { Button, IconButton } from '../components/ui/Button'
import { Spinner } from '../components/ui/Feedback'
import { openPdf, pageText, renderPage, SCREEN_SCALE, type PdfDocInfo } from '../lib/pdf'
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
  const [flip, setFlip] = useState<FlipEffect>('book')
  const [panel, setPanel] = useState<PanelTab | null>('outline')
  const [marks, setMarks] = useState<NoteMark[]>([])
  const [fontSize, setFontSize] = useState(17)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [turning, setTurning] = useState<{ from: number; to: number; dir: 1 | -1 } | null>(null)
  const [composer, setComposer] = useState<{ kind: NoteMarkKind; quote: string } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const progressTimer = useRef<number | null>(null)

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
          const opened = await openPdf(doc.data)
          if (cancelled) return
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
    return () => {
      cancelled = true
    }
  }, [id])

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

  // ---------- 翻页动画：记下起止页，动画结束再清掉 ----------
  const pageRef = useRef(1)
  useEffect(() => {
    pageRef.current = page
  }, [page])

  const goPage = useCallback(
    (next: number, dir?: 1 | -1) => {
      const target = Math.min(Math.max(1, Math.round(next)), Math.max(1, pageCount))
      const current = pageRef.current
      if (target === current) return
      const direction = dir ?? (target > current ? 1 : -1)
      pageRef.current = target
      if (flip !== 'none') {
        setTurning({ from: current, to: target, dir: direction })
        window.setTimeout(() => setTurning(null), 620)
      }
      setPage(target)
    },
    [pageCount, flip]
  )

  const step = useCallback(
    (delta: number) => {
      const stride = layout === 'double' ? 2 : 1
      goPage(page + delta * stride, delta > 0 ? 1 : -1)
    },
    [goPage, layout, page]
  )

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

  // ---------- 快捷键 ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) {
        if (event.key === 'Escape') (target as HTMLElement).blur()
        return
      }
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault()
          step(1)
          break
        case 'ArrowDown':
          if (info?.viewMode !== 'text') {
            event.preventDefault()
            step(1)
          }
          break
        case ' ':
          event.preventDefault()
          step(event.shiftKey ? -1 : 1)
          break
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault()
          step(-1)
          break
        case 'ArrowUp':
          if (info?.viewMode !== 'text') {
            event.preventDefault()
            step(-1)
          }
          break
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
          setZoom((value) => Math.min(6, +(value * 1.15).toFixed(3)))
          break
        case '-':
        case '_':
          event.preventDefault()
          setZoom((value) => Math.max(0.2, +(value / 1.15).toFixed(3)))
          break
        case '0':
          event.preventDefault()
          setZoom(1)
          setFit('page')
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
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setPanel('find')
          }
          break
        case 'Escape':
          if (composer) setComposer(null)
          else if (panel) setPanel(null)
          else navigate(-1)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, goPage, pageCount, panel, composer, info, flip, navigate])

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

  // ---------- 缩放计算 ----------
  const fitScale = useMemo(() => {
    if (!pdf) return 1
    const pad = 56
    const w = Math.max(120, stageSize.width - pad)
    const h = Math.max(120, stageSize.height - pad)
    const base = layout === 'double' ? pdf.baseWidth * 2 + 16 : pdf.baseWidth
    if (fit === 'width') return w / base
    if (fit === 'page') return Math.min(w / base, h / pdf.baseHeight)
    return SCREEN_SCALE
  }, [pdf, stageSize, fit, layout])
  const scale = Math.max(0.15, Math.min(8, fitScale * zoom))

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
      <header className="reader-bar flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
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
            <div className="hidden items-center gap-1 lg:flex">
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
              <IconButton
                label="缩小（-）"
                onClick={() => setZoom((value) => Math.max(0.2, +(value / 1.15).toFixed(3)))}
              >
                <Minus className="h-3.5 w-3.5" />
              </IconButton>
              <span className="w-12 text-center text-[11px] tabular-nums text-foreground">
                {Math.round((scale / SCREEN_SCALE) * 100)}%
              </span>
              <IconButton
                label="放大（+）"
                onClick={() => setZoom((value) => Math.min(6, +(value * 1.15).toFixed(3)))}
              >
                <Plus className="h-3.5 w-3.5" />
              </IconButton>
            </div>
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
            className="reader-stage relative flex-1 overflow-hidden"
            data-flip={flip}
            data-layout={layout}
          >
            {info.viewMode === 'pages' && pdf ? (
              <PdfStage
                pdf={pdf}
                page={page}
                pageCount={pageCount}
                scale={scale}
                layout={layout}
                turning={turning}
                onJump={goPage}
              />
            ) : info.viewMode === 'rich' ? (
              <RichStage
                html={info.html ?? ''}
                page={page}
                zoom={scale / SCREEN_SCALE}
                turning={turning}
                onPageCount={setPageCount}
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
          </div>

          {/* 底部状态条：页码进度与快捷键提示 */}
          <footer className="reader-foot flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {info.viewMode === 'text' ? '连续阅读' : `第 ${page} / ${pageCount} 页`}
            </span>
            <span className="h-3 w-px bg-border" />
            <span>← → 翻页</span>
            <span>空格 下一页</span>
            <span>+ − 缩放</span>
            <span>B 书签</span>
            <span>S 重点</span>
            <span>E 注释</span>
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
    <div className="seg-base hidden xl:inline-flex" title={title}>
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
function PdfStage(props: {
  pdf: PdfDocInfo
  page: number
  pageCount: number
  scale: number
  layout: StageLayout
  turning: { from: number; to: number; dir: 1 | -1 } | null
  onJump: (page: number) => void
}): JSX.Element {
  const { pdf, page, pageCount, scale, layout, turning, onJump } = props

  if (layout === 'continuous') {
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
    return (
      <div className="reader-scroll h-full overflow-auto px-6 py-5">
        <div className="mx-auto flex w-fit flex-col gap-4">
          {pages.map((number) => (
            <PdfPageView key={number} pdf={pdf} pageNumber={number} scale={scale} active={number === page} lazy onJump={onJump} />
          ))}
        </div>
      </div>
    )
  }

  const double = layout === 'double'
  const left = double ? page : page
  const right = double ? page + 1 : 0
  const ghostPages = turning
    ? double
      ? [turning.from, turning.from + 1]
      : [turning.from]
    : []
  const currentPages = double ? [left, right] : [page]

  return (
    <div className="reader-page-area relative flex h-full items-center justify-center overflow-auto px-4 py-4">
      <div className={cn('mw-book', turning && 'is-turning', turning?.dir === -1 && 'is-reverse')}>
        {ghostPages.length > 0 && turning ? (
          <div className="mw-layer mw-layer-out" key={`out-${turning.from}`}>
            {ghostPages.map((number) =>
              number <= pageCount ? (
                <PdfPageView key={`o${number}`} pdf={pdf} pageNumber={number} scale={scale} ghost />
              ) : null
            )}
          </div>
        ) : null}
        <div className="mw-layer mw-layer-in" key={`in-${page}`}>
          {currentPages.map((number) =>
            number >= 1 && number <= pageCount ? (
              <PdfPageView key={`i${number}`} pdf={pdf} pageNumber={number} scale={scale} active />
            ) : (
              <div key={`blank${number}`} className="mw-page mw-page-blank" style={{ width: pdf.baseWidth * scale, height: pdf.baseHeight * scale }} />
            )
          )}
        </div>
      </div>
    </div>
  )
}

/** 单页画布：pdf.js 画到 canvas 再插进容器，尺寸变化自动重画 */
function PdfPageView(props: {
  pdf: PdfDocInfo
  pageNumber: number
  scale: number
  active?: boolean
  ghost?: boolean
  lazy?: boolean
  onJump?: (page: number) => void
}): JSX.Element {
  const { pdf, pageNumber, scale, active, ghost, lazy, onJump } = props
  const holder = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [visible, setVisible] = useState(!lazy)
  const rounded = Math.round(scale * 100) / 100

  useEffect(() => {
    if (!lazy || visible) return
    const node = holder.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '400px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [lazy, visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setState('loading')
    void (async () => {
      try {
        const { canvas } = await renderPage(pdf.doc, pageNumber, rounded)
        if (cancelled || !holder.current) return
        const host = holder.current
        // 先清掉自己上一轮的画布，再挂新的；host 里没有 React 节点，安全
        while (host.firstChild) host.removeChild(host.firstChild)
        host.appendChild(canvas)
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber, rounded, visible])

  useEffect(() => {
    if (active) holder.current?.parentElement?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      className={cn('mw-page', active && 'is-active', ghost && 'is-ghost', state === 'loading' && 'is-loading')}
      style={{ width: pdf.baseWidth * rounded, height: pdf.baseHeight * rounded }}
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
  turning: { from: number; to: number; dir: 1 | -1 } | null
  onPageCount: (count: number) => void
}): JSX.Element {
  const { html, page, zoom, turning, onPageCount } = props
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)

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
    return () => window.clearInterval(timer)
  }, [ready, zoom, onPageCount])

  // 翻页 = 把 iframe 滚到对应位置（保持原版式，不做二次排版）
  useEffect(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc || !ready) return
    try {
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
      <div className={cn('mw-book', turning && 'is-turning', turning?.dir === -1 && 'is-reverse')}>
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
                  <PdfPageView pdf={pdf} pageNumber={number} scale={116 / pdf.baseWidth} lazy />
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