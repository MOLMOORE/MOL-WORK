import { create } from 'zustand'
import type { AppSettings, DependencyStatus, OverviewData } from '@shared/types/domain'
import type { ReminderPayload } from '@shared/types/ipc'
import { api } from '../lib/ipc'

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: 'info' | 'success' | 'warning' | 'danger'
}

interface AppState {
  settings: AppSettings | null
  overview: OverviewData | null
  dependencies: DependencyStatus[]
  reminders: ReminderPayload[]
  toasts: ToastItem[]
  ready: boolean
  init: () => Promise<void>
  refreshOverview: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  refreshDependencies: (force?: boolean) => Promise<void>
  pushToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (id: number) => void
  pushReminder: (payload: ReminderPayload) => void
  clearReminders: () => void
  seedDemo: () => Promise<void>
}

let toastSeed = 0

function applyTheme(theme: AppSettings['theme']): void {
  document.documentElement.dataset.theme = theme
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  overview: null,
  dependencies: [],
  reminders: [],
  toasts: [],
  ready: false,

  init: async () => {
    const settings = await api.app.getSettings()
    applyTheme(settings.theme)
    set({ settings })
    await Promise.all([get().refreshOverview(), get().refreshDependencies()])
    api.onReminder((payload) => get().pushReminder(payload))
    api.onDataChanged((scope) => {
      if (scope === 'all' || scope === 'tasks' || scope === 'schedule' || scope === 'focus' || scope === 'tools') {
        void get().refreshOverview()
      }
    })
    window.__workstationEvents?.reviewAutoScheduled(({ date, count }) => {
      get().pushToast({
        title: '复习已自动排程',
        description: `已将 ${count} 条待复习内容排入 ${date} 的日程`,
        tone: 'info'
      })
      void get().refreshOverview()
    })
    set({ ready: true })
  },

  refreshOverview: async () => {
    const overview = await api.app.getOverview()
    set({ overview })
  },

  updateSettings: async (patch) => {
    const settings = await api.app.updateSettings(patch)
    if (patch.theme) applyTheme(settings.theme)
    set({ settings })
  },

  refreshDependencies: async (force) => {
    const dependencies = await api.app.checkDependencies(force)
    set({ dependencies })
  },

  pushToast: (toast) => {
    toastSeed += 1
    const id = toastSeed
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    window.setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),

  pushReminder: (payload) => {
    set((state) => ({ reminders: [payload, ...state.reminders].slice(0, 20) }))
    get().pushToast({ title: payload.title, description: payload.body, tone: 'warning' })
  },

  clearReminders: () => set({ reminders: [] }),

  seedDemo: async () => {
    const result = await api.app.seedDemo()
    get().pushToast({
      title: result.created ? '示例数据已写入' : '示例数据已存在',
      description: result.created ? '已生成课程、任务、笔记与复习计划' : '当前数据库已有任务，跳过写入',
      tone: result.created ? 'success' : 'info'
    })
    await get().refreshOverview()
  }
}))
