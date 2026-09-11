import type { Task, TaskDetail, TaskFilter, TaskInput } from '@shared/types/domain'
import {
  createTask,
  getTask,
  listDeletedTasks,
  listDueTasks,
  listOverdueTasks,
  listTasks,
  markTaskOverdue,
  moveTaskToDay,
  purgeExpiredDeleted,
  purgeTask,
  removeTask,
  reorderTasks,
  restoreTask,
  toggleTaskDone,
  updateTask
} from '../db/repositories/task.repo'
import { recordMemoryLog } from '../db/repositories/memory.repo'
import { listEventsByTask } from '../db/repositories/schedule.repo'
import { listReviewsByTask } from '../db/repositories/review.repo'
import { listFocusByTask } from '../db/repositories/focus.repo'
import { listNotes } from './note.service'
import { ensureReviewForNote } from './review.service'
import { nowIso, parseIso, toLocalIso } from '../utils/time'

export function listTaskService(filter: TaskFilter = {}): Task[] {
  return listTasks(filter)
}

export function createTaskService(input: TaskInput): Task {
  return createTask(input)
}

export function updateTaskService(id: number, patch: Partial<TaskInput>): Task {
  return updateTask(id, patch)
}

/** 删除任务：进入回收站（软删除），默认保留一周后自动清理 */
export function deleteTask(id: number): void {
  removeTask(id)
}

/** 从回收站恢复任务 */
export function restoreTaskService(id: number): Task | undefined {
  return restoreTask(id)
}

/** 彻底删除（不可恢复） */
export function purgeTaskService(id: number): void {
  purgeTask(id)
}

/** 回收站列表 */
export function listDeletedTasksService(): Task[] {
  return listDeletedTasks()
}

/** 清理超过保留期的回收站任务，返回清理数量 */
export function purgeExpiredService(retentionDays: number): number {
  return purgeExpiredDeleted(retentionDays)
}

/** 逾期事项列表（is_overdue=1 且未完成） */
export function listOverdueService(): Task[] {
  return listOverdueTasks()
}

export function toggleTask(id: number): Task {
  return toggleTaskDone(id)
}

/** 拖拽：把任务移到任意日期 */
export function moveTaskService(id: number, dayKey: string): Task {
  return moveTaskToDay(id, dayKey)
}

/** 拖拽：重排同一日期内的任务顺序 */
export function reorderTaskService(orderedIds: number[]): void {
  reorderTasks(orderedIds)
}

/** 截止时间已到的待办，用于到点弹窗警示 */
export function dueTasksService(referenceIso?: string): Task[] {
  return listDueTasks(referenceIso ?? nowIso())
}

export function taskDetail(id: number): TaskDetail {
  const task = getTask(id)
  if (!task) throw new Error(`任务不存在：${id}`)
  const notes = listNotes(id, undefined)
  for (const note of notes) {
    if (note.kind !== 'material' && !note.review) ensureReviewForNote(note)
  }
  return {
    task,
    schedules: listEventsByTask(id),
    notes: listNotes(id, undefined),
    reviews: listReviewsByTask(id),
    focusSessions: listFocusByTask(id)
  }
}

/** 不修改截止时间：升级为逾期事项（优先级仅低于优先事项），并计入记忆；重复升级时幂等 */
export function markOverdueService(id: number): Task {
  const current = getTask(id)
  if (!current) throw new Error(`任务不存在：${id}`)
  if (current.isOverdue) return current
  const task = markTaskOverdue(id)
  if (!task) throw new Error(`任务不存在：${id}`)
  recordMemoryLog({
    taskId: id,
    taskTitle: task.title,
    kind: 'due',
    minutes: 0,
    note: '截止时间已到且未延期，升级为逾期事项'
  })
  return task
}

/** 延期：把截止时间从当前时刻延后 seconds 秒（解除逾期升级），并计入记忆 */
export function deferTaskService(id: number, seconds: number): Task {
  const current = getTask(id)
  if (!current) throw new Error(`任务不存在：${id}`)
  const safeSeconds = Math.max(1, Math.round(seconds))
  const base = current.dueAt && current.dueAt > nowIso() ? current.dueAt : nowIso()
  const nextDue = new Date(parseIso(base).getTime() + safeSeconds * 1000)
  const task = updateTask(id, { dueAt: toLocalIso(nextDue) })
  recordMemoryLog({
    taskId: id,
    taskTitle: task.title,
    kind: 'defer',
    minutes: Math.max(1, Math.round(safeSeconds / 60)),
    note: `截止时间延后 ${formatDefer(safeSeconds)}`
  })
  return task
}

function formatDefer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} 秒`)
  return parts.join(' ')
}
