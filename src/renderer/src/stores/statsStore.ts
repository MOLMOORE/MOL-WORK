import { create } from 'zustand'
import type {
  DailyReport,
  DailyStats,
  ProcrastinationItem,
  ProcrastinationReport,
  ProjectTime,
  ToolRunRecord,
  TrendPoint
} from '@shared/types/domain'
import { api } from '../lib/ipc'
import { addDays, dateKey, todayKey } from '../lib/utils'

export const TREND_RANGES = [7, 14, 30, 90] as const
export type TrendDays = (typeof TREND_RANGES)[number]

interface StatsState {
  /** 趋势区间长度（天） */
  trendDays: TrendDays
  /** 区间结束日（默认今天） */
  anchor: string
  daily: DailyStats | null
  trendData: TrendPoint[]
  projects: ProjectTime[]
  procrastinated: ProcrastinationItem[]
  procrastinationReport: ProcrastinationReport | null
  report: DailyReport | null
  toolRuns: ToolRunRecord[]
  loading: boolean
  setTrendDays: (days: TrendDays) => Promise<void>
  setAnchor: (anchor: string) => Promise<void>
  shift: (direction: number) => Promise<void>
  load: () => Promise<void>
}

/** 以 anchor 为终点向前推 trendDays 天 */
export function trendWindow(trendDays: number, anchor: string): { from: string; to: string } {
  const end = new Date(`${anchor}T00:00:00`)
  const start = addDays(end, -(trendDays - 1))
  return { from: dateKey(start), to: anchor }
}

export const useStatsStore = create<StatsState>((set, get) => ({
  trendDays: 14,
  anchor: todayKey(),
  daily: null,
  trendData: [],
  projects: [],
  procrastinated: [],
  procrastinationReport: null,
  report: null,
  toolRuns: [],
  loading: false,

  setTrendDays: async (trendDays) => {
    set({ trendDays })
    await get().load()
  },

  setAnchor: async (anchor) => {
    set({ anchor })
    await get().load()
  },

  shift: async (direction) => {
    const { trendDays, anchor } = get()
    const next = dateKey(addDays(new Date(`${anchor}T00:00:00`), direction * trendDays))
    set({ anchor: next })
    await get().load()
  },

  load: async () => {
    const { trendDays, anchor } = get()
    const { from, to } = trendWindow(trendDays, anchor)
    set({ loading: true })
    const [daily, trendData, projects, procrastinated, procrastinationReport, report, toolRuns] = await Promise.all([
      api.stats.daily(anchor),
      api.stats.trend(from, to),
      api.stats.byProject(from, to),
      api.stats.procrastination(),
      api.stats.procrastinationReport(anchor, 30),
      api.stats.report(anchor),
      api.tool.history(300)
    ])
    set({ daily, trendData, projects, procrastinated, procrastinationReport, report, toolRuns, loading: false })
  }
}))
