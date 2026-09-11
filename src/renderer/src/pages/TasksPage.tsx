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
  List,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Star,
  Timer
} from 'lucide-react'
import type { Task, TaskStatus } from '@shared/types/domain'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Progress, Skeleton } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { TaskForm } from '../components/task/TaskForm'
import { TaskDetailDrawer } from '../components/task/TaskDetailDrawer'
import { ScheduleBoard, type BoardView } from '../components/task/ScheduleBoard'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useTaskStore } from '../stores/taskStore'
import { useScheduleStore } from '../stores/scheduleStore'
import { useAppStore } from '../stores/appStore'
import { TASK_STATUS_META } from '@shared/constants'
import {
  addDays,
  cn,
  dateKey,
  formatMinutes,
  isOverdue,
  relativeDay,
  toDate,
  todayKey,
  weekdayCN,
  formatDateCN
} from '../lib/utils'

type PageView = BoardView | 'list'

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待开始' },
  { key: 'doing', label: '进行中' },
  { key: 'blocked', label: '受阻' },
  { key: 'done', label: '已完成' }
]

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

  useEffect(() => {
    void load()
  }, [load])

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

  const today = todayKey()
  const priorityCount = tasks.filter((task) => task.isPriority && task.status !== 'done').length
  const doneCount = tasks.filter((task) => task.status === 'done').length

  const onToggle = async (task: Task): Promise<void> => {
    await toggleTask(task.id)
    await refreshOverview()
  }

  const openCreate = (dayKey?: string): void => {
    setEditing(null)
    setDefaultDue(dayKey ? `${dayKey}T09:00:00` : null)
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

  const statusCount = (key: TaskStatus | 'all'): number =>
    key === 'all' ? tasks.length : tasks.filter((task) => task.status === key).length

  const viewTabs: { key: PageView; label: string; icon: JSX.Element }[] = [
    { key: 'day', label: '当日', icon: <CalendarClock className="h-3 w-3" /> },
    { key: 'week', label: '本周', icon: <CalendarDays className="h-3 w-3" /> },
    { key: 'month', label: '本月', icon: <CalendarRange className="h-3 w-3" /> },
    { key: 'list', label: '清单', icon: <List className="h-3 w-3" /> }
  ]

  return (
    <div className="grid gap-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">今日</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {formatDateCN(today)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{weekdayCN(today)}</span>
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              共 {tasks.length} 项事项 · 优先事项 {priorityCount} 项 · 已完成 {doneCount} 项
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => openCreate(view === 'day' ? selectedDay : undefined)}
            >
              新建任务
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs size="sm" value={view} onChange={(key) => setView(key as PageView)} items={viewTabs} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={keywordDraft}
                onChange={(event) => setKeywordDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void setFilter({ keyword: keywordDraft })
                }}
                placeholder="搜索任务，回车生效"
                className="h-full flex-1 border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />
              {keywordDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    setKeywordDraft('')
                    void setFilter({ keyword: '' })
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  清空
                </button>
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
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => void onToggle(task)}
                  onOpen={() => void openDetail(task.id)}
                  onEdit={() => {
                    setEditing(task)
                    setDefaultDue(null)
                    setFormOpen(true)
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
              description="拖拽卡片可在任意日期之间移动，同一日期内拖动可自由排序；优先事项以红色标识"
            />
            <ScheduleBoard
              view={view}
              anchor={anchor}
              selectedDay={selectedDay}
              tasks={tasks}
              onMove={handleMove}
              onReorder={handleReorder}
              onOpen={(task) => void openDetail(task.id)}
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
  onToggle: () => void
  onOpen: () => void
  onEdit: () => void
}

function TaskRow({ task, onToggle, onOpen, onEdit }: TaskRowProps): JSX.Element {
  const overdue = isOverdue(task.dueAt)
  return (
    <div
      className={cn(
        'group flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30',
        task.isPriority && 'border-l-2 border-l-danger bg-danger/5'
      )}
    >
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
