import type { OverviewData } from '@shared/types/domain'
import { listTasks } from '../db/repositories/task.repo'
import { listDueReviews } from '../db/repositories/review.repo'
import { listUpcomingEvents } from '../db/repositories/schedule.repo'
import { listNotes } from './note.service'
import { readSettings } from './settings.service'
import { dayKey, nowIso, todayKey } from '../utils/time'
import { todayOverviewCounters } from './stats.service'

export function overview(): OverviewData {
  const today = todayKey()
  const now = nowIso()
  const settings = readSettings()

  const all = listTasks({ status: 'all' })
  const pending = all.filter((task) => task.status !== 'done')
  const todayTasks = pending
    .filter((task) => task.dueAt === null || dayKey(task.dueAt) <= today)
    .slice(0, 10)
  const overdueCount = pending.filter((task) => task.dueAt !== null && task.dueAt < now).length
  const counters = todayOverviewCounters()

  return {
    date: today,
    todayTasks,
    dueReviews: listDueReviews(today, settings.dailyReviewLimit),
    upcomingEvents: listUpcomingEvents(now, 6),
    todayFocusMinutes: counters.focusMinutes,
    todayToolRuns: counters.toolRuns,
    todayCompleted: counters.completed,
    pendingCount: pending.length,
    overdueCount,
    estimateMinutes: todayTasks.reduce((sum, task) => sum + task.estimateMinutes, 0),
    recentNotes: listNotes(null, undefined).slice(0, 6)
  }
}
