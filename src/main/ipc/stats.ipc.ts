import type { DailyReport, DailyStats, ProcrastinationItem, ProjectTime, TrendPoint } from '@shared/types/domain'
import { handle } from './handle'
import { dailyStats, procrastination, projectTimeRange, trend } from '../services/stats.service'
import { dailyReport, renderReportMarkdown } from '../services/report.service'
import { todayKey } from '../utils/time'

export function registerStatsIpc(): void {
  handle<DailyStats>('stats:daily', (dayKey: string) => dailyStats(dayKey || todayKey()))

  handle<TrendPoint[]>('stats:trend', (from: string, to: string) => trend(from, to))

  handle<ProjectTime[]>('stats:by-project', (from: string, to: string) => projectTimeRange(from, to))

  handle<ProcrastinationItem[]>('stats:procrastination', () => procrastination())

  handle<DailyReport>('stats:report', (dayKey: string) => dailyReport(dayKey || todayKey()))

  handle<string>('stats:report-markdown', (dayKey: string) => renderReportMarkdown(dailyReport(dayKey || todayKey())))
}
