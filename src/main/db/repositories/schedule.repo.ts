import type { ScheduleEvent, ScheduleInput } from '@shared/types/domain'
import { all, insert, run } from '../query'
import type { SqlParam } from '../query'
import { mapEvent, type EventRow } from '../mappers'
import { nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'

const EVENT_SELECT = `
SELECT e.*, t.status AS task_status, p.name AS project_name
FROM schedule_events e
LEFT JOIN tasks t ON t.id = e.task_id
LEFT JOIN projects p ON p.id = t.project_id
`

export function listEvents(fromIso: string, toIso: string): ScheduleEvent[] {
  return all<EventRow>(
    `${EVENT_SELECT} WHERE e.start_at <= ? AND e.end_at >= ? ORDER BY e.start_at ASC`,
    toIso,
    fromIso
  ).map(mapEvent)
}

export function listEventsForDay(dayKey: string): ScheduleEvent[] {
  return all<EventRow>(
    `${EVENT_SELECT} WHERE e.start_at >= ? AND e.start_at <= ? ORDER BY e.start_at ASC`,
    `${dayKey}T00:00:00`,
    `${dayKey}T23:59:59`
  ).map(mapEvent)
}

export function listEventsByTask(taskId: number): ScheduleEvent[] {
  return all<EventRow>(`${EVENT_SELECT} WHERE e.task_id = ? ORDER BY e.start_at ASC`, taskId).map(mapEvent)
}

export function listUpcomingEvents(referenceIso: string, limit = 8): ScheduleEvent[] {
  return all<EventRow>(
    `${EVENT_SELECT} WHERE e.end_at >= ? ORDER BY e.start_at ASC LIMIT ?`,
    referenceIso,
    limit
  ).map(mapEvent)
}

export function getEvent(id: number): ScheduleEvent | undefined {
  const row = all<EventRow>(`${EVENT_SELECT} WHERE e.id = ?`, id)[0]
  return row ? mapEvent(row) : undefined
}

export function createEvent(input: ScheduleInput): ScheduleEvent {
  const id = insert(
    `INSERT INTO schedule_events (task_id, review_item_id, title, type, start_at, end_at, all_day, reminder_at, reminded, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    input.taskId ?? null,
    input.reviewItemId ?? null,
    input.title.trim(),
    input.type ?? 'task',
    input.startAt,
    input.endAt,
    input.allDay ? 1 : 0,
    input.reminderAt ?? null,
    input.note ?? '',
    nowIso()
  )
  syncSearch(id)
  return getEvent(id) as ScheduleEvent
}

export function updateEvent(id: number, patch: Partial<ScheduleInput>): ScheduleEvent {
  const fields: string[] = []
  const params: SqlParam[] = []
  if (patch.taskId !== undefined) {
    fields.push('task_id = ?')
    params.push(patch.taskId ?? null)
  }
  if (patch.reviewItemId !== undefined) {
    fields.push('review_item_id = ?')
    params.push(patch.reviewItemId ?? null)
  }
  if (patch.title !== undefined) {
    fields.push('title = ?')
    params.push(patch.title.trim())
  }
  if (patch.type !== undefined) {
    fields.push('type = ?')
    params.push(patch.type)
  }
  if (patch.startAt !== undefined) {
    fields.push('start_at = ?')
    params.push(patch.startAt)
  }
  if (patch.endAt !== undefined) {
    fields.push('end_at = ?')
    params.push(patch.endAt)
  }
  if (patch.allDay !== undefined) {
    fields.push('all_day = ?')
    params.push(patch.allDay ? 1 : 0)
  }
  if (patch.reminderAt !== undefined) {
    fields.push('reminder_at = ?')
    params.push(patch.reminderAt ?? null)
    fields.push('reminded = 0')
  }
  if (patch.note !== undefined) {
    fields.push('note = ?')
    params.push(patch.note)
  }
  if (fields.length > 0) {
    run(`UPDATE schedule_events SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
    syncSearch(id)
  }
  return getEvent(id) as ScheduleEvent
}

export function removeEvent(id: number): void {
  run('DELETE FROM schedule_events WHERE id = ?', id)
  removeEntity('event', id)
}

export function removeEventsByReview(reviewId: number): void {
  const rows = all<{ id: number }>('SELECT id FROM schedule_events WHERE review_item_id = ?', reviewId)
  run('DELETE FROM schedule_events WHERE review_item_id = ?', reviewId)
  for (const row of rows) removeEntity('event', Number(row.id))
}

export function removeEventsByTask(taskId: number): void {
  const rows = all<{ id: number }>('SELECT id FROM schedule_events WHERE task_id = ?', taskId)
  for (const row of rows) removeEntity('event', Number(row.id))
}

/** 到点未提醒的事件 */
export function listDueReminders(referenceIso: string, limit = 50): ScheduleEvent[] {
  return all<EventRow>(
    `${EVENT_SELECT}
     WHERE e.reminded = 0
       AND (
         (e.reminder_at IS NOT NULL AND e.reminder_at <= ?)
         OR (e.reminder_at IS NULL AND e.start_at <= ?)
       )
     ORDER BY e.start_at ASC
     LIMIT ?`,
    referenceIso,
    referenceIso,
    limit
  ).map(mapEvent)
}

export function markReminded(id: number): void {
  run('UPDATE schedule_events SET reminded = 1 WHERE id = ?', id)
}

export function resetReminded(id: number): void {
  run('UPDATE schedule_events SET reminded = 0 WHERE id = ?', id)
}

export function countEventsBetween(fromIso: string, toIso: string): number {
  const row = all<{ c: number }>(
    'SELECT COUNT(*) AS c FROM schedule_events WHERE start_at >= ? AND start_at <= ?',
    fromIso,
    toIso
  )[0]
  return row ? Number(row.c) : 0
}

export function syncSearch(id: number): void {
  const event = getEvent(id)
  if (!event) return
  indexEntity({
    kind: 'event',
    refId: id,
    title: event.title,
    body: `${event.note} ${event.projectName ?? ''}`,
    meta: `日程 · ${event.startAt.replace('T', ' ').slice(0, 16)}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM schedule_events')
  for (const row of rows) syncSearch(Number(row.id))
}
