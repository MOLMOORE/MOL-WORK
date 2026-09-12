import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BellRing, Brain, History, TriangleAlert } from 'lucide-react'
import type { ProcrastinationItem, ProcrastinationLevel, ProcrastinationReport } from '@shared/types/domain'
import { Card, SectionHeader } from '../ui/Card'
import { Badge, EmptyState } from '../ui/Feedback'
import { Tabs } from '../ui/Tabs'
import { SeverityDistribution } from './DistributionPanel'
import { CHART_AXIS, CHART_GRID, CHART_TOOL, ChartTooltip } from './TrendPanel'
import { cn, formatMinutes } from '../../lib/utils'

const LEVEL_META: Record<ProcrastinationLevel, { label: string; color: string; tone: 'success' | 'warning' | 'danger' }> = {
  low: { label: '轻微', color: '#22C55E', tone: 'success' },
  medium: { label: '中等', color: '#F59E0B', tone: 'warning' },
  high: { label: '严重', color: '#EF4444', tone: 'danger' }
}

const KIND_META: Record<string, { label: string; color: string }> = {
  defer: { label: '延期', color: '#6366F1' },
  due: { label: '进入逾期', color: '#F59E0B' },
  complete: { label: '完成超时', color: '#EF4444' }
}

const axisProps = { stroke: CHART_AXIS, fontSize: 10, tickLine: false, axisLine: false }

/** 0-100 拖延程度环形指示器 */
function DegreeRing({ degree, color }: { degree: number; color: string }): JSX.Element {
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, degree)) / 100)
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700"
      />
    </svg>
  )
}

export interface ProcrastinationPanelProps {
  report: ProcrastinationReport | null
  items: ProcrastinationItem[]
  onOpenTask: (taskId: number) => void
  loading?: boolean
}

/**
 * 拖延识别与量化面板：
 * - 综合拖延程度（次数 × 单次时长）
 * - 今日 / 本周 / 本月 三档周期对比与环比
 * - 日 / 周 / 月 走势对比图
 * - 拖延记忆流水与提醒
 */
