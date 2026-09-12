import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Eye, FileText, Layers, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react'
import type { NoteKind, ReviewRating } from '@shared/types/domain'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Field, Input, Select, Switch, Textarea } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Overlay'
import { Tabs } from '../components/ui/Tabs'
import { GridBoard, type GridEntry } from '../components/layout/GridBoard'
import { ClockTile } from '../components/layout/ClockTile'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useNoteStore } from '../stores/noteStore'
import { useTaskStore } from '../stores/taskStore'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { addDays, cn, formatDateTime, formatDay, relativeDay } from '../lib/utils'

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
      <Card className="flex h-full flex-col">
        <div className="mb-3 flex h-9 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => void setKeyword(event.target.value)}
            placeholder="搜索笔记标题或正文"
            className="h-full flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          />
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
                    : 'border-border/70 bg-muted/20 hover:border-primary/30 hover:bg-muted/40'
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
                  {note.content.replace(/[#>*`]/g, '').slice(0, 80) || '暂无正文'}
                </p>
                {note.taskTitle ? <p className="mt-1.5 truncate text-[10px] text-muted-foreground">任务：{note.taskTitle}</p> : null}
              </button>
            ))
          )}
        </div>
      </Card>
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
                title="编辑笔记"
                description={`最近更新 ${current.updatedAt.replace('T', ' ').slice(0, 16)}`}
                action={
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      onClick={() => setPreview((value) => !value)}
                    >
                      {preview ? '继续编辑' : '预览'}
                    </Button>
                    <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSave}>
                      保存
                    </Button>
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

                {preview ? (
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
              title="选择左侧笔记开始编辑"
              description="笔记与资料可挂在任务下，保存后自动按遗忘曲线安排复习"
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
    { id: 'clock', title: '时间显示', x: 4, y: 0, w: 4, h: 3, minW: 3, minH: 2, node: <ClockTile /> },
    { id: 'tasks', title: '归属任务', x: 0, y: 3, w: 3, h: 12, minW: 2, minH: 5, node: tasksNode },
    { id: 'list', title: '笔记列表', x: 3, y: 3, w: 4, h: 12, minW: 3, minH: 5, node: listNode },
    ...detailNodes
  ]

  return (
    <div className="grid gap-5">
      <GridBoard entries={entries} storageKey="workstation.grid.notes.v1" />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/80 bg-surface/95 p-5 shadow-2xl animate-scale-in">
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
