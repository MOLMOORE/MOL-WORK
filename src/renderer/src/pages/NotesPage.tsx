import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BookOpen,
  Eye,
  FileText,
  GripVertical,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload
} from 'lucide-react'
import type { Note, NoteImportOptions, NoteImportProgress, NoteImportSummary, NoteKind, ReviewRating } from '@shared/types/domain'
import { IMPORT_FORMAT_GROUPS, TEXTUAL_DOC_FORMATS } from '@shared/constants'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Overlay'
import { Tabs } from '../components/ui/Tabs'
import { PageGrid } from '../components/layout/PageGrid'
import type { GridEntry } from '../components/layout/GridBoard'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useNoteStore } from '../stores/noteStore'
import { useTaskStore } from '../stores/taskStore'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { addDays, cn, formatDateTime, formatDay, relativeDay } from '../lib/utils'

/** 三种阅读模式的中文名：列表与编辑器共用 */
const VIEW_MODE_LABEL: Record<string, string> = { text: '文本', pages: '书页', rich: '排版' }
/** Word 家族虽然存了原版式书页，但打开时默认走文字视图：标签与摘要都按文字说 */
const isTextualDoc = (note: Note): boolean =>
  note.viewMode === 'pages' && TEXTUAL_DOC_FORMATS.includes((note.sourceFormat ?? '').toUpperCase())
const viewModeLabel = (note: Note): string =>
  isTextualDoc(note) ? '文字' : VIEW_MODE_LABEL[note.viewMode] ?? '文本'
/** 导入进度条上的阶段说明 */
const IMPORT_STAGE_LABEL: Record<string, string> = {
  queue: '排队中',
  parse: '读取并解析文档',
  render: '生成原版式页面',
  store: '写入书库与数据库',
  done: '完成'
}

/** 列表排序方式：手动 = 自己拖出来的顺序（v1.2.5 落库保存） */
type NoteSort = 'manual' | 'updated' | 'created' | 'title' | 'format'
/** 排序方向：正序 / 倒序。每种排序各自记住自己上次用的方向 */
type NoteSortDir = 'asc' | 'desc'
const SORT_KEY = 'workstation.notes.sort.v1'
const SORT_DIR_KEY = 'workstation.notes.sortdir.v1'
const NOTE_SORTS: { key: NoteSort; label: string; hint: string }[] = [
  { key: 'manual', label: '手动排序', hint: '按住卡片拖动即可自由排列，顺序会保存' },
  { key: 'updated', label: '按修改日期排序', hint: '最近改过的排前面' },
  { key: 'created', label: '按加入日期排序', hint: '最近导入的排前面' },
  { key: 'title', label: '按首字符排序', hint: '按标题第一个字 / 字母排序（中文按拼音）' },
  { key: 'format', label: '按格式排序', hint: 'PDF、DOCX、PPTX 等来源格式归类' }
]
/** 每种排序的默认方向：日期默认「新的在前」，首字符与格式默认「A→Z」 */
const DEFAULT_DIRS: Record<NoteSort, NoteSortDir> = {
  manual: 'asc',
  updated: 'desc',
  created: 'desc',
  title: 'asc',
  format: 'asc'
}
const SORT_KEYS = Object.keys(DEFAULT_DIRS) as NoteSort[]

function loadSortDirs(): Record<NoteSort, NoteSortDir> {
  const dirs = { ...DEFAULT_DIRS }
  try {
    const raw = localStorage.getItem(SORT_DIR_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<Record<NoteSort, NoteSortDir>>) : null
    if (saved) {
      SORT_KEYS.forEach((key) => {
        if (saved[key] === 'asc' || saved[key] === 'desc') dirs[key] = saved[key] as NoteSortDir
      })
    }
  } catch {
    /* 本地存的格式不对就退回默认方向 */
  }
  return dirs
}

/** 中文按拼音、英文按字母：交给 Intl 的 zh-Hans 规则，不用自己写拼音表 */
const byTitle = (a: string, b: string): number => a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })

/** 比较一律按「正序」写，倒序时整体取反：五种排序不必各写两遍 */
function sortNotes(list: Note[], sort: NoteSort, dir: NoteSortDir = 'asc'): Note[] {
  const sign = dir === 'desc' ? -1 : 1
  const compare = (a: Note, b: Note): number => {
    switch (sort) {
      case 'updated':
        return a.updatedAt.localeCompare(b.updatedAt) || a.id - b.id
      case 'created':
        return a.createdAt.localeCompare(b.createdAt) || a.id - b.id
      case 'title':
        return byTitle(a.title, b.title) || a.id - b.id
      case 'format':
        return byTitle(a.sourceFormat ?? 'zzz', b.sourceFormat ?? 'zzz') || byTitle(a.title, b.title) || a.id - b.id
      default:
        return a.sortOrder - b.sortOrder || a.updatedAt.localeCompare(b.updatedAt) || a.id - b.id
    }
  }
  return [...list].sort((a, b) => sign * compare(a, b))
}

const KIND_TABS: { key: NoteKind | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'note', label: '笔记' },
  { key: 'material', label: '资料' },
  { key: 'flashcard', label: '卡片' }
]

export function NotesPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    notes,
    current,
    keyword,
    taskFilter,
    loading,
    saving,
    load,
    setKeyword,
    setTaskFilter,
    select,
    createNote,
    saveNote,
    removeNote,
    reorderNotes,
    gradeReview
  } = useNoteStore()
  const tasks = useTaskStore((state) => state.tasks)
  const projects = useTaskStore((state) => state.projects)
  const loadTasks = useTaskStore((state) => state.load)
  const loadProjects = useTaskStore((state) => state.loadProjects)
  const pushToast = useAppStore((state) => state.pushToast)
  const refreshOverview = useAppStore((state) => state.refreshOverview)

  const [kind, setKind] = useState<NoteKind | 'all'>('all')
  // 列表排序：默认沿用手动顺序；拖拽排序会顺手切回手动
  const [sort, setSort] = useState<NoteSort>(() => (localStorage.getItem(SORT_KEY) as NoteSort) || 'manual')
  const [dirs, setDirs] = useState<Record<NoteSort, NoteSortDir>>(loadSortDirs)
  const sortDir = dirs[sort]
  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  const [preview, setPreview] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftKind, setDraftKind] = useState<NoteKind>('note')
  // 详情里的可编辑字段：简介 + 关联任务 / 项目（课程）
  const [draftSummary, setDraftSummary] = useState('')
  const [draftTaskId, setDraftTaskId] = useState<number | null>(null)
  const [draftProjectId, setDraftProjectId] = useState<number | null>(null)
  const [enableReview, setEnableReview] = useState(true)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTaskId, setNewTaskId] = useState<number | null>(null)
  const [newProjectId, setNewProjectId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  // 导入外部文档（PDF / Word / PPT / 网页 / 纯文本 …）
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [importTaskId, setImportTaskId] = useState<number | null>(null)
  const [importProjectId, setImportProjectId] = useState<number | null>(null)
  const [importSummary, setImportSummary] = useState('')
  const [importKind, setImportKind] = useState<NoteKind>('material')
  const [importSplit, setImportSplit] = useState(false)
  /** 已经选好、等待确认的文件路径：拖进来或从选择框拿到后先不导入，先问简介与关联 */
  const [importPaths, setImportPaths] = useState<string[]>([])
  // 详情弹窗：选中任意一条资料后弹出，替代原先常驻右侧的详情区
  const [detailOpen, setDetailOpen] = useState(false)
  // 导入进度（主进程逐文件推送）
  const [progress, setProgress] = useState<NoteImportProgress | null>(null)

  useEffect(() => {
    void load()
    void loadTasks()
    void loadProjects()
  }, [load, loadTasks, loadProjects])

  // 订阅导入进度：进度条浮层在页面底部显示，完成后自动收起
  useEffect(() => {
    const off = api.onNoteImportProgress((payload) => {
      setProgress(payload)
      if (payload.total > 0 && payload.done >= payload.total) {
        window.setTimeout(() => {
          setProgress((current) => (current && current.done >= current.total ? null : current))
        }, 1400)
      }
    })
    return off
  }, [])

  useEffect(() => {
    const state = location.state as { noteId?: number } | null
    if (state?.noteId) {
      void select(state.noteId)
      setDetailOpen(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, select, navigate])

  useEffect(() => {
    if (!current) return
    setDraftTitle(current.title)
    setDraftContent(current.content)
    setDraftKind(current.kind)
    setDraftSummary(current.summary ?? '')
    setDraftTaskId(current.taskId ?? null)
    setDraftProjectId(current.projectId ?? null)
    setEnableReview(Boolean(current.review))
  }, [current?.id, current?.updatedAt])

  const filtered = useMemo(
    () => sortNotes(kind === 'all' ? notes : notes.filter((note) => note.kind === kind), sort, sortDir),
    [notes, kind, sort, sortDir]
  )

  const chooseSort = (key: NoteSort): void => {
    setSort(key)
    localStorage.setItem(SORT_KEY, key)
  }

  /** 正序 / 倒序互换：只改当前这种排序的方向，其它排序保持各自记住的方向 */
  const toggleSortDir = (): void => {
    setDirs((prev) => {
      const next = { ...prev, [sort]: prev[sort] === 'asc' ? 'desc' : 'asc' }
      localStorage.setItem(SORT_DIR_KEY, JSON.stringify(next))
      return next
    })
  }

  /** 把拖到的位置写回顺序：可见条目重排后整段落库，并自动切回手动排序 */
  const applyReorder = async (fromId: number | null, toId: number): Promise<void> => {
    if (fromId === null || fromId === toId) return
    const visible = filtered.map((note) => note.id)
    const from = visible.indexOf(fromId)
    const to = visible.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...visible]
    next.splice(from, 1)
    next.splice(to, 0, fromId)
    chooseSort('manual')
    // 手动排序处于「倒序」时，屏幕上看到的是反过来的顺序，落库要按反序编号才对得上
    await reorderNotes(sort === 'manual' && sortDir === 'desc' ? [...next].reverse() : next)
  }

  const handleSave = async (): Promise<void> => {
    if (!current) return
    await saveNote({
      id: current.id,
      title: draftTitle.trim() === '' ? '未命名笔记' : draftTitle.trim(),
      content: draftContent,
      kind: draftKind,
      summary: draftSummary.trim(),
      // 只挂项目时清掉任务归属，避免项目跟着旧任务跑
      taskId: draftTaskId,
      projectId: draftTaskId !== null ? draftProjectId ?? current.projectId ?? null : draftProjectId,
      enableReview
    })
    await refreshOverview()
    pushToast({ title: '笔记已保存', description: enableReview ? '复习计划已同步更新' : '未纳入复习计划', tone: 'success' })
  }

  /** 点开一条笔记就是翻开这本书：进入独立的阅读界面 */
  const openReader = (id: number): void => {
    navigate('/reader/' + id)
  }

  /** 选中一条资料 = 弹出详情视图（正文、原件、复习计划都在这里） */
  const openDetail = async (id: number): Promise<void> => {
    await select(id)
    setDetailOpen(true)
  }

  const handleCreate = async (): Promise<void> => {
    if (newTitle.trim() === '') {
      pushToast({ title: '请填写笔记标题', tone: 'warning' })
      return
    }
    await createNote({
      taskId: newTaskId,
      projectId: newProjectId,
      title: newTitle.trim(),
      content: '',
      kind: 'note',
      enableReview: true
    })
    setNewTitle('')
    setNewTaskId(null)
    setNewProjectId(null)
    setCreateOpen(false)
    await refreshOverview()
    pushToast({ title: '笔记已创建', description: '已自动加入遗忘曲线复习计划', tone: 'success' })
  }

  const handleGrade = async (id: number, rating: ReviewRating): Promise<void> => {
    const review = await gradeReview(id, rating)
    await refreshOverview()
    pushToast({ title: '复习已评分', description: `下次复习 ${formatDateTime(review.dueAt)}`, tone: 'success' })
  }

  const handlePlan = async (id: number): Promise<void> => {
    const day = formatDay(addDays(new Date(), 1).toISOString())
    await api.review.plan(id, day)
    await select(current?.id ?? 0)
    await refreshOverview()
    pushToast({ title: `已排入 ${day} 日程`, tone: 'success' })
  }

  const importOptions = (): NoteImportOptions => ({
    taskId: importTaskId,
    projectId: importProjectId,
    summary: importSummary.trim(),
    kind: importKind,
    splitByHeading: importSplit
  })

  /** 把刚拿到的文件路径放进确认弹窗（不直接导入） */
  const stageImport = (paths: string[]): void => {
    if (paths.length === 0) return
    setImportPaths((old) => Array.from(new Set([...old, ...paths])))
    setImportTaskId((old) => old ?? taskFilter)
    setImportOpen(true)
  }

  const reportImport = async (summary: NoteImportSummary): Promise<void> => {
    const failed = summary.items.filter((item) => !item.ok)
    const ok = summary.items.filter((item) => item.ok)
    const asBook = ok.filter((item) => item.viewMode !== 'text').length
    if (summary.created.length > 0) {
      await load()
      await refreshOverview()
      pushToast({
        title: `已导入 ${ok.length} 个文件，生成 ${summary.created.length} 条笔记`,
        description: asBook > 0 ? `${asBook} 个按原版式成书，正在翻开第一条` : '正在翻开第一条',
        tone: 'success'
      })
      navigate('/reader/' + summary.created[0].id)
    }
    failed.slice(0, 4).forEach((item) => {
      pushToast({ title: `导入失败：${item.file}`, description: item.reason ?? '未知错误', tone: 'danger' })
    })
    if (failed.length > 4) {
      pushToast({ title: `还有 ${failed.length - 4} 个文件未导入`, description: '多为老格式或扫描版 PDF，详见逐条提示', tone: 'warning' })
    }
  }

  /** 弹窗里「再加文件」：继续追加待导入清单 */
  const handlePickMore = async (): Promise<void> => {
    setImporting(true)
    try {
      stageImport(await api.note.pickPaths())
    } catch (error) {
      pushToast({ title: '没能打开文件选择框', description: error instanceof Error ? error.message : String(error), tone: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  /** 确认导入：简介与关联一并写进每一条笔记 */
  const confirmImport = async (): Promise<void> => {
    if (importPaths.length === 0) {
      pushToast({ title: '请先选择要导入的文件', tone: 'warning' })
      return
    }
    setImporting(true)
    try {
      const paths = importPaths
      setImportPaths([])
      setImportSummary('')
      setImportOpen(false)
      await reportImport(await api.note.importFiles(paths, importOptions()))
      setImportTaskId(null)
      setImportProjectId(null)
    } catch (error) {
      pushToast({ title: '导入失败', description: error instanceof Error ? error.message : String(error), tone: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  /** 拖文件进来：先问简介与关联，再导入（第五轮） */
  const handleDropFiles = (files: File[]): void => {
    const paths = files
      .map((file) => window.nativeFiles?.pathForFile(file) ?? '')
      .filter((path) => path !== '')
    if (paths.length === 0) {
      pushToast({ title: '没能取到文件路径', description: '请改用笔记列表右上角的「导入」按钮选择文件', tone: 'warning' })
      return
    }
    stageImport(paths)
  }

  /** 「导入」按钮：先弹系统选择框，拿到文件后进确认弹窗 */
  const openImport = async (): Promise<void> => {
    setImporting(true)
    try {
      const paths = await api.note.pickPaths()
      if (paths.length > 0) stageImport(paths)
    } catch (error) {
      pushToast({ title: '没能打开文件选择框', description: error instanceof Error ? error.message : String(error), tone: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  const tasksNode = (
      <Card className="flex h-full flex-col">
        <SectionHeader
          title="归属任务"
          description="按任务浏览笔记与资料"
          action={
            <IconButton label="新建笔记" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
            </IconButton>
          }
        />
        <div className="flex-1 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => void setTaskFilter(null)}
            className={cn(
              'mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors',
              taskFilter === null ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <span>全部笔记</span>
            <Badge tone="default">{notes.length}</Badge>
          </button>
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => void setTaskFilter(task.id)}
              className={cn(
                'mb-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors',
                taskFilter === task.id ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              <span className="truncate">{task.title}</span>
              {task.noteCount ? <Badge tone="default">{task.noteCount}</Badge> : null}
            </button>
          ))}
        </div>
      </Card>
  )

  const listNode = (
    <div
      className="relative h-full"
      onDragOver={(event) => {
        // 只有从外面拖文件进来才亮「将文件拖入此处」；列表内部拖拽排序不走这套
        if (dragId !== null || !Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return
        event.preventDefault()
        setDropping(false)
        void handleDropFiles(Array.from(event.dataTransfer.files))
      }}
    >
        <Card className="flex h-full min-w-0 flex-col">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(event) => void setKeyword(event.target.value)}
                placeholder="搜索笔记标题或正文"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 shrink-0"
              loading={importing}
              icon={<Upload className="h-3.5 w-3.5" />}
              title="导入 PDF / Word / PPT / 网页 / 纯文本等文档"
              onClick={openImport}
            >
              导入
            </Button>
          </div>
          <Tabs
            size="sm"
            className="mb-3 w-full overflow-x-auto"
            value={kind}
            onChange={(key) => setKind(key as NoteKind | 'all')}
            items={KIND_TABS.map((tab) => ({
              key: tab.key,
              label: tab.label,
              count: tab.key === 'all' ? notes.length : notes.filter((note) => note.kind === tab.key).length
            }))}
          />

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {NOTE_SORTS.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                onClick={() => chooseSort(item.key)}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors',
                  sort === item.key
                    ? 'border-primary/60 bg-primary/10 font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
                )}
              >
                {item.label}
                {sort === item.key ? (
                  sortDir === 'asc' ? (
                    <ArrowUpNarrowWide className="h-3 w-3 shrink-0" />
                  ) : (
                    <ArrowDownWideNarrow className="h-3 w-3 shrink-0" />
                  )
                ) : null}
              </button>
            ))}
            <button
              type="button"
              title={`当前${sortDir === 'asc' ? '正序' : '倒序'}，点击换成${sortDir === 'asc' ? '倒序' : '正序'}`}
              onClick={toggleSortDir}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              {sortDir === 'asc' ? (
                <ArrowUpNarrowWide className="h-3 w-3 shrink-0" />
              ) : (
                <ArrowDownWideNarrow className="h-3 w-3 shrink-0" />
              )}
              {sortDir === 'asc' ? '正序' : '倒序'}
            </button>
            <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground xl:flex">
              <GripVertical className="h-3 w-3" />
              按住卡片可自由拖动排序
            </span>
          </div>

          <div className="mw-note-list flex-1 overflow-y-auto pr-1">
            {/* 列表占了整页宽度，宽窗口下两列排，卡片不再中间空一大段 */}
            <div className="grid gap-x-2 2xl:grid-cols-2">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="还没有笔记" description="点击右上角的「导入」把 PDF / Word / PPT 等文档收进书柜，或先新建一篇笔记" />
            ) : (
              filtered.map((note) => (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(event) => {
                    setDragId(note.id)
                    event.dataTransfer.effectAllowed = 'move'
                    // 拖拽数据里带一个自定义标记，别被外面的「拖文件导入」当成外部文件
                    event.dataTransfer.setData('text/plain', String(note.id))
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                  onDragOver={(event) => {
                    if (dragId === null || dragId === note.id) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = 'move'
                    if (overId !== note.id) setOverId(note.id)
                  }}
                  onDrop={(event) => {
                    if (dragId === null) return
                    event.preventDefault()
                    event.stopPropagation()
                    void applyReorder(dragId, note.id)
                    setDragId(null)
                    setOverId(null)
                  }}
                  onClick={() => void openDetail(note.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void openDetail(note.id)
                  }}
                  className={cn(
                    'mb-2 w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-150',
                    dragId === note.id && 'opacity-45',
                    dragId !== null && dragId !== note.id && overId === note.id && 'border-primary ring-2 ring-primary/45',
                    current?.id === note.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/45" />
                      <Badge tone={note.kind === 'material' ? 'warning' : note.kind === 'flashcard' ? 'info' : 'primary'}>
                        {note.kind === 'material' ? '资料' : note.kind === 'flashcard' ? '卡片' : '笔记'}
                      </Badge>
                    </span>
                    {note.review ? (
                      <Badge tone={note.review.status === 'mastered' ? 'success' : 'info'} dot>
                        {note.review.status === 'mastered' ? '已掌握' : relativeDay(note.review.dueAt)}
                      </Badge>
                    ) : (
                      <Badge tone="default">未复习</Badge>
                    )}
                  </div>
                  <p className="mt-2 truncate text-xs font-medium text-foreground">{note.title}</p>
                  <p className="mt-1 line-clamp-2 min-w-0 text-[11px] leading-relaxed text-muted-foreground">
                    {note.summary !== ''
                      ? note.summary
                      : note.viewMode === 'text' || isTextualDoc(note)
                        ? note.content.replace(/[#>*`]/g, '').slice(0, 80) || '暂无正文'
                        : `按 ${note.sourceFormat ?? '原文件'} 原版式显示，图片与排版都在`}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">{viewModeLabel(note)}</span>
                    {note.pageCount > 0 ? <span className="tabular-nums">{note.pageCount} 页</span> : null}
                    {note.readonly ? <span>只读</span> : null}
                    {note.lastPage > 1 && note.viewMode !== 'text' ? (
                      <span className="tabular-nums">读到 {note.lastPage}</span>
                    ) : null}
                    {note.readingMinutes ? (
                      <span className="tabular-nums">已读 {note.readingMinutes} 分钟</span>
                    ) : null}
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {note.taskTitle ? <span className="max-w-[90px] truncate">任务：{note.taskTitle}</span> : null}
                      {note.projectName ? (
                        <span className="max-w-[90px] truncate" title={note.projectName}>
                          课程：{note.projectName}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        title="编辑正文与复习计划"
                        onClick={(event) => {
                          event.stopPropagation()
                          void openDetail(note.id)
                        }}
                        className="rounded-md border border-transparent p-1 transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="进入阅读模式"
                        onClick={(event) => {
                          event.stopPropagation()
                          openReader(note.id)
                        }}
                        className="flex items-center gap-1 rounded-md border border-border bg-background/70 px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-foreground"
                      >
                        <BookOpen className="h-3 w-3" />
                        阅读
                      </button>
                    </span>
                  </div>
                </div>
              ))
            )}
            </div>
          </div>
      </Card>
      {dropping ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary/70 bg-primary/10 text-sm font-medium text-tint-primary">
          将文件拖入此处
        </div>
      ) : null}
    </div>
  )

  // 详情不再常驻右侧：选中任意一条资料后弹出独立视图（见下方 NoteDetailModal）
  const entries: GridEntry[] = [
    { id: 'tasks', title: '归属任务', x: 0, y: 3, w: 3, h: 12, minW: 2, minH: 5, node: tasksNode },
    { id: 'list', title: '笔记列表', x: 3, y: 3, w: 9, h: 12, minW: 3, minH: 5, node: listNode }
  ]

  return (
    <div className="grid gap-5">
      <PageGrid pageKey="notes" entries={entries} storageKey="workstation.grid.notes.v4" />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-pop animate-scale-in">
            <p className="text-sm font-semibold text-foreground">新建笔记</p>
            <p className="mt-0.5 text-xs text-muted-foreground">可选择归属任务或项目 / 课程，保存后自动加入复习计划</p>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="归属任务">
                  <Select
                    value={newTaskId === null ? '' : String(newTaskId)}
                    onChange={(event) => setNewTaskId(event.target.value === '' ? null : Number(event.target.value))}
                  >
                    <option value="">不关联任务</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="归属项目 / 课程">
                  <Select
                    value={newProjectId === null ? '' : String(newProjectId)}
                    onChange={(event) => setNewProjectId(event.target.value === '' ? null : Number(event.target.value))}
                  >
                    <option value="">不关联项目 / 课程</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.kind === 'course' ? '课程 · ' : '项目 · '}
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="笔记标题" required>
                <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：B+ 树与 B 树的核心差异" />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                创建
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setImportOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <div className="relative z-10 flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-scale-in">
            <div className="shrink-0 border-b border-border px-5 py-4">
              <p className="text-sm font-semibold text-foreground">保存资料</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-4">
                <Field label={`已选文件（${importPaths.length} 个）`}>
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-border bg-muted/25 p-2">
                    {importPaths.map((path) => (
                      <p key={path} className="truncate text-[11px] leading-relaxed text-muted-foreground" title={path}>
                        {path.split(/[\\/]/).pop()}
                      </p>
                    ))}
                  </div>
                </Field>

                <Field label="资料简介">
                  <Textarea
                    rows={2}
                    value={importSummary}
                    onChange={(event) => setImportSummary(event.target.value)}
                    placeholder="例如：电路原理实验课的讲义与实验报告模板，重点看第 3 章的桥式电路"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="关联任务" hint="阅读时间会算进这个任务的专注时长">
                    <Select
                      value={importTaskId === null ? '' : String(importTaskId)}
                      onChange={(event) => setImportTaskId(event.target.value === '' ? null : Number(event.target.value))}
                    >
                      <option value="">不关联任务</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="关联项目 / 课程" hint="没有对应任务时，直接挂到课程上">
                    <Select
                      value={importProjectId === null ? '' : String(importProjectId)}
                      onChange={(event) =>
                        setImportProjectId(event.target.value === '' ? null : Number(event.target.value))
                      }
                    >
                      <option value="">不关联项目 / 课程</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.kind === 'course' ? '课程 · ' : '项目 · '}
                          {project.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="导入为">
                    <Select value={importKind} onChange={(event) => setImportKind(event.target.value as NoteKind)}>
                      <option value="material">资料（不排复习）</option>
                      <option value="note">笔记（可排复习）</option>
                    </Select>
                  </Field>
                  <Field label="长文档处理">
                    <div className="flex h-9 items-center rounded-xl border border-border bg-input/60 px-3">
                      <Switch
                        checked={importSplit}
                        onChange={setImportSplit}
                        label={importSplit ? '按一级标题拆成多条' : '整篇存为一条'}
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid gap-1.5 rounded-lg border border-border bg-muted/25 p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">支持的格式</p>
                  {IMPORT_FORMAT_GROUPS.map((group) => (
                    <p key={group.label} className="text-[11px] leading-relaxed text-muted-foreground/90">
                      <span className="text-foreground">{group.label}</span>：{group.formats}
                      <span className="ml-1 text-muted-foreground/70">— {group.mode}</span>
                    </p>
                  ))}
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
                    转成原版式页面需要本机装有 LibreOffice 或 Microsoft Office（PDF 与网页 / EPUB 不需要）；
                    没有转换器时会自动退回「抽取文字」，仍能读但版式与图片会丢。扫描版 PDF 可以正常翻阅，只是搜不到字。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                取消
              </Button>
              <Button variant="secondary" icon={<Upload className="h-3.5 w-3.5" />} loading={importing} onClick={handlePickMore}>
                再加文件
              </Button>
              <Button variant="primary" icon={<BookOpen className="h-3.5 w-3.5" />} loading={importing} onClick={confirmImport}>
                开始导入
              </Button>
            </div>
          </div>
        </div>
      ) : null}


      {current ? (
        <Modal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={current.title}
          description={
            `${viewModeLabel(current)} · ${current.pageCount > 0 ? `${current.pageCount} 页 · ` : ''}` +
            (current.readonly ? '只读原版式' : `更新于 ${current.updatedAt.replace('T', ' ').slice(0, 16)}`)
          }
          width="max-w-2xl"
          footer={
            <>
              <Button
                variant="ghost"
                className="text-danger hover:text-danger"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmId(current.id)}
              >
                删除
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {!current.readonly ? (
                  <Button variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreview(!preview)}>
                    {preview ? '继续编辑' : '预览'}
                  </Button>
                ) : null}
                <Button variant="secondary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSave}>
                  保存
                </Button>
                <Button variant="primary" icon={<BookOpen className="h-3.5 w-3.5" />} onClick={() => openReader(current.id)}>
                  进入阅读
                </Button>
              </div>
            </>
          }
        >
          {/* 详情改成单列自上而下：原来左右两栏在窄弹窗里会互相挤压重叠（第五轮修复） */}
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Field label="标题">
                <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </Field>
              <Field label="类型">
                <Select value={draftKind} onChange={(event) => setDraftKind(event.target.value as NoteKind)}>
                  <option value="note">笔记</option>
                  <option value="material">资料</option>
                  <option value="flashcard">卡片</option>
                </Select>
              </Field>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label="关联任务" hint="阅读时间计入该任务的专注时长">
                <Select
                  value={draftTaskId === null ? '' : String(draftTaskId)}
                  onChange={(event) => setDraftTaskId(event.target.value === '' ? null : Number(event.target.value))}
                >
                  <option value="">不关联任务</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="关联项目 / 课程" hint="没有对应任务时直接挂到课程上">
                <Select
                  value={draftProjectId === null ? '' : String(draftProjectId)}
                  onChange={(event) => setDraftProjectId(event.target.value === '' ? null : Number(event.target.value))}
                >
                  <option value="">不关联项目 / 课程</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.kind === 'course' ? '课程 · ' : '项目 · '}
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="资料简介">
              <Textarea
                rows={2}
                value={draftSummary}
                onChange={(event) => setDraftSummary(event.target.value)}
                placeholder="简介填在此处"
              />
            </Field>

            {current.filePath ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-1.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={current.filePath}>
                  原件 {current.filePath}
                </span>
                <Button size="xs" variant="ghost" onClick={() => void api.app.openPath(current.filePath as string)}>
                  打开源文件
                </Button>
                <Button size="xs" variant="ghost" onClick={() => void api.note.revealSource(current.id)}>
                  定位
                </Button>
              </div>
            ) : null}

            {!current.readonly ? (
              preview ? (
                <div className="mw-note-preview max-h-[38vh] min-w-0 overflow-auto rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent || '_暂无正文_'}</ReactMarkdown>
                </div>
              ) : (
                <Field label="正文" hint="Markdown，可编辑">
                  <Textarea
                    rows={10}
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder="## 小节标题"
                    className="min-h-[24vh] font-mono text-[13px]"
                  />
                </Field>
              )
            ) : (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                这份资料按原版式只读保存（图片、表格、排版都在）。要记想法请点「进入阅读」，
                在书里加书签、重点页与注释；上面填的简介会显示在卡片与详情里。
              </p>
            )}

            <div className="grid min-w-0 gap-2 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs font-medium text-foreground">复习计划</span>
                <Switch checked={enableReview} onChange={setEnableReview} label={enableReview ? '已纳入' : '不纳入'} />
              </div>
              {current.review ? (
                <ReviewQueue
                  items={[current.review]}
                  onGrade={handleGrade}
                  onPlanTomorrow={handlePlan}
                  emptyHint="该笔记未纳入复习计划"
                />
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  这条资料还没有排进遗忘曲线。打开上方开关并保存，就会自动生成复习计划。
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 break-all">标签：{current.tags.length > 0 ? current.tags.join(' / ') : '无'}</span>
              <span>创建：{formatDateTime(current.createdAt)}</span>
              {current.sourceFormat ? <span>来源格式：{current.sourceFormat}</span> : null}
              {current.pageCount > 0 ? (
                <span>
                  读到 {Math.min(current.lastPage, current.pageCount)} / {current.pageCount} 页
                </span>
              ) : null}
              <span>已读 {current.readingMinutes ?? 0} 分钟</span>
            </div>
          </div>
        </Modal>
      ) : null}

      {progress ? (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-40 w-[min(460px,88vw)] -translate-x-1/2">
          <div className="rounded-xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Spinner className="h-3.5 w-3.5" />
                正在导入第 {Math.min(progress.done + 1, progress.total)} / {progress.total} 个文件
              </span>
              <span className="tabular-nums text-muted-foreground">{progress.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(3, progress.percent)}%` }}
              />
            </div>
            <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={progress.file}>
              {IMPORT_STAGE_LABEL[progress.stage]}：{progress.file}
              {progress.eta > 1500 ? ` · 预计还需 ${Math.ceil(progress.eta / 1000)} 秒` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmId !== null}
        title="删除笔记"
        description="删除后该笔记的复习计划会一并移除，且无法恢复。"
        confirmText="确认删除"
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          if (confirmId === null) return
          await removeNote(confirmId)
          setConfirmId(null)
          await refreshOverview()
          pushToast({ title: '笔记已删除', tone: 'success' })
        }}
      />
    </div>
  )
}
