import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  GripVertical,
  List,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Star,
  Timer,
  Trash2
} from 'lucide-react'
import type { Task, TaskStatus } from '@shared/types/domain'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Progress, Skeleton } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { FlipDigit } from '../components/ui/FlipDigit'
import { ConfirmDialog } from '../components/ui/Overlay'
import { TaskForm } from '../components/task/TaskForm'
import { TaskDetailDrawer } from '../components/task/TaskDetailDrawer'
import { ScheduleBoard, type BoardView, type DueChangeRequest } from '../components/task/ScheduleBoard'
import { RecycleBinModal } from '../components/task/RecycleBinModal'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useTaskStore } from '../stores/taskStore'
import { useScheduleStore } from '../stores/scheduleStore'
import { useAppStore } from '../stores/appStore'
import { TASK_STATUS_META } from '@shared/constants'
import {
  addDays,
  cn,
  dateKey,
  detectOrderConflict,
  formatDateTime,
  formatMinutes,
  isOverdue,
  relativeDay,
  toDate,
  todayKey,
  weekdayCN,
  formatDateCN,
  type OrderConflict
} from '../lib/utils'

type PageView = BoardView | 'list'

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待开始' },
  { key: 'doing', label: '进行中' },
  { key: 'blocked', label: '受阻' },
  { key: 'done', label: '已完成' }
]

