import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { DailyStats, TrendPoint } from '@shared/types/domain'
import { Card, SectionHeader } from '../ui/Card'
import { EmptyState } from '../ui/Feedback'
import { BarChart3, TrendingUp } from 'lucide-react'

export const CHART_FOCUS = '#6366F1'
export const CHART_TOOL = '#F59E0B'
export const CHART_COMPLETED = '#22C55E'
export const CHART_REVIEW = '#22D3EE'
export const CHART_GRID = 'rgba(148, 163, 184, 0.18)'
export const CHART_AXIS = '#94A3B8'

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

export interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: TooltipEntry[]
  unitMap?: Record<string, string>
}

export function ChartTooltip({ active, label, payload, unitMap }: ChartTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-border/80 bg-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {payload.map((entry) => (
          <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
            {entry.name}
            <span className="text-foreground">
              {entry.value}
              {unitMap?.[String(entry.dataKey)] ?? ''}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

const legendStyle = { fontSize: 11, color: CHART_AXIS }
const axisProps = { stroke: CHART_AXIS, fontSize: 10, tickLine: false, axisLine: false }

export interface TrendPanelProps {
  trendData: TrendPoint[]
  daily: DailyStats | null
  loading?: boolean
}

export function TrendPanel({ trendData, daily, loading }: TrendPanelProps): JSX.Element {
  const hasTrend = trendData.some((point) => point.focusMinutes > 0 || point.completed > 0 || point.toolRuns > 0)

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card>
        <SectionHeader
          title="投入趋势"
          description="每日专注时长与工具耗时（分钟）"
          action={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        {!hasTrend && !loading ? (
          <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="区间内暂无投入记录" description="开始一次专注计时或执行工具后即可看到趋势" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_FOCUS} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={CHART_FOCUS} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} {...axisProps} />
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip unitMap={{ focusMinutes: ' 分钟', toolMinutes: ' 分钟' }} />} />
              <Legend wrapperStyle={legendStyle} />
              <Area
                type="monotone"
                name="专注"
                dataKey="focusMinutes"
                stroke={CHART_FOCUS}
                strokeWidth={2}
                fill="url(#focusFill)"
              />
              <Line
                type="monotone"
                name="工具耗时"
                dataKey="toolMinutes"
                stroke={CHART_TOOL}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <SectionHeader
          title="产出趋势"
          description="每日完成任务数、复习条数与工具调用次数"
          action={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
        />
        {!hasTrend && !loading ? (
          <EmptyState icon={<BarChart3 className="h-5 w-5" />} title="区间内暂无产出记录" description="完成任务、复习或调用工具都会计入产出趋势" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} {...axisProps} />
              <YAxis {...axisProps} width={40} allowDecimals={false} />
              <Tooltip content={<ChartTooltip unitMap={{ completed: ' 项', reviews: ' 条', toolRuns: ' 次' }} />} />
              <Legend wrapperStyle={legendStyle} />
              <Bar name="完成任务" dataKey="completed" fill={CHART_COMPLETED} radius={[4, 4, 0, 0]} barSize={12} />
              <Bar name="复习" dataKey="reviews" fill={CHART_REVIEW} radius={[4, 4, 0, 0]} barSize={12} />
              <Line type="monotone" name="工具调用" dataKey="toolRuns" stroke={CHART_TOOL} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="xl:col-span-2">
        <SectionHeader title="单日时段分布" description={`${daily?.date ?? ''} 每小时专注时长（分钟）`} />
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={daily?.hourly ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="hour" interval={2} {...axisProps} />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<ChartTooltip unitMap={{ focusMinutes: ' 分钟', toolRuns: ' 次' }} />} />
            <Bar name="专注" dataKey="focusMinutes" fill={CHART_FOCUS} radius={[4, 4, 0, 0]} barSize={16} />
            <Line type="monotone" name="工具调用" dataKey="toolRuns" stroke={CHART_TOOL} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
