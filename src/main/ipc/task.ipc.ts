import type { Project, ProjectInput, Task, TaskDetail, TaskFilter, TaskInput } from '@shared/types/domain'
import { handle } from './handle'
import {
  createProject,
  listProjects,
  removeProject,
  updateProject
} from '../db/repositories/project.repo'
import {
  createTaskService,
  deferTaskService,
  deleteTask,
  dueTasksService,
  listDeletedTasksService,
  listOverdueService,
  listTaskService,
  markOverdueService,
  moveTaskService,
  purgeExpiredService,
  purgeTaskService,
  reorderTaskService,
  restoreTaskService,
  taskDetail,
  toggleTask,
  updateTaskService
} from '../services/task.service'
import { notifyDataChanged } from '../services/bus'

export function registerTaskIpc(): void {
  handle<Project[]>('project:list', () => listProjects())

  handle<Project>('project:save', (input: ProjectInput) => {
    const project = input.id ? updateProject(input.id, input) : createProject(input)
    notifyDataChanged('projects')
    return project
  })

  handle<void>('project:remove', (id: number) => {
    removeProject(id)
    notifyDataChanged('projects')
  })

  handle<Task[]>('task:list', (filter?: TaskFilter) => listTaskService(filter ?? {}))

  handle<TaskDetail>('task:get', (id: number) => taskDetail(id))

  handle<Task>('task:create', (input: TaskInput) => {
    const task = createTaskService(input)
    notifyDataChanged('tasks')
    return task
  })

  handle<Task>('task:update', (id: number, patch: Partial<TaskInput>) => {
    const task = updateTaskService(id, patch)
    notifyDataChanged('tasks')
    return task
  })

  handle<void>('task:remove', (id: number) => {
    deleteTask(id)
    notifyDataChanged('tasks')
  })

  handle<void>('task:restore', (id: number) => {
    restoreTaskService(id)
    notifyDataChanged('tasks')
  })

  handle<void>('task:purge', (id: number) => {
    purgeTaskService(id)
    notifyDataChanged('tasks')
  })

  handle<Task[]>('task:list-deleted', () => listDeletedTasksService())

  handle<number>('task:purge-expired', (retentionDays: number) => purgeExpiredService(retentionDays))

  handle<Task[]>('task:list-overdue', () => listOverdueService())

  handle<Task>('task:mark-overdue', (id: number) => {
    const task = markOverdueService(id)
    notifyDataChanged('tasks')
    return task
  })

  handle<Task>('task:defer', (id: number, minutes: number) => {
    const task = deferTaskService(id, minutes)
    notifyDataChanged('tasks')
    return task
  })

  handle<Task>('task:toggle', (id: number) => {
    const task = toggleTask(id)
    notifyDataChanged('tasks')
    return task
  })

  handle<Task>('task:move', (id: number, dayKey: string) => {
    const task = moveTaskService(id, dayKey)
    notifyDataChanged('tasks')
    return task
  })

  handle<void>('task:reorder', (orderedIds: number[]) => {
    reorderTaskService(orderedIds)
    notifyDataChanged('tasks')
  })

  handle<Task[]>('task:due', (referenceIso?: string) => dueTasksService(referenceIso))
}
