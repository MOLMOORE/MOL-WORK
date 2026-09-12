import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, CalendarRange, ChevronLeft, ChevronRight, FileText, TrendingUp } from 'lucide-react'
import { Card, StatCard } from '../components/ui/Card'
import { Spinner } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { FocusTrendCard, HourlyDistributionCard, OutputTrendCard } from '../components/stats/TrendPanel'
import { ProjectDonut, ToolUsageDonut } from '../components/stats/DistributionPanel'
import { ReportPanel } from '../components/stats/ReportPanel'
import { ProcrastinationPanel } from '../components/stats/ProcrastinationPanel'
import { MetricDetailDialog, type MetricDetailKind } from '../components/stats/MetricDetailDialog'
import { GridBoard, type GridEntry } from '../components/layout/GridBoard'
import { ClockTile } from '../components/layout/ClockTile'
import { TREND_RANGES, trendWindow, useStatsStore, type TrendDays } from '../stores/statsStore'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { formatMinutes, todayKey } from '../lib/utils'

const STORAGE_LAST_DEGREE = 'workstation.procrastination-last-degree'
const STORAGE_REMIND_DAY = 'workstation.procrastination-remind-day'
const STATS_LAYOUT_KEY = 'workstation.grid.stats.v1'

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

export function StatsPage(): JSX.Element {
  const navigate = useNavigate()
  const trendDays = useStatsStore((state) => state.trendDays)
  const anchor = useStatsStore((state) => state.anchor)
  const daily = useStatsStore((state) => state.daily)
  const trendData = useStatsStore((state) => state.trendData)
  const projects = useStatsStore((state) => state.projects)
  const procrastinated = useStatsStore((state) => state.procrastinated)
  const procrastinationReport = useStatsStore((state) => state.procrastinationReport)
  const report = useStatsStore((state) => state.report)
  const toolRuns = useStatsStore((state) => state.toolRuns)
  const loading = useStatsStore((state) => state.loading)
  const load = useStatsStore((state) => state.load)
  const setTrendDays = useStatsStore((state) => state.setTrendDays)
  const setAnchor = useStatsStore((state) => state.setAnchor)
  const shift = useStatsStore((state) => state.shift)
  const overview = useAppStore((state) => state.overview)
  const pushToast = useAppStore((state) => state.pushToast)

  const [detail, setDetail] = useState<MetricDetailKind | null>(null)
  const remindedRef = useRef(false)

  useEffect(() => {
    void load()
  }, [load])

  const range = trendWindow(trendDays, anchor)

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
    () => toolRuns.filter((run) => run.createdAt.slice(0, 10) >= range.from && run.createdAt.slice(0, 10) <= range.to),
    [toolRuns, range.from, range.to]
  )

  const projectMinutes = useMemo(() => projects.reduce((sum, project) => sum + project.focusMinutes, 0), [projects])

  /** 拖延记忆与提醒：记录本次程度，并在程度偏高或上升时提醒一次 */
  useEffect(() => {
    if (!procrastinationReport) return
    const reportData = procrastinationReport
    const stored = readStorage(STORAGE_LAST_DEGREE)
    const lastDegree = stored === null ? null : Number(stored)
    writeStorage(STORAGE_LAST_DEGREE, String(reportData.degree))

    if (remindedRef.current) return
    remindedRef.current = true

    const levelLabel = reportData.level === 'high' ? '严重' : reportData.level === 'medium' ? '中等' : '轻微'
    const today = todayKey()
    const remindedDay = readStorage(STORAGE_REMIND_DAY)
    if (reportData.level !== 'low' && remindedDay !== today) {
      writeStorage(STORAGE_REMIND_DAY, today)
      pushToast({
        title: `拖延程度${levelLabel} · 指数 ${reportData.degree}`,
        description: reportData.advice[0],
        tone: reportData.level === 'high' ? 'danger' : 'warning'
      })
      void api.app.notify(
        `拖延提醒 · 指数 ${reportData.degree}（${levelLabel}）`,
        reportData.advice[0] ?? '建议尽快处理逾期事项'
      )
    } else if (lastDegree !== null && reportData.degree > lastDegree && reportData.degree >= 25) {
      pushToast({
        title: '拖延程度上升',
        description: `较上次查看上升 ${reportData.degree - lastDegree} 分，当前 ${reportData.degree} 分`,
        tone: 'warning'
      })
    }
  }, [procrastinationReport, pushToast])

  // 各模块 JSX 单独记忆化：拖动/缩放时数据未变则引用不变，避免图表被反复重绘
  const clockNode = useMemo(() => <ClockTile />, [])

  const metricNodes = useMemo(
    () => [
      <StatCard
        key="focus"
        label="区间专注总时长"
        value={formatMinutes(totals.focus)}
        hint={`日均 ${formatMinutes(totals.average)}`}
        tone="success"
        icon={<TrendingUp className="h-4 w-4" />}
        onClick={() => setDetail('focus')}
      />,
      <StatCard
        key="completed"
        label="区间完成任务"
        value={`${totals.completed} 项`}
        hint={`复习 ${totals.reviews} 条`}
        tone="primary"
        icon={<BarChart3 className="h-4 w-4" />}
        onClick={() => setDetail('completed')}
      />,
      <StatCard
        key="tools"
        label="区间工具调用"
        value={`${totals.runs} 次`}
        hint={`累计耗时 ${formatMinutes(totals.tool)}`}
        tone="warning"
        icon={<FileText className="h-4 w-4" />}
        onClick={() => setDetail('tools')}
      />,
      <StatCard
        key="today"
        label="今日快照"
        value={formatMinutes(daily?.focusMinutes ?? 0)}
        hint={`完成 ${daily?.tasksCompleted ?? 0} 项 · 复习 ${daily?.reviewsDone ?? 0}/${daily?.reviewsDue ?? 0}`}
        tone="info"
        icon={<CalendarRange className="h-4 w-4" />}
        onClick={() => setDetail('today')}
      />
    ],
    [totals, daily]
  )

  const trendNodes = useMemo(
    () => [
      <FocusTrendCard key="focus" trendData={trendData} loading={loading} />,
      <OutputTrendCard key="output" trendData={trendData} loading={loading} />
    ],
    [trendData, loading]
  )

  const hourlyNode = useMemo(() => <HourlyDistributionCard daily={daily} />, [daily])

  const donutNodes = useMemo(
    () => [
      <ProjectDonut key="project" projects={projects} totalMinutes={projectMinutes} />,
      <ToolUsageDonut key="tool" toolRuns={windowToolRuns} />
    ],
    [projects, projectMinutes, windowToolRuns]
  )

  const procrastinationNode = useMemo(
    () => (
      <ProcrastinationPanel
        report={procrastinationReport}
        items={procrastinated}
        loading={loading}
        onOpenTask={(taskId) => navigate('/tasks', { state: { taskId } })}
      />
    ),
    [procrastinationReport, procrastinated, loading, navigate]
  )

  const reportNode = useMemo(
    () => <ReportPanel report={report} anchor={anchor} onAnchorChange={(next) => void setAnchor(next)} />,
    [report, anchor, setAnchor]
  )

  const entries = useMemo<GridEntry[]>(
    () => [
      { id: 'clock', title: '时间显示', x: 4, y: 0, w: 4, h: 3, minW: 3, minH: 2, node: clockNode },
      { id: 'metric-focus', title: '区间专注总时长', x: 0, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[0] },
      { id: 'metric-completed', title: '区间完成任务', x: 3, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[1] },
      { id: 'metric-tools', title: '区间工具调用', x: 6, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[2] },
      { id: 'metric-today', title: '今日快照', x: 9, y: 3, w: 3, h: 2, minW: 2, minH: 2, node: metricNodes[3] },
      { id: 'trend-focus', title: '投入趋势', x: 0, y: 5, w: 6, h: 6, minW: 4, minH: 4, node: trendNodes[0] },
      { id: 'trend-output', title: '产出趋势', x: 6, y: 5, w: 6, h: 6, minW: 4, minH: 4, node: trendNodes[1] },
      { id: 'hourly', title: '单日时段分布', x: 0, y: 11, w: 12, h: 5, minW: 6, minH: 4, node: hourlyNode },
      { id: 'project-donut', title: '项目投入分布', x: 0, y: 16, w: 6, h: 7, minW: 5, minH: 5, node: donutNodes[0] },
      { id: 'tool-donut', title: '工具调用分布', x: 6, y: 16, w: 6, h: 7, minW: 5, minH: 5, node: donutNodes[1] },
      { id: 'procrastination', title: '拖延识别', x: 0, y: 23, w: 12, h: 11, minW: 6, minH: 7, node: procrastinationNode },
      { id: 'report', title: '日报复盘', x: 0, y: 34, w: 12, h: 9, minW: 6, minH: 5, node: reportNode }
    ],
    [clockNode, metricNodes, trendNodes, hourlyNode, donutNodes, procrastinationNode, reportNode]
  )

  return (
    <div className="grid gap-5">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-12 -top-16 h-52 w-52 rounded-full bg-info/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">统计与复盘</h2>
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
          当前区间：{range.from} ~ {range.to} · 共 {trendDays} 天 · 活跃 {totals.activeDays} 天
        </p>
      </Card>

      {loading && trendData.length === 0 ? (
        <div className="flex h-48 items-center justify-center gap-2 text-muted-foreground">
          <Spinner />
          <span className="text-sm">正在聚合统计数据…</span>
        </div>
      ) : null}

      <GridBoard entries={entries} storageKey={STATS_LAYOUT_KEY} />

      <MetricDetailDialog
        kind={detail}
        rangeFrom={range.from}
        rangeTo={range.to}
        toolRuns={toolRuns}
        daily={daily}
        onClose={() => setDetail(null)}
        onNavigate={(path) => navigate(path)}
      />

      {overview ? (
        <p className="text-center text-[11px] text-muted-foreground">
          累计任务 {overview.todayTasks.length} 项待办 · 待复习 {overview.dueReviews.length} 条 · 今日工具调用 {overview.todayToolRuns} 次
        </p>
      ) : null}
    </div>
  )
}
