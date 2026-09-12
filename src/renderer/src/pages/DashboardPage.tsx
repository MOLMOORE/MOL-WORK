import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  GripVertical,
  ListChecks,
  NotebookPen,
  Star,
  Timer,
  TriangleAlert
} from 'lucide-react'
import type { DailyReport, Task } from '@shared/types/domain'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge, EmptyState, Progress, Skeleton } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Overlay'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { GridBoard, type GridEntry } from '../components/layout/GridBoard'
import { ClockTile } from '../components/layout/ClockTile'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { useScheduleStore } from '../stores/scheduleStore'
import { api } from '../lib/ipc'
import { TASK_STATUS_META } from '@shared/constants'
import {
  addDays,
  cn,
  detectOrderConflict,
  formatDay,
  formatDateTime,
  formatMinutes,
  relativeDay,
  todayKey,
  type OrderConflict
} from '../lib/utils'

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate()
  const overview = useAppStore((state) => state.overview)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const pushToast = useAppStore((state) => state.pushToast)
  const toggleTask = useTaskStore((state) => state.toggleTask)
  const updateTask = useTaskStore((state) => state.updateTask)
  const reorderTasks = useTaskStore((state) => state.reorderTasks)
  const [report, setReport] = useState<DailyReport | null>(null)
  const [todayOrder, setTodayOrder] = useState<number[] | null>(null)
  const [todayDragId, setTodayDragId] = useState<number | null>(null)
  const [todayOverId, setTodayOverId] = useState<number | null>(null)
  /** 勾选完成前的确认 */
  const [toggleAsk, setToggleAsk] = useState<Task | null>(null)
  /** 拖拽打乱时间顺序时，询问是否修改截止时间 */
  const [dueChangeAsk, setDueChangeAsk] = useState<{ task: Task; conflict: OrderConflict; orderedIds: number[] } | null>(null)

  const gradeReview = useScheduleStore((state) => state.gradeReview)
  const planReview = useScheduleStore((state) => state.planReview)
  const enqueueReviews = useScheduleStore((state) => state.enqueueReviews)

  useEffect(() => {
    void api.stats.report(todayKey()).then(setReport)
  }, [overview])

  /** 拖拽过程中的本地顺序覆盖，提交后交还给后端排序 */
  const displayTasks = useMemo(() => {
    const list = overview?.todayTasks ?? []
    if (!todayOrder) return list
    const indexOf = new Map(todayOrder.map((id, index) => [id, index] as const))
    return [...list].sort((a, b) => (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0))
  }, [overview, todayOrder])

  /** 今日任务拖拽排序：插到目标位置之前并持久化；打乱时间顺序时先弹窗确认 */
  const handleTodayDrop = useCallback(
    async (targetId: number): Promise<void> => {
      const dragId = todayDragId
      setTodayDragId(null)
      setTodayOverId(null)
      if (dragId === null || dragId === targetId || !overview) return
      const ordered = [...overview.todayTasks]
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
      setTodayOrder(ids)
      await reorderTasks(ids)
      await refreshOverview()
      setTodayOrder(null)
    },
    [todayDragId, overview, reorderTasks, refreshOverview]
  )

  /** 勾选完成：先弹窗确认防误触 */
  const executeToggle = useCallback(
    async (task: Task): Promise<void> => {
      await toggleTask(task.id)
      await refreshOverview()
    },
    [toggleTask, refreshOverview]
  )

  /** 拖拽打乱时间顺序：用户确认修改截止时间后提交 */
  const executeDueChange = useCallback(async (): Promise<void> => {
    if (!dueChangeAsk) return
    const { task, conflict, orderedIds } = dueChangeAsk
    setDueChangeAsk(null)
    await updateTask(task.id, { dueAt: conflict.newDueAt })
    await reorderTasks(orderedIds)
    await refreshOverview()
    pushToast({ title: '已调整截止时间', description: `${task.title} → ${formatDateTime(conflict.newDueAt)}`, tone: 'success' })
  }, [dueChangeAsk, updateTask, reorderTasks, refreshOverview, pushToast])

  const tomorrowKey = formatDay(addDays(new Date(), 1).toISOString())

  const handleGrade = useCallback(
    async (id: number, rating: 0 | 1 | 2 | 3): Promise<void> => {
      const review = await gradeReview(id, rating)
      await refreshOverview()
      pushToast({
        title: `已评分：${['重来', '困难', '一般', '简单'][rating]}`,
        description: `下次复习：${formatDateTime(review.dueAt)}（间隔 ${review.intervalDays} 天）`,
        tone: 'success'
      })
    },
    [gradeReview, refreshOverview, pushToast]
  )

  const handlePlanTomorrow = useCallback(
    async (id: number): Promise<void> => {
      await planReview(id, tomorrowKey)
      await refreshOverview()
      pushToast({ title: '已排入明日日程', description: `复习内容已安排到 ${tomorrowKey}`, tone: 'info' })
    },
    [planReview, refreshOverview, pushToast, tomorrowKey]
  )

  const handleEnqueueAll = useCallback(async (): Promise<void> => {
    const created = await enqueueReviews(tomorrowKey)
    await refreshOverview()
    pushToast({
      title: created > 0 ? `已排入 ${created} 条复习` : '没有需要新增排程的复习内容',
      description: `目标日期：${tomorrowKey}`,
      tone: created > 0 ? 'success' : 'info'
    })
  }, [enqueueReviews, refreshOverview, pushToast, tomorrowKey])

  const ready = Boolean(overview && report)

  const clockNode = useMemo(() => <ClockTile />, [])

  const metricNodes = useMemo(
    () => [
      <StatCard
        key="todo"
        label="今日待办"
        value={`${overview?.todayTasks.length ?? 0} 项`}
        hint={(overview?.overdueCount ?? 0) > 0 ? `${overview?.overdueCount} 项已逾期` : '暂无逾期任务'}
        tone="primary"
        icon={<ListChecks className="h-4 w-4" />}
        onClick={() => navigate('/tasks')}
      />,
      <StatCard
        key="review"
        label="到期复习"
        value={`${overview?.dueReviews.length ?? 0} 条`}
        hint="按遗忘曲线到期"
        tone="info"
        icon={<NotebookPen className="h-4 w-4" />}
        onClick={() => navigate('/notes')}
      />,
      <StatCard
        key="estimate"
        label="预计专注"
        value={formatMinutes(overview?.estimateMinutes ?? 0)}
        hint="根据今日任务预估 · 点击进入番茄钟"
        tone="warning"
        icon={<Timer className="h-4 w-4" />}
        onClick={() => navigate('/pomodoro')}
      />,
      <StatCard
        key="today"
        label="今日投入"
        value={formatMinutes(overview?.todayFocusMinutes ?? 0)}
        hint={`完成 ${overview?.todayCompleted ?? 0} 项 · 工具 ${overview?.todayToolRuns ?? 0} 次`}
        tone="success"
        icon={<Flame className="h-4 w-4" />}
        onClick={() => navigate('/stats')}
      />
    ],
    [overview, navigate]
  )

  const tasksNode = useMemo(
    () => (
      <Card className="flex h-full flex-col">
        <SectionHeader
          className="mb-3"
          title="今日任务"
          description="超时事项置顶、优先事项其次，可拖拽调整顺序、勾选完成（均有确认弹窗防误触）"
          action={
            <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/tasks')}>
              全部任务
            </Button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {displayTasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="今天没有待办任务"
              description="可以到任务页新建任务，或把未排期任务拖入日历安排时间"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {displayTasks.map((task) => {
                const statusMeta = TASK_STATUS_META[task.status]
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setTodayDragId(task.id)}
                    onDragOver={(event) => {
                      if (todayDragId === null || todayDragId === task.id) return
                      event.preventDefault()
                      setTodayOverId(task.id)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      void handleTodayDrop(task.id)
                    }}
                    onDragEnd={() => {
                      setTodayDragId(null)
                      setTodayOverId(null)
                    }}
                    className={cn(
                      'group flex cursor-grab items-start gap-3 rounded-xl border border-border/70 bg-muted/25 p-3 transition-all duration-150 hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing',
                      todayDragId === task.id && 'opacity-40',
                      todayOverId === task.id && todayDragId !== task.id && 'ring-1 ring-primary/60'
                    )}
                  >
                    <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                    <button
                      type="button"
                      aria-label="标记完成"
                      onClick={() => setToggleAsk(task)}
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border transition-all hover:border-success hover:bg-success/20"
                    >
                      <CheckCircle2 className="h-3 w-3 text-transparent transition-colors group-hover:text-success/70" />
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/tasks', { state: { taskId: task.id } })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="default">{statusMeta.label}</Badge>
                        {task.isPriority ? (
                          <Badge tone="danger">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            优先事项
                          </Badge>
                        ) : null}
                        {task.projectName ? <Badge tone="primary">{task.projectName}</Badge> : null}
                        <Badge tone={task.dueAt && task.dueAt < todayKey() ? 'danger' : 'default'}>
                          <CalendarClock className="h-2.5 w-2.5" />
                          {relativeDay(task.dueAt)}
                        </Badge>
                        {task.focusMinutes ? (
                          <Badge tone="success">
                            <Clock className="h-2.5 w-2.5" />
                            {formatMinutes(task.focusMinutes)}
                          </Badge>
                        ) : null}
                      </div>
                      {task.progress > 0 ? <Progress value={task.progress} className="mt-2" tone="success" /> : null}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    ),
    [displayTasks, todayDragId, todayOverId, handleTodayDrop, navigate]
  )

  const reviewsNode = useMemo(
    () => (
      <Card className="flex h-full flex-col">
        <SectionHeader
          className="mb-3"
          title="到期复习"
          description="按遗忘曲线评分，系统自动计算下次复习时间"
          action={
            <Button variant="outline" size="sm" onClick={() => void handleEnqueueAll()}>
              全部排入明日
            </Button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ReviewQueue
            items={overview?.dueReviews ?? []}
            onGrade={handleGrade}
            onPlanTomorrow={handlePlanTomorrow}
            compact
            emptyHint="今天没有到期的复习内容"
          />
        </div>
      </Card>
    ),
    [overview, handleGrade, handlePlanTomorrow, handleEnqueueAll]
  )

  const reportNode = useMemo(
    () => (
      <Card className="flex h-full flex-col">
        <SectionHeader
          className="mb-3"
          title="日报摘要"
          description={report ? `生成时间 ${report.generatedAt.replace('T', ' ').slice(0, 16)}` : '正在生成…'}
          action={
            <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/stats')}>
              统计复盘
            </Button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-xs leading-relaxed text-muted-foreground">{report?.summary ?? ''}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(report?.highlights ?? []).slice(0, 4).map((item) => (
              <Badge key={item} tone="primary">
                {item}
              </Badge>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#FCD34D]">
              <TriangleAlert className="h-3 w-3" />
              复盘建议
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {(report?.suggestions ?? []).slice(0, 3).map((item) => (
                <li key={item} className="text-[11px] leading-relaxed text-muted-foreground">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    ),
    [report, navigate]
  )

  const notesNode = useMemo(
    () => (
      <Card className="flex h-full flex-col">
        <SectionHeader
          className="mb-3"
          title="最近笔记与资料"
          description="任务下沉淀的笔记会自动生成复习计划"
          action={
            <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/notes')}>
              进入笔记
            </Button>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {(overview?.recentNotes.length ?? 0) === 0 ? (
            <EmptyState icon={<NotebookPen className="h-5 w-5" />} title="还没有笔记" description="在笔记页新建一篇笔记，系统会自动安排遗忘曲线复习" />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(overview?.recentNotes ?? []).map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => navigate('/notes', { state: { noteId: note.id } })}
                  className="glass-card-hover p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={note.kind === 'material' ? 'warning' : note.kind === 'flashcard' ? 'info' : 'primary'}>
                      {note.kind === 'material' ? '资料' : note.kind === 'flashcard' ? '卡片' : '笔记'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{note.updatedAt.slice(5, 10)}</span>
                  </div>
                  <p className="mt-2 truncate text-xs font-medium text-foreground">{note.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {note.content.replace(/[#>*`]/g, '').slice(0, 90) || '暂无正文'}
                  </p>
                  {note.taskTitle ? <p className="mt-2 truncate text-[10px] text-muted-foreground">所属任务：{note.taskTitle}</p> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>
    ),
    [overview, navigate]
  )

  const entries = useMemo<GridEntry[]>(
    () => [
      { id: 'clock', title: '时间显示', x: 4, y: 0, w: 4, h: 3, minW: 3, minH: 2, node: clockNode },
      { id: 'metric-todo', title: '今日待办', x: 0, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[0] },
      { id: 'metric-review', title: '到期复习', x: 3, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[1] },
      { id: 'metric-estimate', title: '预计专注', x: 6, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[2] },
      { id: 'metric-today', title: '今日投入', x: 9, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[3] },
      { id: 'tasks', title: '今日任务', x: 0, y: 5, w: 8, h: 10, minW: 5, minH: 5, node: tasksNode },
      { id: 'reviews', title: '到期复习', x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 4, node: reviewsNode },
      { id: 'report', title: '日报摘要', x: 8, y: 10, w: 4, h: 5, minW: 3, minH: 4, node: reportNode },
      { id: 'notes', title: '最近笔记与资料', x: 0, y: 15, w: 12, h: 6, minW: 5, minH: 4, node: notesNode }
    ],
    [clockNode, metricNodes, tasksNode, reviewsNode, reportNode, notesNode]
  )

  return (
    <div className="grid gap-5">
      {ready ? (
        <GridBoard entries={entries} storageKey="workstation.grid.dashboard.v1" />
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-[98px]" />
            ))}
          </div>
          <Skeleton className="h-[280px]" />
          <Skeleton className="h-[240px]" />
        </div>
      )}

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
