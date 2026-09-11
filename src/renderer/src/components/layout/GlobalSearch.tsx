import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, FileText, Layers3, ListChecks, Loader2, Repeat, Search } from 'lucide-react'
import type { SearchHit } from '@shared/types/domain'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'

const KIND_META: Record<SearchHit['kind'], { label: string; icon: typeof ListChecks; tone: string }> = {
  task: { label: '任务', icon: ListChecks, tone: 'text-[#A5B4FC] bg-primary/15' },
  note: { label: '笔记', icon: FileText, tone: 'text-[#67E8F9] bg-info/15' },
  tool: { label: '工具', icon: Repeat, tone: 'text-[#FCD34D] bg-warning/15' },
  review: { label: '复习', icon: Layers3, tone: 'text-[#86EFAC] bg-success/15' },
  event: { label: '日程', icon: CalendarClock, tone: 'text-[#FCA5A5] bg-danger/15' },
  project: { label: '项目', icon: Layers3, tone: 'text-[#A5B4FC] bg-primary/15' }
}

export function GlobalSearch(): JSX.Element {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const text = keyword.trim()
    if (text === '') {
      setHits([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      const result = await api.search.query(text, 12)
      setHits(result)
      setCursor(0)
      setLoading(false)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [keyword])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<SearchHit['kind'], SearchHit[]>()
    for (const hit of hits) {
      const list = map.get(hit.kind) ?? []
      list.push(hit)
      map.set(hit.kind, list)
    }
    return Array.from(map.entries())
  }, [hits])

  const jump = (hit: SearchHit): void => {
    setOpen(false)
    setKeyword('')
    if (hit.kind === 'task') navigate('/tasks', { state: { taskId: hit.refId } })
    else if (hit.kind === 'note') navigate('/notes', { state: { noteId: hit.refId } })
    else if (hit.kind === 'tool') navigate('/tools', { state: { toolId: String(hit.refId) } })
    else if (hit.kind === 'event') navigate('/calendar', { state: { eventId: hit.refId } })
    else if (hit.kind === 'review') navigate('/notes', { state: { reviewId: hit.refId } })
    else navigate('/tasks')
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || hits.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => Math.min(hits.length - 1, value + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => Math.max(0, value - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[cursor]
      if (hit) jump(hit)
    }
  }

  const hasQuery = keyword.trim() !== ''

  return (
    <div ref={containerRef} className="relative w-full max-w-[520px]">
      <div
        className={cn(
          'flex h-9 items-center gap-2 rounded-xl border bg-input/60 px-3 transition-all duration-200',
          open && hasQuery ? 'border-primary/60 bg-input shadow-glow' : 'border-border'
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <input
          value={keyword}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setKeyword(event.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          placeholder="搜索任务、笔记或工具…"
          className="h-full flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
        />
        {hasQuery ? (
          <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">Esc</span>
        ) : (
          <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">↑↓</span>
        )}
      </div>

      {open && hasQuery ? (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-[440px] overflow-y-auto rounded-2xl border border-border/80 bg-surface/95 p-2 shadow-2xl backdrop-blur-2xl animate-scale-in">
          {hits.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">没有匹配结果，换个关键词试试</p>
          ) : null}

          {grouped.map(([kind, list]) => {
            const meta = KIND_META[kind]
            const Icon = meta.icon
            return (
              <div key={kind} className="mb-1 last:mb-0">
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {meta.label}
                </p>
                {list.map((hit) => {
                  const index = hits.indexOf(hit)
                  return (
                    <button
                      key={`${hit.kind}-${hit.refId}`}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => jump(hit)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                        index === cursor ? 'bg-primary/15' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className={cn('mt-0.5 rounded-lg p-1.5', meta.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">{hit.title}</span>
                        {hit.snippet ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hit.snippet}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{hit.meta}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
