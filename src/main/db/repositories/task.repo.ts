import type { Task, TaskFilter, TaskInput, TaskStatus } from '@shared/types/domain'
import { all, count, insert, run } from '../query'
import type { SqlParam } from '../query'
import { joinTags, mapTask, type TaskRow } from '../mappers'
import { addDays, addMinutes, endOfDay, nowIso } from '../../utils/time'
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
  t.is_priority DESC,
  t.is_overdue DESC,
  COALESCE(t.due_at, '9999-12-31T00:00:00') ASC,
  t.sort_order ASC,
  t.id DESC
`

export function listTasks(filter: TaskFilter = {}): Task[] {
  const now = nowIso()
  const conditions: string[] = ['t.deleted_at IS NULL']
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
  if (filter.onlyPriority) {
    conditions.push('t.is_priority = 1')
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

/** 全局递增排序权重，保证新建任务默认追加在列表末尾 */
export function nextSortOrder(): number {
  const row = all<{ v: number | null }>('SELECT MAX(sort_order) AS v FROM tasks')[0]
  return (row && row.v !== null ? Number(row.v) : 0) + 1
}

/** 截止时间已到且未完成的待办，用于到点弹窗警示 */
export function listDueTasks(referenceIso: string, limit = 50): Task[] {
  return all<TaskRow>(
    `${TASK_SELECT} WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL AND t.due_at <= ? AND t.status <> 'done'
     ORDER BY t.due_at ASC LIMIT ?`,
    nowIso(),
    referenceIso,
    limit
  ).map(mapTask)
}

/** 已升级为逾期事项（is_overdue=1）且未完成的任务 */
export function listOverdueTasks(limit = 50): Task[] {
  return all<TaskRow>(
    `${TASK_SELECT} WHERE t.deleted_at IS NULL AND t.is_overdue = 1 AND t.status <> 'done'
     ORDER BY t.due_at ASC LIMIT ?`,
    nowIso(),
    limit
  ).map(mapTask)
}

/**
 * 把任务移动到指定日期：保留原有时间点，仅替换日期部分；
 * 无截止时间时默认 09:00。移动后置于目标日期末尾。
 */
export function moveTaskToDay(id: number, dayKey: string): Task {
  const current = getTask(id)
  if (!current) throw new Error(`任务不存在：${id}`)
  const timePart = current.dueAt && current.dueAt.length >= 16 ? current.dueAt.slice(11, 19) : '09:00:00'
  const dueAt = `${dayKey}T${timePart}`
  run(
    'UPDATE tasks SET due_at = ?, sort_order = ?, updated_at = ? WHERE id = ?',
    dueAt,
    nextSortOrder(),
    nowIso(),
    id
  )
  syncSearch(id)
  return getTask(id) as Task
}

/** 按给定顺序重写某一日期内任务的排列权重 */
export function reorderTasks(orderedIds: number[]): void {
  const timestamp = nowIso()
  orderedIds.forEach((taskId, index) => {
    run('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?', index, timestamp, taskId)
  })
}

export function getTask(id: number): Task | undefined {
  const row = all<TaskRow>(`${TASK_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`, nowIso(), id)[0]
  return row ? mapTask(row) : undefined
}

export function createTask(input: TaskInput): Task {
  const timestamp = nowIso()
  const id = insert(
    `INSERT INTO tasks (project_id, title, detail, status, is_priority, sort_order, progress, due_at, estimate_minutes, tags, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.projectId ?? null,
    input.title.trim(),
    input.detail ?? '',
    input.status ?? 'todo',
    input.isPriority ? 1 : 0,
    input.sortOrder ?? nextSortOrder(),
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
  if (patch.isPriority !== undefined) {
    fields.push('is_priority = ?')
    params.push(patch.isPriority ? 1 : 0)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    params.push(patch.sortOrder)
  }
  if (patch.progress !== undefined) {
    fields.push('progress = ?')
    params.push(Math.max(0, Math.min(100, patch.progress)))
  }
  if (patch.dueAt !== undefined) {
    fields.push('due_at = ?')
    params.push(patch.dueAt ?? null)
    // 截止时间被调整后视为已处理，解除逾期升级状态
    fields.push('is_overdue = 0')
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

/** 软删除：任务进入回收站，保留一周（可配置）后由清理任务真正删除 */
export function removeTask(id: number): void {
  const timestamp = nowIso()
  run('UPDATE tasks SET deleted_at = ?, is_overdue = 0, updated_at = ? WHERE id = ?', timestamp, timestamp, id)
  removeEntity('task', id)
}

/** 从回收站恢复任务 */
export function restoreTask(id: number): Task | undefined {
  run('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), id)
  syncSearch(id)
  return getDeletedTask(id)
}

/** 查询回收站中的任务（含被删字段） */
export function getDeletedTask(id: number): Task | undefined {
  const rows = all<TaskRow>(`${TASK_SELECT} WHERE t.id = ? AND t.deleted_at IS NOT NULL`, nowIso(), id)
  return rows[0] ? mapTask(rows[0]) : undefined
}

/** 彻底删除：移除任务及其关联数据（不可恢复） */
export function purgeTask(id: number): void {
  run('DELETE FROM review_items WHERE task_id = ?', id)
  run('DELETE FROM notes WHERE task_id = ?', id)
  run('DELETE FROM schedule_events WHERE task_id = ?', id)
  run('DELETE FROM memory_logs WHERE task_id = ?', id)
  run('DELETE FROM tasks WHERE id = ?', id)
  removeEntity('task', id)
}

/** 回收站列表（按删除时间倒序） */
export function listDeletedTasks(limit = 200): Task[] {
  return all<TaskRow>(
    `${TASK_SELECT} WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC LIMIT ?`,
    nowIso(),
    limit
  ).map(mapTask)
}

/** 清理超过保留期的回收站任务，返回彻底删除的数量 */
export function purgeExpiredDeleted(retentionDays: number): number {
  const cutoff = addMinutes(nowIso(), -Math.max(1, retentionDays) * 24 * 60)
  const rows = all<{ id: number | bigint }>(
    'SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at <= ?',
    cutoff
  )
  for (const row of rows) purgeTask(Number(row.id))
  return rows.length
}

/** 升级为逾期事项：优先级仅低于优先事项 */
export function markTaskOverdue(id: number): Task | undefined {
  run('UPDATE tasks SET is_overdue = 1, updated_at = ? WHERE id = ?', nowIso(), id)
  return getTask(id)
}

export function toggleTaskDone(id: number): Task {
  const task = getTask(id)
  const nextStatus: TaskStatus = task?.status === 'done' ? 'todo' : 'done'
  const timestamp = nowIso()
  run(
    `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ?, is_overdue = 0,
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
  return count('SELECT COUNT(*) AS c FROM tasks WHERE deleted_at IS NULL')
}

export function syncSearch(id: number): void {
  const task = getTask(id)
  if (!task) return
  indexEntity({
    kind: 'task',
    refId: id,
    title: task.title,
    body: `${task.detail} ${task.tags.join(' ')}`,
    meta: `${task.projectName ?? '未归属'} · ${task.status} · ${task.isPriority ? '优先事项' : '普通事项'}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM tasks WHERE deleted_at IS NULL')
  for (const row of rows) syncSearch(Number(row.id))
}
