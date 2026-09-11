import type { Task, TaskDetail, TaskFilter, TaskInput } from '@shared/types/domain'
import {
  createTask,
  getTask,
  listTasks,
  removeTask,
  toggleTaskDone,
  updateTask
} from '../db/repositories/task.repo'
import { listEventsByTask, removeEventsByTask } from '../db/repositories/schedule.repo'
import { listReviewsByTask } from '../db/repositories/review.repo'
import { listFocusByTask } from '../db/repositories/focus.repo'
import { listNotes } from './note.service'
import { ensureReviewForNote } from './review.service'

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
