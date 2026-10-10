import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarRange, FileText, TrendingUp } from 'lucide-react'
import type { DailyStats, FocusSession, Task, ToolRunRecord } from '@shared/types/domain'
import { Modal } from '../ui/Overlay'
import { Button } from '../ui/Button'
import { Badge, EmptyState, Spinner } from '../ui/Feedback'
import { api } from '../../lib/ipc'
import { formatDateTime, formatDurationMs, formatMinutes } from '../../lib/utils'

export type MetricDetailKind = 'focus' | 'completed' | 'tools' | 'today'

export interface MetricDetailDialogProps {
  kind: MetricDetailKind | null
  rangeFrom: string
  rangeTo: string
  toolRuns: ToolRunRecord[]
  daily: DailyStats | null
  onClose: () => void
  onNavigate: (path: string) => void
}

const META: Record<MetricDetailKind, { title: string; description: string; icon: JSX.Element; path: string; pathLabel: string }> = {
  focus: {
    title: '区间专注明细',
    description: '统计区间内每一次专注计时记录',
    icon: <TrendingUp className="h-4 w-4" />,
    path: '/focus',
    pathLabel: '前往专注'
  },
  completed: {
    title: '区间完成任务',
    description: '统计区间内完成的事项清单',
    icon: <BarChart3 className="h-4 w-4" />,
    path: '/tasks',
    pathLabel: '前往任务'
  },
  tools: {
    title: '区间工具调用',
    description: '统计区间内每一次工具执行记录',
    icon: <FileText className="h-4 w-4" />,
    path: '/tools',
    pathLabel: '前往工具集市'
  },
  today: {
    title: '今日快照',
    description: '今日专注、完成、复习与工具调用概览',
    icon: <CalendarRange className="h-4 w-4" />,
    path: '/',
    pathLabel: '前往仪表盘'
  }
}

/**
 * 指标卡点击后的明细弹窗：点击统计页四个概览卡即可查看该指标的真实明细，
 * 数据全部来自本地记录，不产生任何额外聚合口径。
 */
