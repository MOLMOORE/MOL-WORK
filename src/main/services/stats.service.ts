import type {
  DailyStats,
  HourlyBucket,
  ProcrastinationItem,
  ProjectTime,
  Task,
  TimelineEntry,
  TrendPoint
} from '@shared/types/domain'
import { all, count } from '../db/query'
import { listTaskRunsForRange } from './tool.service'
import { mapTask, type TaskRow } from '../db/mappers'
import {
  dayKey,
  diffDays,
  endOfDay,
  nowIso,
  parseIso,
  rangeDays,
  startOfDay,
  todayKey
} from '../utils/time'
import { listFocusRange } from '../db/repositories/focus.repo'
import { countEventsBetween } from '../db/repositories/schedule.repo'
import { dueCount } from '../db/repositories/review.repo'
import { listTasks } from '../db/repositories/task.repo'

const TASK_SELECT_FOR_STATS = `
SELECT t.*, p.name AS project_name, p.color AS project_color
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
`

function dayBounds(key: string): { from: string; to: string } {
  return { from: startOfDay(key), to: endOfDay(key) }
}

export function projectTimeRange(fromKey: string, toKey: string): ProjectTime[] {
  const from = startOfDay(fromKey)
  const to = endOfDay(toKey)
  interface Row {
    project_id: number | null
    project_name: string | null
    color: string | null
    focus_minutes: number
    task_count: number
    done_count: number
  }
  const rows = all<Row>(
    `WITH focus AS (
       SELECT t.project_id AS pid, COALESCE(SUM(f.duration_minutes), 0) AS minutes
       FROM focus_sessions f
       JOIN tasks t ON t.id = f.task_id
       WHERE f.started_at >= ? AND f.started_at <= ?
       GROUP BY t.project_id
     )
     SELECT p.id AS project_id,
            p.name AS project_name,
            p.color AS color,
            COALESCE(focus.minutes, 0) AS focus_minutes,
            (SELECT COUNT(*) FROM tasks t2 WHERE t2.project_id = p.id AND t2.created_at >= ? AND t2.created_at <= ?) AS task_count,
            (SELECT COUNT(*) FROM tasks t3 WHERE t3.project_id = p.id AND t3.completed_at >= ? AND t3.completed_at <= ?) AS done_count
     FROM projects p
     LEFT JOIN focus ON focus.pid = p.id
     ORDER BY focus_minutes DESC, p.id ASC`,
    from,
    to,
    from,
    to,
    from,
    to
  )

  const result: ProjectTime[] = rows.map((row) => ({
    projectId: row.project_id === null ? null : Number(row.project_id),
    projectName: row.project_name ?? '未归属',
    color: row.color ?? '#64748B',
    focusMinutes: Number(row.focus_minutes ?? 0),
    taskCount: Number(row.task_count ?? 0),
    doneCount: Number(row.done_count ?? 0)
  }))

  interface LooseRow {
    minutes: number
    task_count: number
    done_count: number
  }
  const loose = all<LooseRow>(
    `SELECT
       COALESCE((SELECT SUM(f.duration_minutes) FROM focus_sessions f
                 JOIN tasks t ON t.id = f.task_id
                 WHERE t.project_id IS NULL AND f.started_at >= ? AND f.started_at <= ?), 0) AS minutes,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id IS NULL AND t.created_at >= ? AND t.created_at <= ?) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id IS NULL AND t.completed_at >= ? AND t.completed_at <= ?) AS done_count`,
    from,
    to,
    from,
    to,
    from,
    to
  )[0]

  if (loose && (loose.minutes > 0 || loose.task_count > 0)) {
    result.push({
      projectId: null,
      projectName: '未归属',
      color: '#64748B',
      focusMinutes: Number(loose.minutes ?? 0),
      taskCount: Number(loose.task_count ?? 0),
      doneCount: Number(loose.done_count ?? 0)
    })
  }
  return result
}

