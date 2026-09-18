import type { FocusSession, ReadingLogInput } from '@shared/types/domain'
import { all, insert, run } from '../query'
import { mapFocus, type FocusRow } from '../mappers'
import { diffMinutes, nowIso } from '../../utils/time'

const FOCUS_SELECT = `
SELECT f.*, t.title AS task_title, p.name AS project_name, n.title AS note_title
FROM focus_sessions f
LEFT JOIN tasks t ON t.id = f.task_id
LEFT JOIN projects p ON p.id = COALESCE(f.project_id, t.project_id)
LEFT JOIN notes n ON n.id = f.note_id
`

export function startFocus(taskId: number | null, note = ''): FocusSession {
  const id = insert(
    `INSERT INTO focus_sessions (task_id, started_at, duration_minutes, note, created_at)
     VALUES (?, ?, 0, ?, ?)`,
    taskId,
    nowIso(),
    note,
    nowIso()
  )
  return getFocus(id) as FocusSession
}

export function stopFocus(id: number): FocusSession {
  const existing = getFocus(id)
  if (!existing) throw new Error(`专注记录不存在：${id}`)
  const endedAt = nowIso()
  const minutes = Math.max(1, diffMinutes(existing.startedAt, endedAt))
  run('UPDATE focus_sessions SET ended_at = ?, duration_minutes = ? WHERE id = ?', endedAt, minutes, id)
  return getFocus(id) as FocusSession
}

/** 直接记录一段已完成的专注（番茄钟结束调用），无需先开再关 */
export function logFocus(
  taskId: number | null,
  minutes: number,
  note = '',
  endedAt = nowIso(),
  extra: { projectId?: number | null; noteId?: number | null } = {}
): FocusSession {
  const safeMinutes = Math.max(1, Math.round(minutes))
  const startedAt = new Date(new Date(endedAt.replace(' ', 'T')).getTime() - safeMinutes * 60000)
  const started = Number.isNaN(startedAt.getTime())
    ? endedAt
    : `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(startedAt.getDate()).padStart(2, '0')}T${String(
        startedAt.getHours()
      ).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}:${String(startedAt.getSeconds()).padStart(2, '0')}`
  const id = insert(
    `INSERT INTO focus_sessions (task_id, project_id, note_id, started_at, ended_at, duration_minutes, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    extra.projectId ?? null,
    extra.noteId ?? null,
    started,
    endedAt,
    safeMinutes,
    note,
    nowIso()
  )
  return getFocus(id) as FocusSession
}

/**
 * 阅读计时：读资料的时间算进它关联的任务 / 项目（课程）的专注时间。
 * 不足一分钟不写库，返回 null 让调用方继续累积。
 */
export function logReading(input: ReadingLogInput): FocusSession | null {
  const minutes = Math.floor(input.minutes)
  if (minutes < 1) return null
  return logFocus(
    input.taskId ?? null,
    minutes,
    input.label ?? '阅读资料',
    nowIso(),
    { projectId: input.projectId ?? null, noteId: input.noteId }
  )
}

/** 某条笔记已累计的阅读分钟数 */
export function sumReadingMinutes(noteId: number): number {
  const row = all<{ s: number | null }>(
    'SELECT SUM(duration_minutes) AS s FROM focus_sessions WHERE note_id = ?',
    noteId
  )[0]
  return row && row.s !== null ? Number(row.s) : 0
}

export function getFocus(id: number): FocusSession | undefined {
  const row = all<FocusRow>(`${FOCUS_SELECT} WHERE f.id = ?`, id)[0]
  return row ? mapFocus(row) : undefined
}

export function getActiveFocus(): FocusSession | null {
  const row = all<FocusRow>(
    `${FOCUS_SELECT} WHERE f.ended_at IS NULL ORDER BY f.started_at DESC LIMIT 1`
  )[0]
  return row ? mapFocus(row) : null
}

export function listFocusByTask(taskId: number): FocusSession[] {
  return all<FocusRow>(`${FOCUS_SELECT} WHERE f.task_id = ? ORDER BY f.started_at DESC`, taskId).map(mapFocus)
}

export function listFocusRange(fromIso: string, toIso: string): FocusSession[] {
  return all<FocusRow>(
    `${FOCUS_SELECT} WHERE f.started_at >= ? AND f.started_at <= ? ORDER BY f.started_at ASC`,
    fromIso,
    toIso
  ).map(mapFocus)
}

export function sumFocusMinutesForTask(taskId: number): number {
  const row = all<{ s: number | null }>(
    'SELECT SUM(duration_minutes) AS s FROM focus_sessions WHERE task_id = ?',
    taskId
  )[0]
  return row && row.s !== null ? Number(row.s) : 0
}

export function sumFocusMinutes(fromIso: string, toIso: string): number {
  const row = all<{ s: number | null }>(
    'SELECT SUM(duration_minutes) AS s FROM focus_sessions WHERE started_at >= ? AND started_at <= ?',
    fromIso,
    toIso
  )[0]
  return row && row.s !== null ? Number(row.s) : 0
}

export function listFocusByProject(fromIso: string, toIso: string): { project_id: number | null; minutes: number }[] {
  return all<{ project_id: number | null; minutes: number }>(
    `SELECT COALESCE(f.project_id, t.project_id) AS project_id, COALESCE(SUM(f.duration_minutes), 0) AS minutes
     FROM focus_sessions f
     LEFT JOIN tasks t ON t.id = f.task_id
     WHERE f.started_at >= ? AND f.started_at <= ?
     GROUP BY COALESCE(f.project_id, t.project_id)`,
    fromIso,
    toIso
  ).map((row) => ({ project_id: row.project_id === null ? null : Number(row.project_id), minutes: Number(row.minutes) }))
}

/** 兜底：清理因异常退出而遗留的未结束专注记录 */
export function closeDanglingFocus(): number {
  const result = run(
    `UPDATE focus_sessions SET ended_at = datetime(started_at, '+25 minutes'), duration_minutes = 25
     WHERE ended_at IS NULL`
  )
  return result.changes
}