export function MetricDetailDialog({
  kind,
  rangeFrom,
  rangeTo,
  toolRuns,
  daily,
  onClose,
  onNavigate
}: MetricDetailDialogProps): JSX.Element | null {
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (kind !== 'focus' && kind !== 'completed') return undefined
    let active = true
    setLoading(true)
    // 专注记录按完整时间戳比较，需要把日期区间补足为当天 00:00:00 ~ 23:59:59
    const request =
      kind === 'focus'
        ? api.focus
            .listRange(`${rangeFrom}T00:00:00`, `${rangeTo}T23:59:59`)
            .then((data) => {
              if (active) setSessions(data)
            })
        : api.task.list({ status: 'all' }).then((data) => {
            if (active) setTasks(data)
          })
    void request
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [kind, rangeFrom, rangeTo])

  const completedTasks = useMemo(
    () =>
      tasks
        .filter((task) => {
          if (!task.completedAt) return false
          const key = task.completedAt.slice(0, 10)
          return key >= rangeFrom && key <= rangeTo
        })
        .sort((a, b) => (a.completedAt ?? '' < (b.completedAt ?? '') ? 1 : -1)),
    [tasks, rangeFrom, rangeTo]
  )

  const windowToolRuns = useMemo(
    () => toolRuns.filter((run) => run.createdAt.slice(0, 10) >= rangeFrom && run.createdAt.slice(0, 10) <= rangeTo),
    [toolRuns, rangeFrom, rangeTo]
  )

  if (!kind) return null
  const meta = META[kind]

  const focusTotal = sessions.reduce((sum, session) => sum + session.durationMinutes, 0)
  const toolTotalMs = windowToolRuns.reduce((sum, run) => sum + run.durationMs, 0)
  const successCount = windowToolRuns.filter((run) => run.status === 'success').length
  const successRate = windowToolRuns.length === 0 ? 0 : Math.round((successCount / windowToolRuns.length) * 100)

  const summary =
    kind === 'focus' ? (
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SummaryCell label="总时长" value={formatMinutes(focusTotal)} />
        <SummaryCell label="专注次数" value={`${sessions.length} 次`} />
        <SummaryCell label="单次平均" value={formatMinutes(sessions.length === 0 ? 0 : focusTotal / sessions.length)} />
      </div>
    ) : kind === 'completed' ? (
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SummaryCell label="完成任务" value={`${completedTasks.length} 项`} />
        <SummaryCell label="涉及项目" value={`${new Set(completedTasks.map((task) => task.projectName ?? '未归属')).size} 个`} />
        <SummaryCell
          label="平均进度"
          value={`${completedTasks.length === 0 ? 0 : Math.round(completedTasks.reduce((sum, task) => sum + task.progress, 0) / completedTasks.length)}%`}
        />
      </div>
    ) : kind === 'tools' ? (
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SummaryCell label="调用次数" value={`${windowToolRuns.length} 次`} />
        <SummaryCell label="累计耗时" value={formatDurationMs(toolTotalMs)} />
        <SummaryCell label="成功率" value={`${successRate}%`} />
      </div>
    ) : (
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SummaryCell label="今日专注" value={formatMinutes(daily?.focusMinutes ?? 0)} />
        <SummaryCell label="今日完成" value={`${daily?.tasksCompleted ?? 0} 项`} />
        <SummaryCell label="复习" value={`${daily?.reviewsDone ?? 0}/${daily?.reviewsDue ?? 0}`} />
      </div>
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={meta.title}
      description={`${meta.description} · ${rangeFrom} ~ ${rangeTo}`}
      width="max-w-2xl"
      footer={
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onClose()
            onNavigate(meta.path)
          }}
        >
          {meta.pathLabel}
        </Button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Spinner />
          <span className="text-sm">正在加载明细…</span>
        </div>
      ) : (
        <div>
          {summary}
          {kind === 'focus' ? (
            sessions.length === 0 ? (
              <EmptyState title="区间内没有专注记录" description="开始一次专注计时后会在这里出现明细" />
            ) : (
              <div className="flex flex-col gap-2">
                {sessions.map((session) => (
                  <Row
                    key={session.id}
                    title={session.taskTitle ?? '自由专注'}
                    right={formatMinutes(session.durationMinutes)}
                    meta={`${formatDateTime(session.startedAt)}${session.note ? ` · ${session.note}` : ''}`}
                  />
                ))}
              </div>
            )
          ) : null}

          {kind === 'completed' ? (
            completedTasks.length === 0 ? (
              <EmptyState title="区间内没有完成记录" description="完成任务、拖拽到已完成都会计入这里" />
            ) : (
              <div className="flex flex-col gap-2">
                {completedTasks.map((task) => (
                  <Row
                    key={task.id}
                    title={task.title}
                    right="已完成"
                    meta={`${formatDateTime(task.completedAt)} · ${task.projectName ?? '未归属'}`}
                  />
                ))}
              </div>
            )
          ) : null}

          {kind === 'tools' ? (
            windowToolRuns.length === 0 ? (
              <EmptyState title="区间内没有工具调用" description="工具执行明细会出现在这里" />
            ) : (
              <div className="flex flex-col gap-2">
                {windowToolRuns.map((run) => (
                  <Row
                    key={run.id}
                    title={run.toolName}
                    right={formatDurationMs(run.durationMs)}
                    meta={`${formatDateTime(run.createdAt)} · ${run.inputSummary || '无输入摘要'}`}
                    tone={run.status === 'success' ? 'success' : 'danger'}
                    badgeText={run.status === 'success' ? '成功' : '失败'}
                  />
                ))}
              </div>
            )
          ) : null}

          {kind === 'today' ? (
            daily && daily.timeline.length > 0 ? (
              <div className="flex flex-col gap-2">
                {daily.timeline.map((entry) => (
                  <Row
                    key={entry.id}
                    title={entry.title}
                    right={entry.durationMinutes > 0 ? formatMinutes(entry.durationMinutes) : ''}
                    meta={`${entry.at.slice(5, 16).replace('T', ' ')} · ${entry.detail}`}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="今日还没有记录" description="专注、任务、复习与工具调用都进这条时间线" />
            )
          ) : null}
        </div>
      )}
    </Modal>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function Row({
  title,
  right,
  meta,
  tone,
  badgeText
}: {
  title: string
  right?: string
  meta: string
  tone?: 'success' | 'danger'
  badgeText?: string
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badgeText ? <Badge tone={tone ?? 'default'}>{badgeText}</Badge> : null}
        {right ? <span className="text-[11px] text-muted-foreground">{right}</span> : null}
      </div>
    </div>
  )
}
