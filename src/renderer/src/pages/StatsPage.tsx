import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileText,
  TrendingUp,
  TriangleAlert
} from 'lucide-react'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { TrendPanel } from '../components/stats/TrendPanel'
import { ProjectDonut, SeverityDistribution, ToolUsageDonut } from '../components/stats/DistributionPanel'
import { ReportPanel } from '../components/stats/ReportPanel'
import { TREND_RANGES, trendWindow, useStatsStore, type TrendDays } from '../stores/statsStore'
import { useAppStore } from '../stores/appStore'
import { formatMinutes, todayKey } from '../lib/utils'

export function StatsPage(): JSX.Element {
  const navigate = useNavigate()
  const trendDays = useStatsStore((state) => state.trendDays)
  const anchor = useStatsStore((state) => state.anchor)
  const daily = useStatsStore((state) => state.daily)
  const trendData = useStatsStore((state) => state.trendData)
  const projects = useStatsStore((state) => state.projects)
  const procrastinated = useStatsStore((state) => state.procrastinated)
  const report = useStatsStore((state) => state.report)
  const toolRuns = useStatsStore((state) => state.toolRuns)
  const loading = useStatsStore((state) => state.loading)
  const load = useStatsStore((state) => state.load)
  const setTrendDays = useStatsStore((state) => state.setTrendDays)
  const setAnchor = useStatsStore((state) => state.setAnchor)
  const shift = useStatsStore((state) => state.shift)
  const overview = useAppStore((state) => state.overview)

  useEffect(() => {
    void load()
  }, [load])

  const window = trendWindow(trendDays, anchor)

  const totals = useMemo(() => {
    const focus = trendData.reduce((sum, point) => sum + point.focusMinutes, 0)
    const tool = trendData.reduce((sum, point) => sum + point.toolMinutes, 0)
    const completed = trendData.reduce((sum, point) => sum + point.completed, 0)
    const reviews = trendData.reduce((sum, point) => sum + point.reviews, 0)
    const runs = trendData.reduce((sum, point) => sum + point.toolRuns, 0)
    const activeDays = trendData.filter((point) => point.focusMinutes > 0 || point.completed > 0).length
    return {
      focus,
      tool,
      completed,
      reviews,
      runs,
      activeDays,
      average: trendData.length === 0 ? 0 : Math.round(focus / trendData.length)
    }
  }, [trendData])

  const windowToolRuns = useMemo(
    () => toolRuns.filter((run) => run.createdAt.slice(0, 10) >= window.from && run.createdAt.slice(0, 10) <= window.to),
    [toolRuns, window.from, window.to]
  )

  const highSeverity = procrastinated.filter((item) => item.severity === 'high').length

  return (
    <div className="grid gap-5">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-12 -top-16 h-52 w-52 rounded-full bg-info/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Badge tone="success" dot>
              阶段三已交付
            </Badge>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">统计与复盘</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              以「任务 → 日程 / 专注 / 工具」全链路数据为底，趋势图、投入环形图与日报导出全部基于真实记录聚合，
              数据存储在本机 SQLite，无任何云端上传。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              size="sm"
              value={String(trendDays)}
              onChange={(key) => void setTrendDays(Number(key) as TrendDays)}
              items={TREND_RANGES.map((days) => ({ key: String(days), label: `${days} 天` }))}
            />
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => void shift(-1)} title="上一区间">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={anchor === todayKey()}
                onClick={() => void setAnchor(todayKey())}
              >
                回到今天
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void shift(1)} title="下一区间">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <p className="relative mt-3 text-[11px] text-muted-foreground">
          当前区间：{window.from} ~ {window.to} · 共 {trendDays} 天 · 活跃 {totals.activeDays} 天
        </p>
      </Card>

      {loading && trendData.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          <span className="text-sm">正在聚合统计数据…</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="区间专注总时长"
          value={formatMinutes(totals.focus)}
          hint={`日均 ${formatMinutes(totals.average)}`}
          tone="success"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="区间完成任务"
          value={`${totals.completed} 项`}
          hint={`复习 ${totals.reviews} 条`}
          tone="primary"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="区间工具调用"
          value={`${totals.runs} 次`}
          hint={`累计耗时 ${formatMinutes(totals.tool)}`}
          tone="warning"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="今日快照"
          value={formatMinutes(daily?.focusMinutes ?? 0)}
          hint={`完成 ${daily?.tasksCompleted ?? 0} 项 · 复习 ${daily?.reviewsDone ?? 0}/${daily?.reviewsDue ?? 0}`}
          tone="info"
          icon={<CalendarRange className="h-4 w-4" />}
        />
      </div>

      <TrendPanel trendData={trendData} daily={daily} loading={loading} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ProjectDonut projects={projects} totalMinutes={projects.reduce((sum, project) => sum + project.focusMinutes, 0)} />
        <ToolUsageDonut toolRuns={windowToolRuns} />
      </div>

      <Card>
        <SectionHeader
          title="拖延识别"
          description={`${procrastinated.length} 项任务长期未推进或已逾期`}
          action={<Badge tone={highSeverity > 0 ? 'danger' : 'default'}>{highSeverity} 项严重</Badge>}
        />
        {procrastinated.length === 0 ? (
          <EmptyState icon={<TriangleAlert className="h-5 w-5" />} title="没有发现拖延事项" description="所有任务都在正常推进中" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <p className="mb-3 text-[11px] font-medium text-muted-foreground">严重度分布</p>
              <SeverityDistribution items={procrastinated} />
            </div>
            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
              {procrastinated.slice(0, 12).map((item) => (
                <button
                  key={item.task.id}
                  type="button"
                  onClick={() => navigate('/tasks', { state: { taskId: item.task.id } })}
                  className="rounded-xl border border-border/70 bg-muted/25 p-3 text-left transition-colors hover:border-danger/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{item.task.title}</p>
                    <Badge tone={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'default'}>
                      {item.severity === 'high' ? '严重' : item.severity === 'medium' ? '中等' : '轻微'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <ReportPanel report={report} anchor={anchor} onAnchorChange={(next) => void setAnchor(next)} />

      {overview ? (
        <p className="text-center text-[11px] text-muted-foreground">
          累计任务 {overview.todayTasks.length} 项待办 · 待复习 {overview.dueReviews.length} 条 · 今日工具调用 {overview.todayToolRuns} 次
        </p>
      ) : null}
    </div>
  )
}
