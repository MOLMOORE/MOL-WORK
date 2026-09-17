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

/* 图表配色直接引用主题令牌：换主题预设或换深浅色时，图形跟着一起变 */
export const CHART_FOCUS = 'hsl(var(--chart-1))'
export const CHART_TOOL = 'hsl(var(--chart-3))'
export const CHART_COMPLETED = 'hsl(var(--chart-2))'
export const CHART_REVIEW = 'hsl(var(--chart-4))'
export const CHART_GRID = 'hsl(var(--border))'
export const CHART_AXIS = 'hsl(var(--muted-foreground))'
export const CHART_DANGER = 'hsl(var(--danger))'

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
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-pop">
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

export const legendStyle = { fontSize: 11, color: CHART_AXIS }
export const axisProps = { stroke: CHART_AXIS, fontSize: 10, tickLine: false, axisLine: false }

/** 图表卡片统一外壳：标题固定，图表区随卡片尺寸自适应 */
function ChartCard({
  title,
  description,
  action,
  empty,
  children
}: {
  title: string
  description: string
  action: JSX.Element
  empty: JSX.Element | null
  children: JSX.Element
}): JSX.Element {
  return (
    <Card className="flex h-full flex-col">
      <SectionHeader title={title} description={description} action={action} className="mb-3" />
      <div className="min-h-0 flex-1">{empty ?? children}</div>
    </Card>
  )
}

export interface FocusTrendCardProps {
  trendData: TrendPoint[]
  loading?: boolean
}

/** 投入趋势：每日专注时长与工具耗时 */
export function FocusTrendCard({ trendData, loading }: FocusTrendCardProps): JSX.Element {
  const hasTrend = trendData.some((point) => point.focusMinutes > 0 || point.toolMinutes > 0)
  return (
    <ChartCard
      title="投入趋势"
      description="每日专注时长与工具耗时（分钟）"
      action={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
      empty={!hasTrend && !loading ? (
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title="区间内暂无投入记录"
          description="开始一次专注计时或执行工具后即可看到趋势"
          className="h-full py-0"
        />
      ) : null}
    >
      <ResponsiveContainer width="100%" height="100%">
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
          <Line type="monotone" name="工具耗时" dataKey="toolMinutes" stroke={CHART_TOOL} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export interface OutputTrendCardProps {
  trendData: TrendPoint[]
  loading?: boolean
}

/** 产出趋势：每日完成任务数、复习条数与工具调用次数 */
export function OutputTrendCard({ trendData, loading }: OutputTrendCardProps): JSX.Element {
  const hasTrend = trendData.some((point) => point.completed > 0 || point.reviews > 0 || point.toolRuns > 0)
  return (
    <ChartCard
      title="产出趋势"
      description="每日完成任务数、复习条数与工具调用次数"
      action={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
      empty={!hasTrend && !loading ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="区间内暂无产出记录"
          description="完成任务、复习或调用工具都会计入产出趋势"
          className="h-full py-0"
        />
      ) : null}
    >
      <ResponsiveContainer width="100%" height="100%">
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
    </ChartCard>
  )
}

export interface HourlyDistributionCardProps {
  daily: DailyStats | null
}

/** 单日时段分布：每小时专注时长与工具调用 */
export function HourlyDistributionCard({ daily }: HourlyDistributionCardProps): JSX.Element {
  return (
    <Card className="flex h-full flex-col">
      <SectionHeader title="单日时段分布" description={`${daily?.date ?? ''} 每小时专注时长（分钟）`} className="mb-3" />
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daily?.hourly ?? []} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={CHART_GRID} vertical={false} />
            <XAxis dataKey="hour" interval={2} {...axisProps} />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<ChartTooltip unitMap={{ focusMinutes: ' 分钟', toolRuns: ' 次' }} />} />
            <Bar name="专注" dataKey="focusMinutes" fill={CHART_FOCUS} radius={[4, 4, 0, 0]} barSize={16} />
            <Line type="monotone" name="工具调用" dataKey="toolRuns" stroke={CHART_TOOL} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export interface TrendPanelProps {
  trendData: TrendPoint[]
  daily: DailyStats | null
  loading?: boolean
}

/** 兼容旧调用：三张趋势卡片按原顺序排列 */
export function TrendPanel({ trendData, daily, loading }: TrendPanelProps): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <FocusTrendCard trendData={trendData} loading={loading} />
      <OutputTrendCard trendData={trendData} loading={loading} />
      <div className="xl:col-span-2">
        <HourlyDistributionCard daily={daily} />
      </div>
    </div>
  )
}
