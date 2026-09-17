import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, Eye, FileText, Layers, Paperclip, Pencil, Plus, Save, Search, Trash2, Upload } from 'lucide-react'
import type { NoteImportOptions, NoteImportSummary, NoteKind, ReviewRating } from '@shared/types/domain'
import { IMPORT_FORMAT_GROUPS } from '@shared/constants'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Overlay'
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
    gradeReview
  } = useNoteStore()
  const tasks = useTaskStore((state) => state.tasks)
  const loadTasks = useTaskStore((state) => state.load)
  const pushToast = useAppStore((state) => state.pushToast)
  const refreshOverview = useAppStore((state) => state.refreshOverview)

  const [kind, setKind] = useState<NoteKind | 'all'>('all')
  const [preview, setPreview] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftKind, setDraftKind] = useState<NoteKind>('note')
  const [enableReview, setEnableReview] = useState(true)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTaskId, setNewTaskId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  // 导入外部文档（PDF / Word / PPT / 网页 / 纯文本 …）
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [importTaskId, setImportTaskId] = useState<number | null>(null)
  const [importKind, setImportKind] = useState<NoteKind>('material')
  const [importSplit, setImportSplit] = useState(false)

  useEffect(() => {
    void load()
    void loadTasks()
  }, [load, loadTasks])

  useEffect(() => {
    const state = location.state as { noteId?: number } | null
    if (state?.noteId) {
      void select(state.noteId)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, select, navigate])

  useEffect(() => {
    if (!current) return
    setDraftTitle(current.title)
    setDraftContent(current.content)
    setDraftKind(current.kind)
    setEnableReview(Boolean(current.review))
  }, [current?.id, current?.updatedAt])

  const filtered = useMemo(
    () => (kind === 'all' ? notes : notes.filter((note) => note.kind === kind)),
    [notes, kind]
  )

  const handleSave = async (): Promise<void> => {
    if (!current) return
    await saveNote({
      id: current.id,
      title: draftTitle.trim() === '' ? '未命名笔记' : draftTitle.trim(),
      content: draftContent,
      kind: draftKind,
      enableReview
    })
    await refreshOverview()
    pushToast({ title: '笔记已保存', description: enableReview ? '复习计划已同步更新' : '未纳入复习计划', tone: 'success' })
  }

  /** 点开一条笔记就是翻开这本书：进入独立的阅读界面 */
  const openReader = (id: number): void => {
    navigate('/reader/' + id)
  }

  const handleCreate = async (): Promise<void> => {
    if (newTitle.trim() === '') {
      pushToast({ title: '请填写笔记标题', tone: 'warning' })
      return
    }
    await createNote({ taskId: newTaskId, title: newTitle.trim(), content: '', kind: 'note', enableReview: true })
    setNewTitle('')
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

  const importOptions = (taskId: number | null): NoteImportOptions => ({
    taskId,
    kind: importKind,
    splitByHeading: importSplit
  })

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

  const handlePickImport = async (): Promise<void> => {
    setImporting(true)
    try {
      await reportImport(await api.note.importPick(importOptions(importTaskId)))
      setImportOpen(false)
    } catch (error) {
      pushToast({ title: '导入失败', description: error instanceof Error ? error.message : String(error), tone: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  const handleDropFiles = async (files: File[]): Promise<void> => {
    const paths = files
      .map((file) => window.nativeFiles?.pathForFile(file) ?? '')
      .filter((path) => path !== '')
    if (paths.length === 0) {
      pushToast({ title: '没能取到文件路径', description: '请改用笔记列表右上角的「导入文档」按钮选择文件', tone: 'warning' })
      return
    }
    setImporting(true)
    try {
      await reportImport(await api.note.importFiles(paths, importOptions(taskFilter)))
    } catch (error) {
      pushToast({ title: '导入失败', description: error instanceof Error ? error.message : String(error), tone: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  const openImport = (): void => {
    setImportTaskId(taskFilter)
    setImportOpen(true)
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
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDropping(false)
        void handleDropFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <Card className="flex h-full flex-col">
        <div className="mb-3 flex h-9 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => void setKeyword(event.target.value)}
            placeholder="搜索笔记标题或正文"
            className="h-full flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <Button
            size="sm"
            variant="secondary"
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
          className="mb-3"
          value={kind}
          onChange={(key) => setKind(key as NoteKind | 'all')}
          items={KIND_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: tab.key === 'all' ? notes.length : notes.filter((note) => note.kind === tab.key).length
          }))}
        />

        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title="还没有笔记" description="点击右上角加号创建第一篇笔记" />
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => void select(note.id)}
                className={cn(
                  'mb-2 w-full rounded-xl border p-3 text-left transition-all duration-150',
                  current?.id === note.id
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border bg-muted/20 hover:border-primary/30 hover:bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={note.kind === 'material' ? 'warning' : note.kind === 'flashcard' ? 'info' : 'primary'}>
                    {note.kind === 'material' ? '资料' : note.kind === 'flashcard' ? '卡片' : '笔记'}
                  </Badge>
                  {note.review ? (
                    <Badge tone={note.review.status === 'mastered' ? 'success' : 'info'} dot>
                      {note.review.status === 'mastered' ? '已掌握' : relativeDay(note.review.dueAt)}
                    </Badge>
                  ) : (
                    <Badge tone="default">未复习</Badge>
                  )}
                </div>
                <p className="mt-2 truncate text-xs font-medium text-foreground">{note.title}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {note.viewMode === 'text'
                    ? note.content.replace(/[#>*`]/g, '').slice(0, 80) || '暂无正文'
                    : `按 ${note.sourceFormat ?? '原文件'} 原版式显示，图片与排版都在`}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{VIEW_MODE_LABEL[note.viewMode] ?? '文本'}</span>
                  {note.pageCount > 0 ? <span className="tabular-nums">{note.pageCount} 页</span> : null}
                  {note.readonly ? <span>只读</span> : null}
                  {note.lastPage > 1 && note.viewMode !== 'text' ? (
                    <span className="tabular-nums">读到 {note.lastPage}</span>
                  ) : null}
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {note.taskTitle ? <span className="max-w-[90px] truncate">任务：{note.taskTitle}</span> : null}
                    <span
                      role="button"
                      tabIndex={0}
                      title="在右侧编辑区改正文"
                      onClick={(event) => {
                        event.stopPropagation()
                        void select(note.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation()
                          void select(note.id)
                        }
                      }}
                      className="rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </span>
                    <BookOpen className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </Card>
      {dropping ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary/70 bg-primary/10 text-xs font-medium text-tint-primary">
          松手即导入：PDF / Word / PPT / Excel / EPUB / 网页 / 文本按原版式成书，纯文本与 Markdown 可编辑
        </div>
      ) : null}
    </div>
  )

  const detailNodes: GridEntry[] = current
    ? [
        {
          id: 'editor',
          title: '编辑笔记',
          x: 7,
          y: 3,
          w: 5,
          h: 8,
          minW: 4,
          minH: 5,
          node: (
            <Card className="flex h-full flex-col overflow-y-auto">
              <SectionHeader
                title={current.readonly ? '笔记正文' : '编辑笔记'}
                description={
                  current.viewMode === 'text'
                    ? `文本 · 最近更新 ${current.updatedAt.replace('T', ' ').slice(0, 16)}`
                    : `${VIEW_MODE_LABEL[current.viewMode]} · ${current.pageCount > 0 ? `${current.pageCount} 页 · ` : ''}只读原版式`
                }
                action={
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<BookOpen className="h-3.5 w-3.5" />}
                      onClick={() => openReader(current.id)}
                    >
                      打开阅读
                    </Button>
                    {!current.readonly ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        onClick={() => setPreview((value) => !value)}
                      >
                        {preview ? '继续编辑' : '预览'}
                      </Button>
                    ) : null}
                    {!current.readonly ? (
                      <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSave}>
                        保存
                      </Button>
                    ) : null}
                    <IconButton label="删除笔记" tone="danger" onClick={() => setConfirmId(current.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </>
                }
              />

              <div className="grid gap-4">
                <div className="grid grid-cols-[1fr_160px_180px] gap-4">
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
                  <Field label="复习计划">
                    <div className="flex h-9 items-center rounded-xl border border-border bg-input/60 px-3">
                      <Switch checked={enableReview} onChange={setEnableReview} label={enableReview ? '已纳入遗忘曲线' : '不纳入复习'} />
                    </div>
                  </Field>
                </div>

                {current.filePath ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-1.5 text-[11px] text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate" title={current.filePath}>
                      原件 {current.filePath}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void api.app.openPath(current.filePath as string)}>
                      打开源文件
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void api.app.showItemInFolder(current.filePath as string)}>
                      定位
                    </Button>
                  </div>
                ) : null}

                {preview || current.readonly ? (
                  <div className="prose-invert max-h-[420px] overflow-y-auto rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent || '_暂无正文_'}</ReactMarkdown>
                  </div>
                ) : (
                  <Textarea
                    rows={16}
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder={'## 小节标题\n\n- 知识点一\n- 知识点二\n\n> 关键结论'}
                    className="font-mono text-[13px]"
                  />
                )}
                {current.readonly ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    这份资料按原版式只读保存（图片、表格、排版都在），这里显示的是供搜索与摘要用的抽取文字。
                    要记想法请点「打开阅读」，在书里加书签、重点页与注释。
                  </p>
                ) : null}
              </div>
            </Card>
          )
        },
        {
          id: 'review',
          title: '遗忘曲线复习',
          x: 7,
          y: 11,
          w: 5,
          h: 4,
          minW: 4,
          minH: 3,
          node: (
            <Card className="flex h-full flex-col overflow-y-auto">
              <SectionHeader title="遗忘曲线复习" description="评分后会按 SM-2 计算下次复习时间" />
              {current.review ? (
                <ReviewQueue
                  items={[current.review]}
                  onGrade={handleGrade}
                  onPlanTomorrow={handlePlan}
                  emptyHint="该笔记未纳入复习计划"
                />
              ) : (
                <EmptyState
                  icon={<Layers className="h-5 w-5" />}
                  title="该笔记未纳入复习计划"
                  description="打开右上角的复习计划开关并保存，即可自动生成遗忘曲线排程"
                />
              )}
            </Card>
          )
        }
      ]
    : [
        {
          id: 'empty',
          title: '笔记编辑区',
          x: 7,
          y: 3,
          w: 5,
          h: 12,
          minW: 4,
          minH: 5,
          node: (
            <Card className="flex h-full items-center justify-center">
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="点左侧任意一条即可翻开阅读"
              description="阅读界面支持目录、缩略图、书签、重点页与注释；文本类笔记可在这里继续编辑正文"
              action={
                <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>
                  新建笔记
                </Button>
              }
            />
          </Card>
          )
        }
      ]

  const entries: GridEntry[] = [
    { id: 'tasks', title: '归属任务', x: 0, y: 3, w: 3, h: 12, minW: 2, minH: 5, node: tasksNode },
    { id: 'list', title: '笔记列表', x: 3, y: 3, w: 4, h: 12, minW: 3, minH: 5, node: listNode },
    ...detailNodes
  ]

  return (
    <div className="grid gap-5">
      <PageGrid pageKey="notes" entries={entries} storageKey="workstation.grid.notes.v3" />

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
            <p className="mt-0.5 text-xs text-muted-foreground">可选择归属任务，保存后自动加入复习计划</p>
            <div className="mt-4 grid gap-4">
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
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-pop animate-scale-in">
            <p className="text-sm font-semibold text-foreground">把文档导成一本可翻的书</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              全程在本地完成、不上传。PDF / PPT / Excel 等按原版式逐页显示（图片与排版都保留、只读）；
              Word 能转 PDF 时同样原版式，否则退回可编辑文字；Markdown / TXT / 代码等文本类保持可编辑。
            </p>
            <div className="mt-4 grid gap-4">
              <Field label="归属任务" hint="留空则只作为独立资料保存">
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
              <div className="grid grid-cols-2 gap-4">
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
                  也可以把文件直接拖到左侧笔记列表上，一次多个。
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setImportOpen(false)}>
                取消
              </Button>
              <Button variant="primary" loading={importing} icon={<Upload className="h-3.5 w-3.5" />} onClick={handlePickImport}>
                选择文件并导入
              </Button>
            </div>
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