function clockText(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function TasksPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    tasks,
    projects,
    filter,
    loading,
    load,
    setFilter,
    openDetail,
    toggleTask,
    removeTask,
    updateTask,
    moveTask,
    reorderTasks
  } = useTaskStore()
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const pushToast = useAppStore((state) => state.pushToast)

  const [view, setView] = useState<PageView>('day')
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => todayKey())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [defaultDue, setDefaultDue] = useState<string | null>(null)
  const [keywordDraft, setKeywordDraft] = useState(filter.keyword)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [listOrder, setListOrder] = useState<number[] | null>(null)
  const [listDragId, setListDragId] = useState<number | null>(null)
  const [listOverId, setListOverId] = useState<number | null>(null)
  const [recycleOpen, setRecycleOpen] = useState(false)
  /** 待确认的完成/删除快捷操作 */
  const [quickConfirm, setQuickConfirm] = useState<{ type: 'toggle' | 'remove'; task: Task } | null>(null)
  /** 清单勾选完成前的确认 */
  const [toggleAsk, setToggleAsk] = useState<Task | null>(null)
  /** 拖拽打乱时间顺序时，询问是否修改截止时间 */
  const [dueChangeAsk, setDueChangeAsk] = useState<{ task: Task; conflict: OrderConflict; orderedIds: number[] } | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  // 顶栏实时时钟（精确到秒）
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const state = location.state as { taskId?: number } | null
    if (state?.taskId) {
      void openDetail(state.taskId)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, openDetail, navigate])

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>()
    for (const status of ['todo', 'doing', 'blocked', 'done'] as TaskStatus[]) map.set(status, [])
    for (const task of tasks) map.get(task.status)?.push(task)
    return map
  }, [tasks])

  /** 拖拽过程中的本地顺序覆盖，提交成功后交还给 store 排序 */
  const visibleTasks = useMemo(() => {
    if (!listOrder) return tasks
    const indexOf = new Map(listOrder.map((id, index) => [id, index] as const))
    return [...tasks].sort((a, b) => (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0))
  }, [tasks, listOrder])

  const today = todayKey()
  const priorityCount = tasks.filter((task) => task.isPriority && task.status !== 'done').length
  const doneCount = tasks.filter((task) => task.status === 'done').length

  /** 清单勾选：先弹窗确认防误触 */
  const onToggle = (task: Task): void => {
    setToggleAsk(task)
  }

  /** 确认后真正切换完成状态 */
  const executeToggle = async (task: Task): Promise<void> => {
    await toggleTask(task.id)
    await refreshOverview()
  }

  const openCreate = (_dayKey?: string): void => {
    setEditing(null)
    // 不再默认填充截止时间，允许创建不设置截止时间的事项
    setDefaultDue(null)
    setFormOpen(true)
  }

  const shift = (direction: number): void => {
    if (view === 'month') {
      setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1))
      return
    }
    const step = view === 'week' ? 7 : view === 'day' ? 1 : 0
    if (step === 0) return
    const next = addDays(toDate(selectedDay), direction * step)
    setSelectedDay(dateKey(next))
    setAnchor(next)
  }

  const gotoToday = (): void => {
    setSelectedDay(today)
    setAnchor(new Date())
  }

  const pickDay = (dayKey: string): void => {
    setSelectedDay(dayKey)
    setAnchor(toDate(dayKey))
  }

  const handleMove = async (id: number, dayKey: string): Promise<void> => {
    await moveTask(id, dayKey)
    await refreshOverview()
    pushToast({ title: `已移动到 ${dayKey}`, description: relativeDay(`${dayKey}T09:00:00`), tone: 'success' })
  }

  const handleReorder = async (orderedIds: number[]): Promise<void> => {
    await reorderTasks(orderedIds)
  }

  /** 清单视图：拖拽提交后按新顺序即时反馈，再等待 store 刷新；打乱时间顺序时先弹窗确认 */
  const handleListDrop = async (targetId: number): Promise<void> => {
    const dragId = listDragId
    setListDragId(null)
    setListOverId(null)
    if (dragId === null || dragId === targetId) return
    const ordered = [...visibleTasks]
    const from = ordered.findIndex((task) => task.id === dragId)
    if (from < 0) return
    const [dragged] = ordered.splice(from, 1)
    const to = ordered.findIndex((task) => task.id === targetId)
    if (to < 0) return
    ordered.splice(to, 0, dragged)

    const conflict = detectOrderConflict(ordered, dragId)
    if (conflict) {
      setDueChangeAsk({ task: dragged, conflict, orderedIds: ordered.map((task) => task.id) })
      return
    }
    const ids = ordered.map((task) => task.id)
    setListOrder(ids)
    await reorderTasks(ids)
    setListOrder(null)
  }

  /** 日程板卡片快捷：先弹窗确认再执行 */
  const handleQuickToggle = (task: Task): void => {
    setQuickConfirm({ type: 'toggle', task })
  }

  /** 日程板卡片快捷：先弹窗确认再执行 */
  const handleQuickRemove = (task: Task): void => {
    setQuickConfirm({ type: 'remove', task })
  }

  /** 确认执行快捷完成 / 删除 */
  const executeQuick = async (): Promise<void> => {
    if (!quickConfirm) return
    const { type, task } = quickConfirm
    setQuickConfirm(null)
    if (type === 'toggle') {
      await executeToggle(task)
      return
    }
    await removeTask(task.id)
    await refreshOverview()
    pushToast({ title: '任务已移入回收站', description: task.title, tone: 'success' })
  }

  /** 拖拽打乱时间顺序：用户确认修改截止时间后提交 */
  const executeDueChange = async (): Promise<void> => {
    if (!dueChangeAsk) return
    const { task, conflict, orderedIds } = dueChangeAsk
    setDueChangeAsk(null)
    await updateTask(task.id, { dueAt: conflict.newDueAt })
    await reorderTasks(orderedIds)
    pushToast({ title: '已调整截止时间', description: `${task.title} → ${formatDateTime(conflict.newDueAt)}`, tone: 'success' })
  }

  const statusCount = (key: TaskStatus | 'all'): number =>
    key === 'all' ? tasks.length : tasks.filter((task) => task.status === key).length

  /** 搜索输入即时候选：按标题 / 说明 / 标签模糊匹配，列出全部匹配项 */
  const suggestions = useMemo(() => {
    const keyword = keywordDraft.trim().toLowerCase()
    if (keyword === '') return []
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(keyword) ||
        task.detail.toLowerCase().includes(keyword) ||
        task.tags.some((tag) => tag.toLowerCase().includes(keyword))
    )
  }, [tasks, keywordDraft])

  const viewTabs: { key: PageView; label: string; icon: JSX.Element }[] = [
    { key: 'day', label: '当日', icon: <CalendarClock className="h-3 w-3" /> },
    { key: 'week', label: '本周', icon: <CalendarDays className="h-3 w-3" /> },
    { key: 'month', label: '本月', icon: <CalendarRange className="h-3 w-3" /> },
    { key: 'list', label: '清单', icon: <List className="h-3 w-3" /> }
  ]

  return (
    <div className="grid gap-5">
      {/* 头部卡片小幅抬升（低于顶栏 z-40）：候选浮层覆盖下方卡片，同时不遮挡顶栏的到点提醒面板 */}
      <Card className="relative z-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">今日</p>
            <h2 className="mt-1 text-4xl font-bold leading-tight tracking-tight text-foreground">
              {formatDateCN(today)}
              <span className="ml-3 align-baseline text-xl font-medium text-muted-foreground">
                {weekdayCN(today)}
              </span>
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              共 {tasks.length} 项事项 · 优先事项 {priorityCount} 项 · 已完成 {doneCount} 项
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">当前时间</p>
            <p className="mt-1 flex items-baseline justify-end text-4xl font-bold leading-tight tabular-nums tracking-tight text-foreground">
              {clockText(now)
                .split('')
                .map((char, index) => (
                  <FlipDigit key={`${index}-${char}`} char={char} />
                ))}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs size="sm" value={view} onChange={(key) => setView(key as PageView)} items={viewTabs} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={keywordDraft}
                onChange={(event) => {
                  setKeywordDraft(event.target.value)
                  setSuggestOpen(true)
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setSuggestOpen(false)
                    void setFilter({ keyword: keywordDraft })
                  }
                  if (event.key === 'Escape') {
                    setKeywordDraft('')
                    setSuggestOpen(false)
                    void setFilter({ keyword: '' })
                  }
                }}
                placeholder="搜索任务"
                className="h-full flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
              <kbd className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                Esc
              </kbd>

              {suggestOpen && keywordDraft.trim() !== '' && suggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-11 z-40 max-h-[420px] overflow-y-auto rounded-2xl border border-border/80 bg-surface/95 p-2 shadow-2xl backdrop-blur-2xl animate-scale-in">
                  <p className="sticky top-0 z-10 bg-surface/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    任务 · {suggestions.length}
                  </p>
                  {suggestions.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        setSuggestOpen(false)
                        void openDetail(task.id)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          task.isPriority ? 'bg-danger/15 text-[#FCA5A5]' : 'bg-primary/15 text-[#A5B4FC]'
                        )}
                      >
                        <ListChecks className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-xs font-medium',
                            task.isPriority ? 'text-danger' : 'text-foreground'
                          )}
                        >
                          {task.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {task.detail ? task.detail.slice(0, 60) : '暂无说明'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {task.projectName ?? '未归属'} · {TASK_STATUS_META[task.status].label}
                        {task.isPriority ? ' · 优先事项' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <Select
              value={filter.projectId === null ? '' : String(filter.projectId)}
              onChange={(event) =>
                void setFilter({ projectId: event.target.value === '' ? null : Number(event.target.value) })
              }
              className="w-[180px]"
            >
              <option value="">全部项目 / 课程</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>

            <Button
              variant={filter.onlyOverdue ? 'primary' : 'secondary'}
              size="md"
              icon={<Filter className="h-3.5 w-3.5" />}
              onClick={() => void setFilter({ onlyOverdue: !filter.onlyOverdue })}
            >
              仅看逾期
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setRecycleOpen(true)}
            >
              回收站
            </Button>

            <Button
              variant="primary"
              size="md"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => openCreate(view === 'day' ? selectedDay : undefined)}
            >
              新建任务
            </Button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="mt-3">
            <Tabs
              size="sm"
              value={filter.status}
              onChange={(key) => void setFilter({ status: key as TaskStatus | 'all' })}
              items={STATUS_TABS.map((tab) => ({ key: tab.key, label: tab.label, count: statusCount(tab.key) }))}
            />
          </div>
        ) : null}
      </Card>

      {loading && tasks.length === 0 ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-[120px]" />
          ))}
        </div>
      ) : view === 'list' ? (
        <Card padded={false}>
          {tasks.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="h-5 w-5" />}
              title="没有符合条件的任务"
              description="调整筛选条件，或新建一个任务开始规划"
              action={
                <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openCreate()}>
                  新建任务
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border/60">
              {visibleTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  dragging={listDragId === task.id}
                  dropTarget={listOverId === task.id && listDragId !== task.id}
                  onToggle={() => onToggle(task)}
                  onOpen={() => void openDetail(task.id)}
                  onEdit={() => {
                    setEditing(task)
                    setDefaultDue(null)
                    setFormOpen(true)
                  }}
                  onDragStart={() => setListDragId(task.id)}
                  onDragOver={() => {
                    if (listDragId === null || listDragId === task.id) return
                    setListOverId(task.id)
                  }}
                  onDrop={() => void handleListDrop(task.id)}
                  onDragEnd={() => {
                    setListDragId(null)
                    setListOverId(null)
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <SectionHeader
              title={
                view === 'day'
                  ? `${formatDateCN(selectedDay)} · ${weekdayCN(selectedDay)}`
                  : view === 'week'
                    ? '本周日程'
                    : '本月日程'
              }
              description="拖拽卡片可在任意日期之间移动，同一日期内可自由排序；超时事项置顶、优先事项其次，未设置截止时间的事项可随意拖拽；把截止时间早的事项拖到更晚位置时会弹窗确认是否修改截止时间"
              action={
                <div className="flex items-center gap-2">
                  <IconButton label="上一页" onClick={() => shift(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <Button size="sm" variant="secondary" onClick={gotoToday}>
                    今天
                  </Button>
                  <IconButton label="下一页" onClick={() => shift(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                  <Input
                    type="date"
                    value={selectedDay}
                    onChange={(event) => event.target.value && pickDay(event.target.value)}
                    className="w-[150px]"
                  />
                </div>
              }
            />
            <ScheduleBoard
              view={view}
              anchor={anchor}
              selectedDay={selectedDay}
              tasks={tasks}
              onMove={handleMove}
              onReorder={handleReorder}
              onOpen={(task) => void openDetail(task.id)}
              onToggleTask={(task) => handleQuickToggle(task)}
              onRemoveTask={(task) => handleQuickRemove(task)}
              onNeedDueChange={(request) => setDueChangeAsk(request)}
              onSelectDay={pickDay}
              onCreateAt={(dayKey) => openCreate(dayKey)}
            />
          </Card>

          {view === 'day' ? <DayReviewCard day={selectedDay} /> : null}
        </>
      )}

      <TaskForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
          setDefaultDue(null)
        }}
        initial={editing}
        defaultProjectId={filter.projectId}
        defaultDueAt={defaultDue}
      />
      <TaskDetailDrawer />
      <RecycleBinModal open={recycleOpen} onClose={() => setRecycleOpen(false)} />

      <ConfirmDialog
        open={toggleAsk !== null}
        title={toggleAsk?.status === 'done' ? '撤销完成状态' : '标记为已完成'}
        description={`确定要将「${toggleAsk?.title ?? ''}」${toggleAsk?.status === 'done' ? '重新标记为待开始吗？' : '标记为已完成吗？'}`}
        confirmText={toggleAsk?.status === 'done' ? '确认撤销' : '确认完成'}
        tone="primary"
        onCancel={() => setToggleAsk(null)}
        onConfirm={() => {
          const task = toggleAsk
          setToggleAsk(null)
          if (task) void executeToggle(task)
        }}
      />

      <ConfirmDialog
        open={quickConfirm !== null}
        title={quickConfirm?.type === 'toggle' ? '标记为已完成' : '删除任务'}
        description={
          quickConfirm?.type === 'toggle'
            ? `确定要将「${quickConfirm?.task.title ?? ''}」标记为已完成吗？`
            : `确定要删除「${quickConfirm?.task.title ?? ''}」吗？任务会先进入回收站，保留期内可恢复。`
        }
        confirmText={quickConfirm?.type === 'toggle' ? '确认完成' : '确认删除'}
        tone={quickConfirm?.type === 'toggle' ? 'primary' : 'danger'}
        onCancel={() => setQuickConfirm(null)}
        onConfirm={() => void executeQuick()}
      />

      <ConfirmDialog
        open={dueChangeAsk !== null}
        title="拖拽将打乱时间顺序"
        description={`「${dueChangeAsk?.task.title ?? ''}」的截止时间（${dueChangeAsk ? formatDateTime(dueChangeAsk.task.dueAt) : ''}）早于「${dueChangeAsk?.conflict.refTitle ?? ''}」（${dueChangeAsk ? formatDateTime(dueChangeAsk.conflict.newDueAt) : ''}）。是否将被拖任务的截止时间修改为后者？不修改则本次拖拽不会生效。`}
        confirmText="修改截止时间并移动"
        tone="primary"
        onCancel={() => setDueChangeAsk(null)}
        onConfirm={() => void executeDueChange()}
      />
    </div>
  )
}

function DayReviewCard({ day }: { day: string }): JSX.Element {
  const reviews = useScheduleStore((state) => state.reviews)
  const loadReviews = useScheduleStore((state) => state.loadReviews)
  const gradeReview = useScheduleStore((state) => state.gradeReview)
  const planReview = useScheduleStore((state) => state.planReview)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const pushToast = useAppStore((state) => state.pushToast)

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  const due = reviews.filter((item) => item.status === 'active' && item.dueAt <= `${day}T23:59:59`)

  const handleGrade = async (id: number, rating: 0 | 1 | 2 | 3): Promise<void> => {
    const review = await gradeReview(id, rating)
    await refreshOverview()
    pushToast({ title: '复习已评分', description: `下次复习 ${review.dueAt.slice(0, 10)}`, tone: 'success' })
  }

  const handlePlan = async (id: number): Promise<void> => {
    await planReview(id, day)
    pushToast({ title: `已排入 ${day}`, tone: 'info' })
  }

  return (
    <Card>
      <SectionHeader title="当日到期复习" description={`${due.length} 条内容按遗忘曲线到期`} />
      <ReviewQueue
        items={due}
        onGrade={handleGrade}
        onPlanTomorrow={handlePlan}
        compact
        emptyHint="该日期没有到期的复习内容"
      />
    </Card>
  )
}

interface TaskRowProps {
  task: Task
  dragging: boolean
  dropTarget: boolean
  onToggle: () => void
  onOpen: () => void
  onEdit: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}

function TaskRow({
  task,
  dragging,
  dropTarget,
  onToggle,
  onOpen,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: TaskRowProps): JSX.Element {
  const overdue = isOverdue(task.dueAt)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex cursor-grab items-start gap-4 px-5 py-3.5 transition-all active:cursor-grabbing hover:bg-muted/30',
        task.isPriority && 'border-l-2 border-l-danger bg-danger/5',
        dragging && 'opacity-40',
        dropTarget && 'ring-1 ring-inset ring-primary/60'
      )}
    >
      <GripVertical
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground'
        )}
      />
      <button
        type="button"
        aria-label="切换完成状态"
        onClick={onToggle}
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
          task.status === 'done'
            ? 'border-success bg-success/25'
            : 'border-border hover:border-success hover:bg-success/15'
        )}
      >
        {task.status === 'done' ? <CheckCircle2 className="h-3 w-3 text-success" /> : null}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-sm font-medium',
              task.isPriority ? 'text-danger' : 'text-foreground',
              task.status === 'done' && 'text-muted-foreground line-through'
            )}
          >
            {task.title}
          </p>
          {task.isPriority ? (
            <Badge tone="danger">
              <Star className="h-2.5 w-2.5 fill-current" />
              优先事项
            </Badge>
          ) : null}
        </div>

        {task.detail ? <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{task.detail}</p> : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="default">{TASK_STATUS_META[task.status].label}</Badge>
          {task.projectName ? <Badge tone="primary">{task.projectName}</Badge> : null}
          <Badge tone={overdue ? 'danger' : 'default'}>
            <CalendarClock className="h-2.5 w-2.5" />
            {relativeDay(task.dueAt)}
          </Badge>
          {task.isOverdue ? <Badge tone="warning">逾期事项</Badge> : null}
          <Badge tone="info">
            <Timer className="h-2.5 w-2.5" />
            {formatMinutes(task.estimateMinutes)}
          </Badge>
          {task.focusMinutes ? <Badge tone="success">已投入 {formatMinutes(task.focusMinutes)}</Badge> : null}
          {task.noteCount ? <Badge tone="default">笔记 {task.noteCount}</Badge> : null}
          {task.pendingReviews ? <Badge tone="danger">待复习 {task.pendingReviews}</Badge> : null}
          {task.tags.map((tag) => (
            <Badge key={tag} tone="warning">
              #{tag}
            </Badge>
          ))}
        </div>

        {task.progress > 0 ? (
          <Progress
            value={task.progress}
            className="mt-2.5 max-w-md"
            tone={task.status === 'done' ? 'success' : task.isPriority ? 'warning' : 'primary'}
          />
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton label="编辑任务" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
