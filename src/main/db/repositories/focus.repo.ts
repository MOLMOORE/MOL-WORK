import type { FocusSession } from '@shared/types/domain'
import { all, insert, run } from '../query'
import { mapFocus, type FocusRow } from '../mappers'
import { diffMinutes, nowIso } from '../../utils/time'

const FOCUS_SELECT = `
SELECT f.*, t.title AS task_title
FROM focus_sessions f
LEFT JOIN tasks t ON t.id = f.task_id
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
    `SELECT t.project_id AS project_id, COALESCE(SUM(f.duration_minutes), 0) AS minutes
     FROM focus_sessions f
     LEFT JOIN tasks t ON t.id = f.task_id
     WHERE f.started_at >= ? AND f.started_at <= ?
     GROUP BY t.project_id`,
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
