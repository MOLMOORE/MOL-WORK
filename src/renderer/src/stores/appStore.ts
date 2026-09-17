import { create } from 'zustand'
import type {
  AppSettings,
  DependencyStatus,
  FontSize,
  OverviewData,
  ThemeMode,
  ThemePreset
} from '@shared/types/domain'
import type { ReminderPayload } from '@shared/types/ipc'
import { FONT_SIZE_META } from '@shared/constants'
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

/** 跟随系统时解析为实际生效的深浅色 */
export function resolveTheme(theme: ThemeMode): 'dark' | 'light' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 应用主题：深浅色 + 预设配色方案一起落到 <html> 的 data 属性上，CSS 变量随即生效 */
export function applyTheme(theme: ThemeMode, preset: ThemePreset = 'minimal'): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(theme)
  root.dataset.preset = preset
}

/** 当前生效的深浅色（供图表取色等场景使用） */
export function activeMode(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyFontSize(size: FontSize): void {
  document.documentElement.style.fontSize = FONT_SIZE_META[size]?.root ?? '16px'
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
    applyTheme(settings.theme, settings.themePreset)
    applyFontSize(settings.fontSize)
    set({ settings })
    // 主题设为「跟随系统」时，实时响应系统深浅色变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().settings?.theme === 'system') applyTheme('system', get().settings?.themePreset)
      })
    }
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
    if (patch.theme !== undefined || patch.themePreset !== undefined) applyTheme(settings.theme, settings.themePreset)
    if (patch.fontSize !== undefined) applyFontSize(settings.fontSize)
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