export function dailyStats(dateKeyValue: string): DailyStats {
  const { from, to } = dayBounds(dateKeyValue)
  const tasksCreated = count('SELECT COUNT(*) AS c FROM tasks WHERE created_at >= ? AND created_at <= ?', from, to)
  const tasksCompleted = count(
    'SELECT COUNT(*) AS c FROM tasks WHERE completed_at >= ? AND completed_at <= ?',
    from,
    to
  )
  const focusSessions = listFocusRange(from, to)
  const focusMinutes = focusSessions.reduce((sum, s) => sum + s.durationMinutes, 0)
  const toolRuns = listTaskRunsForRange(from, to)
  const toolMinutes = Math.round(toolRuns.reduce((sum, r) => sum + r.durationMs, 0) / 60000)
  const reviewsDone = count(
    'SELECT COUNT(*) AS c FROM review_items WHERE last_reviewed_at >= ? AND last_reviewed_at <= ?',
    from,
    to
  )
  const eventsCount = countEventsBetween(from, to)

  const hourlyMap = new Map<number, HourlyBucket>()
  for (let h = 0; h < 24; h += 1) {
    hourlyMap.set(h, { hour: `${String(h).padStart(2, '0')}:00`, focusMinutes: 0, toolRuns: 0 })
  }
  for (const session of focusSessions) {
    const bucket = hourlyMap.get(parseIso(session.startedAt).getHours())
    if (bucket) bucket.focusMinutes += session.durationMinutes
  }
  for (const run of toolRuns) {
    const bucket = hourlyMap.get(parseIso(run.createdAt).getHours())
    if (bucket) bucket.toolRuns += 1
  }

  const timeline: TimelineEntry[] = [
    ...focusSessions.map<TimelineEntry>((s) => ({
      id: `focus-${s.id}`,
      kind: 'focus',
      title: s.taskTitle ?? '自由专注',
      at: s.startedAt,
      durationMinutes: s.durationMinutes,
      detail: s.note || '专注记录'
    })),
    ...toolRuns.map<TimelineEntry>((r) => ({
      id: `tool-${r.id}`,
      kind: 'tool',
      title: `${r.toolName}`,
      at: r.createdAt,
      durationMinutes: Math.max(1, Math.round(r.durationMs / 60000)),
      detail: r.resultPath ?? r.resultSummary ?? r.inputSummary
    })),
    ...all<{ id: number; title: string; completed_at: string; project_name: string | null }>(
      `SELECT t.id, t.title, t.completed_at, p.name AS project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.completed_at >= ? AND t.completed_at <= ?`,
      from,
      to
    ).map<TimelineEntry>((row) => ({
      id: `task-${row.id}`,
      kind: 'task',
      title: row.title,
      at: String(row.completed_at),
      durationMinutes: 0,
      detail: `完成任务 · ${row.project_name ?? '未归属'}`
    })),
    ...all<{ id: number; title: string; last_reviewed_at: string; interval_days: number }>(
      `SELECT id, title, last_reviewed_at, interval_days FROM review_items
       WHERE last_reviewed_at >= ? AND last_reviewed_at <= ?`,
      from,
      to
    ).map<TimelineEntry>((row) => ({
      id: `review-${row.id}`,
      kind: 'review',
      title: row.title,
      at: String(row.last_reviewed_at),
      durationMinutes: 0,
      detail: `复习完成 · 下次间隔 ${Number(row.interval_days)} 天`
    }))
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  return {
    date: dateKeyValue,
    tasksCreated,
    tasksCompleted,
    focusMinutes,
    toolRuns: toolRuns.length,
    toolMinutes,
    reviewsDone,
    reviewsDue: dueCount(dateKeyValue),
    eventsCount,
    projects: projectTimeRange(dateKeyValue, dateKeyValue),
    hourly: Array.from(hourlyMap.values()),
    timeline
  }
}

export function trend(fromKey: string, toKey: string): TrendPoint[] {
  const days = rangeDays(fromKey, toKey)
  return days.map((key) => {
    const { from, to } = dayBounds(key)
    const focusMinutes = listFocusRange(from, to).reduce((s, r) => s + r.durationMinutes, 0)
    const toolRuns = listTaskRunsForRange(from, to)
    return {
      date: key,
      focusMinutes,
      toolMinutes: Math.round(toolRuns.reduce((s, r) => s + r.durationMs, 0) / 60000),
      completed: count('SELECT COUNT(*) AS c FROM tasks WHERE completed_at >= ? AND completed_at <= ?', from, to),
      reviews: count(
        'SELECT COUNT(*) AS c FROM review_items WHERE last_reviewed_at >= ? AND last_reviewed_at <= ?',
        from,
        to
      ),
      toolRuns: toolRuns.length
    }
  })
}

export function procrastination(): ProcrastinationItem[] {
  const today = todayKey()
  const rows = all<TaskRow>(
    `${TASK_SELECT_FOR_STATS} WHERE t.status <> 'done' ORDER BY t.is_priority DESC, t.sort_order ASC, t.due_at ASC`
  ).map(mapTask)

  const items: ProcrastinationItem[] = []
  for (const task of rows) {
    const stalledDays = Math.max(0, diffDays(task.updatedAt, today))
    const overdueDays = task.dueAt ? Math.max(0, diffDays(task.dueAt, today)) : 0
    const progressLag = task.progress < 30 && stalledDays >= 5 && overdueDays === 0

    if (overdueDays < 1 && stalledDays < 4 && !progressLag) continue

    const reasons: string[] = []
    if (overdueDays >= 1) reasons.push(`已逾期 ${overdueDays} 天`)
    if (stalledDays >= 4) reasons.push(`停滞 ${stalledDays} 天未更新`)
    if (progressLag) reasons.push(`进度仅 ${task.progress}%`)

    const severity: ProcrastinationItem['severity'] =
      overdueDays >= 7 || stalledDays >= 14 ? 'high' : overdueDays >= 3 || stalledDays >= 7 ? 'medium' : 'low'

    items.push({
      task,
      stalledDays,
      overdueDays,
      reason: reasons.join(' · ') || '长期未推进',
      severity
    })
  }
  return items.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return rank[a.severity] - rank[b.severity] || b.overdueDays - a.overdueDays
  })
}

