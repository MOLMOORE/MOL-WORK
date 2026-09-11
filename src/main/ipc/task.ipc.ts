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
  deleteTask,
  listTaskService,
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

  handle<Task>('task:toggle', (id: number) => {
    const task = toggleTask(id)
    notifyDataChanged('tasks')
    return task
  })
}
