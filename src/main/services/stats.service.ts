import type {
  DailyStats,
  HourlyBucket,
  ProcrastinationEvent,
  ProcrastinationEventKind,
  ProcrastinationItem,
  ProcrastinationLevel,
  ProcrastinationPeriod,
  ProcrastinationPoint,
  ProcrastinationReport,
  ProjectTime,
  Task,
  TimelineEntry,
  TrendPoint
} from '@shared/types/domain'
import { all, count } from '../db/query'
import { listTaskRunsForRange } from './tool.service'
import { mapTask, type TaskRow } from '../db/mappers'
import {
  addDaysKey,
  dayKey,
  diffDays,
  diffMinutes,
  endOfDay,
  endOfMonthKey,
  nowIso,
  parseIso,
  rangeDays,
  startOfDay,
  startOfMonthKey,
  startOfWeekKey,
  todayKey
} from '../utils/time'
import { listFocusRange } from '../db/repositories/focus.repo'
import { countEventsBetween } from '../db/repositories/schedule.repo'
import { dueCount } from '../db/repositories/review.repo'
import { listTasks } from '../db/repositories/task.repo'
import { listMemoryLogs, listMemoryLogsRaw, listRecentMemoryLogs } from '../db/repositories/memory.repo'

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
       WHERE t.deleted_at IS NULL AND t.completed_at >= ? AND t.completed_at <= ?`,
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
    })),
    ...listMemoryLogs(from, to)
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

/**
 * 拖延量化模型
 * ---------------------------------------------------------------
 * 设计参考：风险管理中「发生频率 × 影响严重度」的二维评估矩阵，
 * 并对单次拖延时长做对数压缩，避免个别超长逾期把整体分数一次性顶满。
 *
 *   单次事件得分  s(h) = min(40, 6 + 10 × ln(1 + h))   h = 本次拖延小时数
 *   频率增益      g(n) = 1 + 0.12 × (n − 1)            n = 区间内拖延次数
 *   综合程度      PI   = min(100, round(Σ s(h_i) × g(n)))
 *
 * 特点：
 * - 次数与单次时长两个要素都会影响结果（次数提升增益，时长提升单项得分）；
 * - 对数压缩让「1 次拖 2 小时」显著低于「5 次各拖 1 小时」，符合直觉；
 * - 分级：0-24 轻微 / 25-59 中等 / 60-100 严重。
 */
export function procrastinationDegree(events: { delayMinutes: number }[]): number {
  const n = events.length
  if (n === 0) return 0
  const sum = events.reduce((acc, event) => {
    const hours = Math.max(0.05, event.delayMinutes / 60)
    return acc + Math.min(40, 6 + 10 * Math.log(1 + hours))
  }, 0)
  const gain = 1 + 0.12 * (n - 1)
  return Math.max(0, Math.min(100, Math.round(sum * gain)))
}

export function procrastinationLevel(degree: number): ProcrastinationLevel {
  if (degree >= 60) return 'high'
  if (degree >= 25) return 'medium'
  return 'low'
}

interface DelayEvent {
  id: string
  taskId: number | null
  taskTitle: string
  kind: ProcrastinationEventKind
  delayMinutes: number
  at: string
}

const ALL_FROM = '0000-01-01T00:00:00'
const ALL_TO = '9999-12-31T23:59:59'

function listAllTasks(): Task[] {
  return all<TaskRow>(`${TASK_SELECT_FOR_STATS} WHERE t.deleted_at IS NULL`).map(mapTask)
}

/** 汇聚全部拖延事件：记忆流水（延期 / 进入逾期）+ 完成时已超时的兜底记录 */
function collectDelayEvents(tasks: Task[]): DelayEvent[] {
  const events: DelayEvent[] = []
  const tasksWithMemory = new Set<number>()
  for (const log of listMemoryLogsRaw(ALL_FROM, ALL_TO)) {
    const delay = log.delayMinutes > 0 ? log.delayMinutes : log.minutes
    events.push({
      id: `memory-${log.id}`,
      taskId: log.taskId,
      taskTitle: log.taskTitle && log.taskTitle.trim() !== '' ? log.taskTitle : '未命名事项',
      kind: log.kind === 'due' ? 'due' : 'defer',
      delayMinutes: Math.max(0, Math.round(delay)),
      at: log.createdAt
    })
    if (log.taskId !== null) tasksWithMemory.add(log.taskId)
  }
  // 兜底：完成任务在截止时间之后才完成，且从未产生延期/逾期处置记录
  for (const task of tasks) {
    if (!task.dueAt || !task.completedAt) continue
    if (tasksWithMemory.has(task.id)) continue
    if (task.completedAt > task.dueAt) {
      events.push({
        id: `complete-${task.id}`,
        taskId: task.id,
        taskTitle: task.title,
        kind: 'complete',
        delayMinutes: Math.max(1, diffMinutes(task.dueAt, task.completedAt)),
        at: task.completedAt
      })
    }
  }
  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

/** 当前仍未完成的逾期事项数量与累计拖欠时长 */
function activeOverdueSummary(tasks: Task[]): { count: number; minutes: number } {
  const now = nowIso()
  let count = 0
  let minutes = 0
  for (const task of tasks) {
    if (task.status === 'done' || !task.dueAt) continue
    if (task.dueAt >= now) continue
    count += 1
    minutes += Math.max(1, diffMinutes(task.dueAt, now))
  }
  return { count, minutes }
}

function eventsInRange(events: DelayEvent[], fromKey: string, toKey: string): DelayEvent[] {
  return events.filter((event) => {
    const key = dayKey(event.at)
    return key >= fromKey && key <= toKey
  })
}

function aggregate(events: DelayEvent[]): { events: number; delayMinutes: number; degree: number } {
  const delayMinutes = events.reduce((sum, event) => sum + event.delayMinutes, 0)
  return { events: events.length, delayMinutes, degree: procrastinationDegree(events) }
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

function formatDelayCN(minutes: number): string {
  const safe = Math.max(1, Math.round(minutes))
  if (safe < 60) return `${safe} 分钟`
  const days = Math.floor(safe / 1440)
  const hours = Math.floor((safe % 1440) / 60)
  const rest = Math.round(safe % 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (rest > 0 && days === 0) parts.push(`${rest} 分钟`)
  return parts.join(' ')
}

function buildDailySeries(events: DelayEvent[], anchor: string, days: number): ProcrastinationPoint[] {
  const from = addDaysKey(anchor, -(days - 1))
  return rangeDays(from, anchor).map((key) => {
    const stat = aggregate(eventsInRange(events, key, key))
    return { key, label: key.slice(5), events: stat.events, delayMinutes: stat.delayMinutes, degree: stat.degree }
  })
}

function buildWeeklySeries(events: DelayEvent[], anchor: string, weeks: number): ProcrastinationPoint[] {
  const currentWeek = startOfWeekKey(anchor)
  const points: ProcrastinationPoint[] = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDaysKey(currentWeek, -7 * i)
    const end = addDaysKey(start, 6)
    const stat = aggregate(eventsInRange(events, start, end))
    points.push({
      key: start,
      label: `${start.slice(5)} 周`,
      events: stat.events,
      delayMinutes: stat.delayMinutes,
      degree: stat.degree
    })
  }
  return points
}

function buildMonthlySeries(events: DelayEvent[], anchor: string, months: number): ProcrastinationPoint[] {
  const points: ProcrastinationPoint[] = []
  const [year, month] = anchor.slice(0, 7).split('-').map(Number)
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(year, month - 1 - i, 1)
    const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    const end = endOfMonthKey(start)
    const stat = aggregate(eventsInRange(events, start, end))
    points.push({
      key: start.slice(0, 7),
      label: start.slice(0, 7),
      events: stat.events,
      delayMinutes: stat.delayMinutes,
      degree: stat.degree
    })
  }
  return points
}

/** 日 / 周 / 月三档周期对比（含与上一周期的环比） */
function buildPeriods(events: DelayEvent[], anchor: string): ProcrastinationPeriod[] {
  const weekStart = startOfWeekKey(anchor)
  const weekEnd = addDaysKey(weekStart, 6)
  const lastWeekStart = addDaysKey(weekStart, -7)
  const monthStart = startOfMonthKey(anchor)
  const monthEnd = endOfMonthKey(anchor)
  const lastMonthEnd = addDaysKey(monthStart, -1)

  const segments: {
    key: ProcrastinationPeriod['key']
    label: string
    from: string
    to: string
    prevFrom: string
    prevTo: string
  }[] = [
    {
      key: 'day',
      label: '今日',
      from: anchor,
      to: anchor,
      prevFrom: addDaysKey(anchor, -1),
      prevTo: addDaysKey(anchor, -1)
    },
    { key: 'week', label: '本周', from: weekStart, to: weekEnd, prevFrom: lastWeekStart, prevTo: addDaysKey(weekStart, -1) },
    {
      key: 'month',
      label: '本月',
      from: monthStart,
      to: monthEnd,
      prevFrom: startOfMonthKey(lastMonthEnd),
      prevTo: lastMonthEnd
    }
  ]

  return segments.map((segment) => {
    const current = aggregate(eventsInRange(events, segment.from, segment.to))
    const previous = aggregate(eventsInRange(events, segment.prevFrom, segment.prevTo))
    return {
      key: segment.key,
      label: segment.label,
      rangeFrom: segment.from,
      rangeTo: segment.to,
      events: current.events,
      delayMinutes: current.delayMinutes,
      avgDelayMinutes: current.events === 0 ? 0 : Math.round(current.delayMinutes / current.events),
      degree: current.degree,
      level: procrastinationLevel(current.degree),
      changePercent: changePercent(current.degree, previous.degree)
    }
  })
}

/** 拖延量化报告：日 / 周 / 月对比图 + 记忆流水 + 提醒文案 */
export function procrastinationReport(anchor: string = todayKey(), historyDays = 30): ProcrastinationReport {
  const tasks = listAllTasks()
  const events = collectDelayEvents(tasks)
  const active = activeOverdueSummary(tasks)
  const periods = buildPeriods(events, anchor)
  const weekPeriod = periods.find((period) => period.key === 'week') ?? periods[0]

  const totalDelayMinutes = events.reduce((sum, event) => sum + event.delayMinutes, 0)

  // 按任务汇总，找出最需要关注的拖延事项
  const byTask = new Map<number, DelayEvent[]>()
  for (const event of events) {
    if (event.taskId === null) continue
    const list = byTask.get(event.taskId) ?? []
    list.push(event)
    byTask.set(event.taskId, list)
  }
  const worstTask = Array.from(byTask.entries())
    .map(([taskId, list]) => ({
      taskId,
      title: list[0]?.taskTitle ?? '未命名事项',
      count: list.length,
      minutes: list.reduce((sum, event) => sum + event.delayMinutes, 0),
      degree: procrastinationDegree(list)
    }))
    .sort((a, b) => b.degree - a.degree)[0]

  const advice: string[] = []
  if (active.count > 0) {
    advice.push(`当前有 ${active.count} 项事项处于逾期在途，累计拖欠 ${formatDelayCN(active.minutes)}，建议优先处理最久的一项。`)
  }
  const dayPeriod = periods.find((period) => period.key === 'day')
  if (dayPeriod && dayPeriod.events > 0) {
    advice.push(`今日已发生 ${dayPeriod.events} 次拖延，累计 ${formatDelayCN(dayPeriod.delayMinutes)}，尽快收口。`)
  }
  if (weekPeriod.changePercent !== null && weekPeriod.changePercent > 20) {
    advice.push(`本周拖延程度较上周上升 ${weekPeriod.changePercent}%，注意节流。`)
  } else if (weekPeriod.changePercent !== null && weekPeriod.changePercent < -20) {
    advice.push(`本周拖延程度较上周下降 ${Math.abs(weekPeriod.changePercent)}%，继续保持。`)
  }
  if (worstTask && worstTask.degree >= 50) {
    advice.push(
      `「${worstTask.title}」已拖延 ${worstTask.count} 次、累计 ${formatDelayCN(worstTask.minutes)}，建议拆分任务或重新评估截止时间。`
    )
  }
  if (advice.length === 0) advice.push('本周期拖延情况良好，保持当前节奏即可。')

  const recentEvents: ProcrastinationEvent[] = listRecentMemoryLogs(20).map((log) => ({
    id: `memory-${log.id}`,
    taskId: log.taskId,
    taskTitle: log.taskTitle && log.taskTitle.trim() !== '' ? log.taskTitle : '未命名事项',
    kind: log.kind === 'due' ? 'due' : 'defer',
    delayMinutes: Math.max(0, Math.round(log.delayMinutes > 0 ? log.delayMinutes : log.minutes)),
    at: log.createdAt,
    note: log.note
  }))

  return {
    generatedAt: nowIso(),
    totalEvents: events.length,
    totalDelayMinutes,
    avgDelayMinutes: events.length === 0 ? 0 : Math.round(totalDelayMinutes / events.length),
    activeOverdueCount: active.count,
    activeDelayMinutes: active.minutes,
    degree: weekPeriod.degree,
    level: procrastinationLevel(weekPeriod.degree),
    periods,
    daily: buildDailySeries(events, anchor, Math.max(7, Math.min(90, historyDays))),
    weekly: buildWeeklySeries(events, anchor, 12),
    monthly: buildMonthlySeries(events, anchor, 6),
    recentEvents,
    advice
  }
}

export function procrastination(): ProcrastinationItem[] {
  const today = todayKey()
  const now = nowIso()
  const tasks = listAllTasks()
  const delayEvents = collectDelayEvents(tasks)
  const eventsByTask = new Map<number, DelayEvent[]>()
  for (const event of delayEvents) {
    if (event.taskId === null) continue
    const list = eventsByTask.get(event.taskId) ?? []
    list.push(event)
    eventsByTask.set(event.taskId, list)
  }

  const items: ProcrastinationItem[] = []
  for (const task of tasks) {
    if (task.status === 'done') continue
    const stalledDays = Math.max(0, diffDays(task.updatedAt, today))
    const overdueDays = task.dueAt ? Math.max(0, diffDays(task.dueAt, today)) : 0
    const progressLag = task.progress < 30 && stalledDays >= 5 && overdueDays === 0
    const taskEvents = eventsByTask.get(task.id) ?? []
    const activeDelayMinutes =
      task.dueAt && task.dueAt < now ? Math.max(1, diffMinutes(task.dueAt, now)) : 0
    // 没有处置记录但仍处于逾期在途时，以在途时长作为一次拖延度量
    const measured =
      taskEvents.length > 0
        ? taskEvents
        : activeDelayMinutes > 0
          ? [
              {
                id: `active-${task.id}`,
                taskId: task.id,
                taskTitle: task.title,
                kind: 'due' as ProcrastinationEventKind,
                delayMinutes: activeDelayMinutes,
                at: now
              }
            ]
          : []
    const delayCount = measured.length
    const delayMinutes = measured.reduce((sum, event) => sum + event.delayMinutes, 0)
    const degree = procrastinationDegree(measured)

    if (overdueDays < 1 && stalledDays < 4 && !progressLag && delayCount === 0) continue

    const reasons: string[] = []
    if (overdueDays >= 1) reasons.push(activeDelayMinutes > 0 ? `逾期中 ${overdueDays} 天` : `已逾期 ${overdueDays} 天`)
    if (stalledDays >= 4) reasons.push(`停滞 ${stalledDays} 天未更新`)
    if (progressLag) reasons.push(`进度仅 ${task.progress}%`)
    if (delayCount > 0) reasons.push(`拖延 ${delayCount} 次 · 累计 ${formatDelayCN(delayMinutes)}`)

    const severity: ProcrastinationItem['severity'] =
      overdueDays >= 7 || stalledDays >= 14 || degree >= 70
        ? 'high'
        : overdueDays >= 3 || stalledDays >= 7 || degree >= 40
          ? 'medium'
          : 'low'

    items.push({
      task,
      stalledDays,
      overdueDays,
      reason: reasons.join(' · ') || '长期未推进',
      severity,
      delayCount,
      delayMinutes,
      activeOverdue: activeDelayMinutes > 0,
      activeDelayMinutes,
      degree
    })
  }
  return items.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 }
    return rank[a.severity] - rank[b.severity] || b.degree - a.degree || b.overdueDays - a.overdueDays
  })
}

export function workSummary(): { totalTasks: number; doneTasks: number; activeReviews: number; totalFocusMinutes: number } {
  const totalTasks = count('SELECT COUNT(*) AS c FROM tasks WHERE deleted_at IS NULL')
  const doneTasks = count("SELECT COUNT(*) AS c FROM tasks WHERE status = 'done' AND deleted_at IS NULL")
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
