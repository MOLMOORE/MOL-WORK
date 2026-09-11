import { create } from 'zustand'
import type { Project, ProjectInput, Task, TaskDetail, TaskInput, TaskStatus } from '@shared/types/domain'
import { api } from '../lib/ipc'

export interface TaskFilterState {
  projectId: number | null
  status: TaskStatus | 'all'
  keyword: string
  onlyOverdue: boolean
}
export type TaskView = 'list' | 'board'

interface TaskState {
  tasks: Task[]
  projects: Project[]
  filter: TaskFilterState
  view: TaskView
  detail: TaskDetail | null
  loading: boolean
  detailLoading: boolean
  load: () => Promise<void>
  loadProjects: () => Promise<void>
  setFilter: (patch: Partial<TaskFilterState>) => Promise<void>
  setView: (view: TaskView) => void
  openDetail: (id: number) => Promise<void>
  closeDetail: () => void
  refreshDetail: () => Promise<void>
  createTask: (input: TaskInput) => Promise<Task>
  updateTask: (id: number, patch: Partial<TaskInput>) => Promise<void>
  removeTask: (id: number) => Promise<void>
  toggleTask: (id: number) => Promise<void>
  moveTask: (id: number, dayKey: string) => Promise<void>
  reorderTasks: (orderedIds: number[]) => Promise<void>
  saveProject: (input: ProjectInput) => Promise<void>
  removeProject: (id: number) => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  projects: [],
  filter: { projectId: null, status: 'all', keyword: '', onlyOverdue: false },
  view: 'list',
  detail: null,
  loading: false,
  detailLoading: false,

  load: async () => {
    const { filter } = get()
    set({ loading: true })
    const tasks = await api.task.list({
      projectId: filter.projectId,
      status: filter.status,
      keyword: filter.keyword || undefined,
      onlyOverdue: filter.onlyOverdue || undefined
    })
    set({ tasks, loading: false })
  },

  loadProjects: async () => {
    const projects = await api.project.list()
    set({ projects })
  },

  setFilter: async (patch) => {
    set({ filter: { ...get().filter, ...patch } })
    await get().load()
  },

  setView: (view) => set({ view }),

  openDetail: async (id) => {
    set({ detailLoading: true })
    const detail = await api.task.get(id)
    set({ detail, detailLoading: false })
  },

  closeDetail: () => set({ detail: null }),

  refreshDetail: async () => {
    const current = get().detail
    if (!current) return
    const detail = await api.task.get(current.task.id)
    set({ detail })
  },

  createTask: async (input) => {
    const task = await api.task.create(input)
    await Promise.all([get().load(), get().loadProjects()])
    return task
  },

  updateTask: async (id, patch) => {
    await api.task.update(id, patch)
    await Promise.all([get().load(), get().loadProjects()])
    if (get().detail?.task.id === id) await get().openDetail(id)
  },

  removeTask: async (id) => {
    await api.task.remove(id)
    if (get().detail?.task.id === id) set({ detail: null })
    await Promise.all([get().load(), get().loadProjects()])
  },

  toggleTask: async (id) => {
    await api.task.toggle(id)
    await Promise.all([get().load(), get().loadProjects()])
    if (get().detail?.task.id === id) await get().openDetail(id)
  },

  moveTask: async (id, dayKey) => {
    await api.task.move(id, dayKey)
    await get().load()
    if (get().detail?.task.id === id) await get().openDetail(id)
  },

  reorderTasks: async (orderedIds) => {
    await api.task.reorder(orderedIds)
    await get().load()
  },

  saveProject: async (input) => {
    await api.project.save(input)
    await get().loadProjects()
  },

  removeProject: async (id) => {
    await api.project.remove(id)
    await Promise.all([get().loadProjects(), get().load()])
  }
}))