export function ProcrastinationPanel({ report, items, onOpenTask, loading }: ProcrastinationPanelProps): JSX.Element {
  const [seriesKey, setSeriesKey] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const level = report ? LEVEL_META[report.level] : LEVEL_META.low
  const series = useMemo(() => (report ? report[seriesKey] : []), [report, seriesKey])
  const hasEvents = Boolean(report && report.totalEvents > 0)

  const severityCount = items.length

  return (
    <Card className="flex h-full flex-col">
      <SectionHeader
        title="拖延识别"
        description="截止时间一到，无论选择延期还是进入逾期都计为一次拖延；次数与单次时长共同决定拖延程度"
        action={
          <div className="flex items-center gap-2">
            <Badge tone={level.tone} dot>
              拖延程度 {report?.degree ?? 0} · {level.label}
            </Badge>
            {severityCount > 0 ? <Badge tone="danger">{severityCount} 项待处理</Badge> : null}
          </div>
        }
        className="mb-3"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading && !report ? (
          <p className="py-10 text-center text-xs text-muted-foreground">正在量化拖延情况…</p>
        ) : !hasEvents && items.length === 0 ? (
          <EmptyState
            icon={<TriangleAlert className="h-5 w-5" />}
            title="没有发现拖延事项"
            description="所有任务都在正常推进中；截止时间到点后的延期或逾期都会在这里留下记忆"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* 综合程度 + 日 / 周 / 月对比 */}
            <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-muted/25 p-3">
                <div className="relative">
                  <DegreeRing degree={report?.degree ?? 0} color={level.color} />
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-semibold text-foreground">{report?.degree ?? 0}</span>
                    <span className="text-[10px] text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">本周拖延程度</p>
                  <p className="mt-0.5 text-sm font-medium" style={{ color: level.color }}>
                    {level.label}拖延
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    累计拖延 <span className="text-foreground">{report?.totalEvents ?? 0}</span> 次
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    单次平均 <span className="text-foreground">{formatMinutes(report?.avgDelayMinutes ?? 0)}</span>
                  </p>
                  {report && report.activeOverdueCount > 0 ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-warning">
                      <BellRing className="h-3 w-3" />
                      {report.activeOverdueCount} 项逾期在途 · 拖欠 {formatMinutes(report.activeDelayMinutes)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(report?.periods ?? []).map((period) => {
                  const meta = LEVEL_META[period.level]
                  return (
                    <div key={period.key} className="rounded-xl border border-border/70 bg-muted/25 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{period.label}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1.5 text-lg font-semibold text-foreground">{period.degree}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {period.events} 次 · {formatMinutes(period.delayMinutes)}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        单次平均 {formatMinutes(period.avgDelayMinutes)}
                      </p>
                      {period.changePercent === null ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">上一周期无对比数据</p>
                      ) : (
                        <p
                          className={cn(
                            'mt-1 flex items-center gap-1 text-[10px]',
                            period.changePercent > 0 ? 'text-danger' : period.changePercent < 0 ? 'text-success' : 'text-muted-foreground'
                          )}
                        >
                          {period.changePercent > 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : period.changePercent < 0 ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : null}
                          较上一{period.key === 'day' ? '天' : period.key === 'week' ? '周' : '月'}
                          {period.changePercent > 0 ? '上升' : period.changePercent < 0 ? '下降' : '持平'} {Math.abs(period.changePercent)}%
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 提醒 */}
            {report && report.advice.length > 0 ? (
              <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
                  <Brain className="h-3.5 w-3.5" />
                  拖延提醒
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {report.advice.map((text) => (
                    <li key={text} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 走势对比图 */}
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">拖延走势对比（柱=拖延时长，线=拖延程度）</p>
                <Tabs
                  size="sm"
                  value={seriesKey}
                  onChange={(key) => setSeriesKey(key as 'daily' | 'weekly' | 'monthly')}
                  items={[
                    { key: 'daily', label: '每天' },
                    { key: 'weekly', label: '每周' },
                    { key: 'monthly', label: '每月' }
                  ]}
                />
              </div>
              <div className="h-[200px] w-full">
                {series.every((point) => point.events === 0) ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    该周期内暂无拖延记录
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="label" {...axisProps} />
                      <YAxis yAxisId="delay" {...axisProps} width={40} />
                      <YAxis yAxisId="degree" orientation="right" domain={[0, 100]} {...axisProps} width={32} />
                      <Tooltip
                        content={<ChartTooltip unitMap={{ delayMinutes: ' 分钟', events: ' 次', degree: ' 分' }} />}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: CHART_AXIS }} />
                      <Bar
                        yAxisId="delay"
                        name="拖延时长"
                        dataKey="delayMinutes"
                        fill={CHART_TOOL}
                        radius={[4, 4, 0, 0]}
                        barSize={14}
                      />
                      <Line
                        yAxisId="degree"
                        type="monotone"
                        name="拖延程度"
                        dataKey="degree"
                        stroke="#EF4444"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* 严重度分布 + 记忆流水 */}
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                <p className="mb-3 text-[11px] font-medium text-muted-foreground">当前事项严重度分布</p>
                {items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">当前没有需要处理的拖延事项</p>
                ) : (
                  <SeverityDistribution items={items} />
                )}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  拖延记忆流水
                </p>
                {report && report.recentEvents.length > 0 ? (
                  <div className="flex max-h-[180px] flex-col gap-1.5 overflow-y-auto pr-1">
                    {report.recentEvents.map((event) => {
                      const meta = KIND_META[event.kind] ?? KIND_META.defer
                      return (
                        <div key={event.id} className="flex items-center justify-between gap-2 rounded-lg bg-background/40 px-2 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                            <span className="truncate text-[11px] text-foreground">{event.taskTitle}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                            <span style={{ color: meta.color }}>{meta.label}</span>
                            <span>{formatMinutes(event.delayMinutes)}</span>
                            <span>{event.at.slice(5, 16).replace('T', ' ')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">暂无拖延记忆，继续保持</p>
                )}
              </div>
            </div>

            {/* 拖延事项清单 */}
            {items.length > 0 ? (
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">需要处理的拖延事项（点击定位任务）</p>
                <div className="flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1">
                  {items.slice(0, 12).map((item) => (
                    <button
                      key={item.task.id}
                      type="button"
                      onClick={() => onOpenTask(item.task.id)}
                      className="rounded-xl border border-border/70 bg-background/40 p-3 text-left transition-colors hover:border-danger/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-foreground">{item.task.title}</p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone="default">程度 {item.degree}</Badge>
                          <Badge
                            tone={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'default'}
                          >
                            {item.severity === 'high' ? '严重' : item.severity === 'medium' ? '中等' : '轻微'}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.reason}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  )
}
