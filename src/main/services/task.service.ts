import type { Task, TaskDetail, TaskFilter, TaskInput } from '@shared/types/domain'
import {
  createTask,
  getTask,
  listDueTasks,
  listTasks,
  moveTaskToDay,
  removeTask,
  reorderTasks,
  toggleTaskDone,
  updateTask
} from '../db/repositories/task.repo'
import { listEventsByTask, removeEventsByTask } from '../db/repositories/schedule.repo'
import { listReviewsByTask } from '../db/repositories/review.repo'
import { listFocusByTask } from '../db/repositories/focus.repo'
import { listNotes } from './note.service'
import { ensureReviewForNote } from './review.service'
import { nowIso } from '../utils/time'

export function listTaskService(filter: TaskFilter = {}): Task[] {
  return listTasks(filter)
}

export function createTaskService(input: TaskInput): Task {
  return createTask(input)
}

export function updateTaskService(id: number, patch: Partial<TaskInput>): Task {
  return updateTask(id, patch)
}

export function deleteTask(id: number): void {
  removeEventsByTask(id)
  removeTask(id)
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
