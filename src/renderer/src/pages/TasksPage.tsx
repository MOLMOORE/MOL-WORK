import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  Columns3,
  Filter,
  ListChecks,
  Pencil,
  Plus,
  Rows3,
  Search,
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
import { useTaskStore } from '../stores/taskStore'
import { useAppStore } from '../stores/appStore'
import { PRIORITY_META, TASK_STATUS_META } from '@shared/constants'
import { cn, formatMinutes, isOverdue, relativeDay } from '../lib/utils'

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
    view,
    loading,
    load,
    setFilter,
    setView,
    openDetail,
    toggleTask
  } = useTaskStore()
  const refreshOverview = useAppStore((state) => state.refreshOverview)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
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

  const onToggle = async (task: Task): Promise<void> => {
    await toggleTask(task.id)
    await refreshOverview()
  }

  const statusCount = (key: TaskStatus | 'all'): number =>
    key === 'all' ? tasks.length : tasks.filter((task) => task.status === key).length

  return (
    <div className="grid gap-5">
      <Card>
        <SectionHeader
          title="筛选与视图"
          description="按项目、状态、截止情况组合筛选任务"
          action={
            <>
              <Tabs
                size="sm"
                value={view}
                onChange={(key) => setView(key as 'list' | 'board')}
                items={[
                  { key: 'list', label: '列表', icon: <Rows3 className="h-3 w-3" /> },
                  { key: 'board', label: '看板', icon: <Columns3 className="h-3 w-3" /> }
                ]}
              />
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                新建任务
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-border bg-input/60 px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void setFilter({ keyword: keywordDraft })
              }}
              placeholder="搜索任务标题、说明或标签，回车生效"
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
            onChange={(event) => void setFilter({ projectId: event.target.value === '' ? null : Number(event.target.value) })}
            className="w-[190px]"
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

        <div className="mt-3">
          <Tabs
            size="sm"
            value={filter.status}
            onChange={(key) => void setFilter({ status: key as TaskStatus | 'all' })}
            items={STATUS_TABS.map((tab) => ({ key: tab.key, label: tab.label, count: statusCount(tab.key) }))}
          />
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-[86px]" />
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
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
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
                    setFormOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {(['todo', 'doing', 'blocked', 'done'] as TaskStatus[]).map((status) => {
            const list = grouped.get(status) ?? []
            return (
              <Card key={status} className="min-h-[220px]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: TASK_STATUS_META[status].color }}
                    />
                    <p className="text-xs font-semibold text-foreground">{TASK_STATUS_META[status].label}</p>
                  </div>
                  <Badge tone="default">{list.length}</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {list.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                      暂无任务
                    </p>
                  ) : (
                    list.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => void openDetail(task.id)}
                        className="glass-card-hover p-3 text-left"
                      >
                        <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge tone={task.priority === 1 ? 'danger' : task.priority === 2 ? 'warning' : 'info'}>
                            {PRIORITY_META[task.priority].label}
                          </Badge>
                          {task.projectName ? <Badge tone="primary">{task.projectName}</Badge> : null}
                          <Badge tone={isOverdue(task.dueAt) ? 'danger' : 'default'}>{relativeDay(task.dueAt)}</Badge>
                        </div>
                        {task.progress > 0 ? <Progress value={task.progress} className="mt-2" tone="success" /> : null}
                      </button>
                    ))
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <TaskForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        initial={editing}
        defaultProjectId={filter.projectId}
      />
      <TaskDetailDrawer />
    </div>
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
    <div className="group flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30">
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
              'truncate text-sm font-medium text-foreground',
              task.status === 'done' && 'text-muted-foreground line-through'
            )}
          >
            {task.title}
          </p>
          <Badge tone={task.priority === 1 ? 'danger' : task.priority === 2 ? 'warning' : 'info'}>
            {PRIORITY_META[task.priority].label}优先级
          </Badge>
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

        {task.progress > 0 ? <Progress value={task.progress} className="mt-2.5 max-w-md" tone={task.status === 'done' ? 'success' : 'primary'} /> : null}
      </button>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton label="编辑任务" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
