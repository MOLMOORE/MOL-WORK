import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  ListChecks,
  NotebookPen,
  Timer,
  TriangleAlert
} from 'lucide-react'
import type { DailyReport } from '@shared/types/domain'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge, EmptyState, Progress, Skeleton } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { useScheduleStore } from '../stores/scheduleStore'
import { api } from '../lib/ipc'
import { TASK_STATUS_META, PRIORITY_META } from '@shared/constants'
import { addDays, formatDay, formatDateTime, formatMinutes, relativeDay, todayKey } from '../lib/utils'

export function DashboardPage(): JSX.Element {
  const navigate = useNavigate()
  const overview = useAppStore((state) => state.overview)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const pushToast = useAppStore((state) => state.pushToast)
  const toggleTask = useTaskStore((state) => state.toggleTask)
  const [report, setReport] = useState<DailyReport | null>(null)

  const gradeReview = useScheduleStore((state) => state.gradeReview)
  const planReview = useScheduleStore((state) => state.planReview)
  const enqueueReviews = useScheduleStore((state) => state.enqueueReviews)

  useEffect(() => {
    void api.stats.report(todayKey()).then(setReport)
  }, [overview])

  if (!overview || !report) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-[98px]" />
          ))}
        </div>
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[240px]" />
      </div>
    )
  }

  const tomorrowKey = formatDay(addDays(new Date(), 1).toISOString())

  const handleGrade = async (id: number, rating: 0 | 1 | 2 | 3): Promise<void> => {
    const review = await gradeReview(id, rating)
    await refreshOverview()
    pushToast({
      title: `已评分：${['重来', '困难', '一般', '简单'][rating]}`,
      description: `下次复习：${formatDateTime(review.dueAt)}（间隔 ${review.intervalDays} 天）`,
      tone: 'success'
    })
  }

  const handlePlanTomorrow = async (id: number): Promise<void> => {
    await planReview(id, tomorrowKey)
    await refreshOverview()
    pushToast({ title: '已排入明日日程', description: `复习内容已安排到 ${tomorrowKey}`, tone: 'info' })
  }

  const handleEnqueueAll = async (): Promise<void> => {
    const created = await enqueueReviews(tomorrowKey)
    await refreshOverview()
    pushToast({
      title: created > 0 ? `已排入 ${created} 条复习` : '没有需要新增排程的复习内容',
      description: `目标日期：${tomorrowKey}`,
      tone: created > 0 ? 'success' : 'info'
    })
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="今日待办"
          value={`${overview.todayTasks.length} 项`}
          hint={overview.overdueCount > 0 ? `${overview.overdueCount} 项已逾期` : '暂无逾期任务'}
          tone="primary"
          icon={<ListChecks className="h-4 w-4" />}
          onClick={() => navigate('/tasks')}
        />
        <StatCard
          label="到期复习"
          value={`${overview.dueReviews.length} 条`}
          hint="按遗忘曲线到期"
          tone="info"
          icon={<NotebookPen className="h-4 w-4" />}
          onClick={() => navigate('/notes')}
        />
        <StatCard
          label="预计专注"
          value={formatMinutes(overview.estimateMinutes)}
          hint="根据今日任务预估"
          tone="warning"
          icon={<Timer className="h-4 w-4" />}
        />
        <StatCard
          label="今日投入"
          value={formatMinutes(overview.todayFocusMinutes)}
          hint={`完成 ${overview.todayCompleted} 项 · 工具 ${overview.todayToolRuns} 次`}
          tone="success"
          icon={<Flame className="h-4 w-4" />}
          onClick={() => navigate('/stats')}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <SectionHeader
            title="今日任务"
            description="按优先级与截止时间排序，可直接勾选完成"
            action={
              <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/tasks')}>
                全部任务
              </Button>
            }
          />
          {overview.todayTasks.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="今天没有待办任务"
              description="可以到任务页新建任务，或把未排期任务拖入日历安排时间"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {overview.todayTasks.map((task) => {
                const statusMeta = TASK_STATUS_META[task.status]
                return (
                  <div
                    key={task.id}
                    className="group flex items-start gap-3 rounded-xl border border-border/70 bg-muted/25 p-3 transition-all duration-150 hover:border-primary/40 hover:bg-muted/40"
                  >
                    <button
                      type="button"
                      aria-label="标记完成"
                      onClick={() => void toggleTask(task.id).then(refreshOverview)}
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
                        <Badge tone={task.priority === 1 ? 'danger' : task.priority === 2 ? 'warning' : 'info'}>
                          {PRIORITY_META[task.priority].label}优先级
                        </Badge>
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
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader
              title="到期复习"
              description="按遗忘曲线评分，系统自动计算下次复习时间"
              action={
                <Button variant="outline" size="sm" onClick={handleEnqueueAll}>
                  全部排入明日
                </Button>
              }
            />
            <ReviewQueue
              items={overview.dueReviews}
              onGrade={handleGrade}
              onPlanTomorrow={handlePlanTomorrow}
              compact
              emptyHint="今天没有到期的复习内容"
            />
          </Card>

          <Card>
            <SectionHeader
              title="日报摘要"
              description={`生成时间 ${report.generatedAt.replace('T', ' ').slice(0, 16)}`}
              action={
                <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/stats')}>
                  统计复盘
                </Button>
              }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.highlights.slice(0, 4).map((item) => (
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
                {report.suggestions.slice(0, 3).map((item) => (
                  <li key={item} className="text-[11px] leading-relaxed text-muted-foreground">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <SectionHeader
          title="最近笔记与资料"
          description="任务下沉淀的笔记会自动生成复习计划"
          action={
            <Button variant="ghost" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => navigate('/notes')}>
              进入笔记
            </Button>
          }
        />
        {overview.recentNotes.length === 0 ? (
          <EmptyState icon={<NotebookPen className="h-5 w-5" />} title="还没有笔记" description="在笔记页新建一篇笔记，系统会自动安排遗忘曲线复习" />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.recentNotes.map((note) => (
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
      </Card>
    </div>
  )
}