export function workSummary(): { totalTasks: number; doneTasks: number; activeReviews: number; totalFocusMinutes: number } {
  const totalTasks = count('SELECT COUNT(*) AS c FROM tasks')
  const doneTasks = count("SELECT COUNT(*) AS c FROM tasks WHERE status = 'done'")
  const activeReviews = count("SELECT COUNT(*) AS c FROM review_items WHERE status = 'active'")
  const row = all<{ s: number | null }>('SELECT SUM(duration_minutes) AS s FROM focus_sessions')[0]
  return { totalTasks, doneTasks, activeReviews, totalFocusMinutes: row && row.s !== null ? Number(row.s) : 0 }
}

export function todayOverviewCounters(): { focusMinutes: number; toolRuns: number; completed: number } {
  const today = todayKey()
  const { from, to } = dayBounds(today)
  return {
    focusMinutes: listFocusRange(from, to).reduce((s, r) => s + r.durationMinutes, 0),
    toolRuns: listTaskRunsForRange(from, to).length,
    completed: count('SELECT COUNT(*) AS c FROM tasks WHERE completed_at >= ? AND completed_at <= ?', from, to)
  }
}

export function todayTasks(): Task[] {
  const today = todayKey()
  return listTasks({ status: 'all' }).filter((t) => t.status !== 'done' && t.dueAt !== null && dayKey(t.dueAt) <= today)
}

export function nowIsoForStats(): string {
  return nowIso()
}
