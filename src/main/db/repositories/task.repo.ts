import type { Task, TaskFilter, TaskInput, TaskStatus } from '@shared/types/domain'
import { all, count, insert, run } from '../query'
import type { SqlParam } from '../query'
import { joinTags, mapTask, type TaskRow } from '../mappers'
import { addDays, endOfDay, nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'

const TASK_SELECT = `
SELECT t.*,
  p.name AS project_name,
  p.color AS project_color,
  COALESCE((SELECT SUM(f.duration_minutes) FROM focus_sessions f WHERE f.task_id = t.id), 0) AS focus_minutes,
  (SELECT COUNT(*) FROM notes n WHERE n.task_id = t.id) AS note_count,
  (SELECT COUNT(*) FROM review_items r
     WHERE r.task_id = t.id AND r.status = 'active' AND r.due_at <= ?) AS pending_reviews,
  (SELECT COUNT(*) FROM schedule_events e WHERE e.task_id = t.id) AS schedule_count
FROM tasks t
LEFT JOIN projects p ON p.id = t.project_id
`

const ORDER_CLAUSE = `
ORDER BY
  CASE t.status WHEN 'done' THEN 3 WHEN 'blocked' THEN 2 WHEN 'doing' THEN 1 ELSE 0 END,
  t.priority ASC,
  COALESCE(t.due_at, '9999-12-31T00:00:00') ASC,
  t.id DESC
`

export function listTasks(filter: TaskFilter = {}): Task[] {
  const now = nowIso()
  const conditions: string[] = []
  const params: SqlParam[] = [now]

  if (filter.projectId !== undefined && filter.projectId !== null) {
    conditions.push('t.project_id = ?')
    params.push(filter.projectId)
  }
  if (filter.status && filter.status !== 'all') {
    conditions.push('t.status = ?')
    params.push(filter.status)
  }
  if (filter.keyword && filter.keyword.trim() !== '') {
    const like = `%${filter.keyword.trim()}%`
    conditions.push('(t.title LIKE ? OR t.detail LIKE ? OR t.tags LIKE ?)')
    params.push(like, like, like)
  }
  if (filter.onlyOverdue) {
    conditions.push("t.due_at IS NOT NULL AND t.due_at < ? AND t.status <> 'done'")
    params.push(now)
  }
  if (filter.dueWithinDays !== undefined) {
    conditions.push('t.due_at IS NOT NULL AND t.due_at <= ?')
    params.push(endOfDay(addDays(new Date(), filter.dueWithinDays)))
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  let sql = `${TASK_SELECT} ${where} ${ORDER_CLAUSE}`
  if (filter.limit && filter.limit > 0) {
    sql += ' LIMIT ?'
  }
  const rows = filter.limit && filter.limit > 0
    ? all<TaskRow>(sql, ...params, filter.limit)
    : all<TaskRow>(sql, ...params)
  return rows.map(mapTask)
}

export function getTask(id: number): Task | undefined {
  const row = all<TaskRow>(`${TASK_SELECT} WHERE t.id = ?`, nowIso(), id)[0]
  return row ? mapTask(row) : undefined
}

export function createTask(input: TaskInput): Task {
  const timestamp = nowIso()
  const id = insert(
    `INSERT INTO tasks (project_id, title, detail, status, priority, progress, due_at, estimate_minutes, tags, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.projectId ?? null,
    input.title.trim(),
    input.detail ?? '',
    input.status ?? 'todo',
    input.priority ?? 2,
    input.progress ?? 0,
    input.dueAt ?? null,
    input.estimateMinutes ?? 0,
    joinTags(input.tags),
    timestamp,
    timestamp,
    input.status === 'done' ? timestamp : null
  )
  syncSearch(id)
  return getTask(id) as Task
}

export function updateTask(id: number, patch: Partial<TaskInput>): Task {
  const fields: string[] = []
  const params: SqlParam[] = []

  if (patch.projectId !== undefined) {
    fields.push('project_id = ?')
    params.push(patch.projectId ?? null)
  }
  if (patch.title !== undefined) {
    fields.push('title = ?')
    params.push(patch.title.trim())
  }
  if (patch.detail !== undefined) {
    fields.push('detail = ?')
    params.push(patch.detail)
  }
  if (patch.status !== undefined) {
    fields.push('status = ?')
    params.push(patch.status)
    fields.push('completed_at = ?')
    params.push(patch.status === 'done' ? nowIso() : null)
    if (patch.status === 'done') {
      fields.push('progress = ?')
      params.push(100)
    }
  }
  if (patch.priority !== undefined) {
    fields.push('priority = ?')
    params.push(patch.priority)
  }
  if (patch.progress !== undefined) {
    fields.push('progress = ?')
    params.push(Math.max(0, Math.min(100, patch.progress)))
  }
  if (patch.dueAt !== undefined) {
    fields.push('due_at = ?')
    params.push(patch.dueAt ?? null)
  }
  if (patch.estimateMinutes !== undefined) {
    fields.push('estimate_minutes = ?')
    params.push(patch.estimateMinutes)
  }
  if (patch.tags !== undefined) {
    fields.push('tags = ?')
    params.push(joinTags(patch.tags))
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?')
    params.push(nowIso())
    run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
    syncSearch(id)
  }
  return getTask(id) as Task
}

export function removeTask(id: number): void {
  run('DELETE FROM tasks WHERE id = ?', id)
  removeEntity('task', id)
}

export function toggleTaskDone(id: number): Task {
  const task = getTask(id)
  const nextStatus: TaskStatus = task?.status === 'done' ? 'todo' : 'done'
  const timestamp = nowIso()
  run(
    `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?,
      progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END
     WHERE id = ?`,
    nextStatus,
    nextStatus === 'done' ? timestamp : null,
    timestamp,
    nextStatus,
    id
  )
  syncSearch(id)
  return getTask(id) as Task
}

export function taskCount(): number {
  return count('SELECT COUNT(*) AS c FROM tasks')
}

export function syncSearch(id: number): void {
  const task = getTask(id)
  if (!task) return
  indexEntity({
    kind: 'task',
    refId: id,
    title: task.title,
    body: `${task.detail} ${task.tags.join(' ')}`,
    meta: `${task.projectName ?? '未归属'} · ${task.status} · 优先级${task.priority}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM tasks')
  for (const row of rows) syncSearch(Number(row.id))
}
