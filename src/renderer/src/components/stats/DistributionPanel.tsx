import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ProcrastinationItem, ProjectTime, ToolRunRecord } from '@shared/types/domain'
import { TOOL_CATEGORY_META } from '@shared/constants'
import { Card, SectionHeader } from '../ui/Card'
import { Badge, EmptyState } from '../ui/Feedback'
import { ChartTooltip } from './TrendPanel'
import { formatMinutes, percent } from '../../lib/utils'
import { PieChart as PieIcon, Wrench } from 'lucide-react'

interface Slice {
  name: string
  value: number
  color: string
}

export interface ProjectDonutProps {
  projects: ProjectTime[]
  totalMinutes: number
}

export function ProjectDonut({ projects, totalMinutes }: ProjectDonutProps): JSX.Element {
  const slices: Slice[] = useMemo(
    () =>
      projects
        .filter((project) => project.focusMinutes > 0)
        .map((project) => ({ name: project.projectName, value: project.focusMinutes, color: project.color })),
    [projects]
  )

  return (
    <Card className="flex h-full flex-col">
      <SectionHeader
        title="项目 / 课程投入分布"
        description="按专注记录聚合的时长占比"
        action={<PieIcon className="h-4 w-4 text-muted-foreground" />}
        className="mb-3"
      />
      {slices.length === 0 ? (
        <EmptyState
          icon={<PieIcon className="h-5 w-5" />}
          title="暂无投入记录"
          description="在任务详情页开始专注后即有数据"
          className="h-full py-0"
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 md:grid-cols-[220px_1fr]">
          <div className="relative h-full min-h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2} stroke="none">
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip unitMap={{ value: ' 分钟' }} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">总投入</span>
              <span className="text-sm font-semibold text-foreground">{formatMinutes(totalMinutes)}</span>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            {slices.map((slice) => (
              <div key={slice.name}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {formatMinutes(slice.value)} · {percent(slice.value, totalMinutes)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percent(slice.value, totalMinutes)}%`, background: slice.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export interface ToolUsageDonutProps {
  toolRuns: ToolRunRecord[]
}

export function ToolUsageDonut({ toolRuns }: ToolUsageDonutProps): JSX.Element {
  const { slices, total } = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const run of toolRuns) {
      grouped.set(run.category, (grouped.get(run.category) ?? 0) + 1)
    }
    const list: Slice[] = Array.from(grouped.entries())
      .map(([category, count]) => ({
        name: TOOL_CATEGORY_META[category as keyof typeof TOOL_CATEGORY_META]?.label ?? category,
        value: count,
        color: TOOL_CATEGORY_META[category as keyof typeof TOOL_CATEGORY_META]?.color ?? '#64748B'
      }))
      .sort((a, b) => b.value - a.value)
    return { slices: list, total: list.reduce((sum, item) => sum + item.value, 0) }
  }, [toolRuns])

  const successRate =
    toolRuns.length === 0 ? 0 : Math.round((toolRuns.filter((run) => run.status === 'success').length / toolRuns.length) * 100)

  return (
    <Card className="flex h-full flex-col">
      <SectionHeader
        title="工具调用分布"
        description="按类别统计工具调用次数"
        action={<Wrench className="h-4 w-4 text-muted-foreground" />}
        className="mb-3"
      />
      {slices.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title="暂无工具调用"
          description="执行任意工具后即可看到分布"
          className="h-full py-0"
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 md:grid-cols-[220px_1fr]">
          <div className="relative h-full min-h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2} stroke="none">
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip unitMap={{ value: ' 次' }} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">调用次数</span>
              <span className="text-sm font-semibold text-foreground">{total}</span>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            {slices.map((slice) => (
              <div key={slice.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                  {slice.value} 次 · {percent(slice.value, total)}%
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2 border-t border-border pt-2">
              <span className="text-[11px] text-muted-foreground">执行成功率</span>
              <Badge tone={successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'danger'}>{successRate}%</Badge>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export interface SeverityDistributionProps {
  items: ProcrastinationItem[]
}

export function SeverityDistribution({ items }: SeverityDistributionProps): JSX.Element {
  const groups: { key: ProcrastinationItem['severity']; label: string; color: string }[] = [
    { key: 'high', label: '严重', color: 'hsl(var(--danger))' },
    { key: 'medium', label: '中等', color: 'hsl(var(--warning))' },
    { key: 'low', label: '轻微', color: 'hsl(var(--info))' }
  ]

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const count = items.filter((item) => item.severity === group.key).length
        return (
          <div key={group.key} className="flex items-center gap-3">
            <span className="w-8 text-[11px] text-muted-foreground">{group.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${percent(count, Math.max(1, items.length))}%`, background: group.color }}
              />
            </div>
            <span className="w-8 text-right text-[11px] text-foreground">{count}</span>
          </div>
        )
      })}
    </div>
  )
}
