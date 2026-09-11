import { create } from 'zustand'
import type { DependencyStatus, ToolManifest, ToolRunRecord, ToolRunResult } from '@shared/types/domain'
import { api } from '../lib/ipc'

interface ToolState {
  tools: ToolManifest[]
  history: ToolRunRecord[]
  dependencies: DependencyStatus[]
  loading: boolean
  checking: boolean
  running: string | null
  selectedId: string | null
  results: Record<string, ToolRunResult>
  load: () => Promise<void>
  refreshDependencies: (force?: boolean) => Promise<void>
  select: (id: string | null) => void
  run: (id: string, payload: Record<string, unknown>) => Promise<ToolRunResult>
  toggle: (id: string, enabled: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  restore: () => Promise<void>
  clearResult: (id: string) => void
  historyFor: (id: string) => ToolRunRecord[]
}

const HISTORY_LIMIT = 200

export const useToolStore = create<ToolState>((set, get) => ({
  tools: [],
  history: [],
  dependencies: [],
  loading: false,
  checking: false,
  running: null,
  selectedId: null,
  results: {},

  load: async () => {
    set({ loading: true })
    const [tools, history, dependencies] = await Promise.all([
      api.tool.list(),
      api.tool.history(HISTORY_LIMIT),
      api.app.checkDependencies(false)
    ])
    set({ tools, history, dependencies, loading: false })
  },

  refreshDependencies: async (force = true) => {
    set({ checking: true })
    const dependencies = await api.app.checkDependencies(force)
    const tools = await api.tool.list()
    set({ dependencies, tools, checking: false })
  },

  select: (id) => set({ selectedId: id }),

  run: async (id, payload) => {
    set({ running: id })
    try {
      const result = await api.tool.run(id, payload)
      const history = await api.tool.history(HISTORY_LIMIT)
      set((state) => ({ running: null, history, results: { ...state.results, [id]: result } }))
      return result
    } catch (error) {
      set({ running: null })
      throw error
    }
  },

  toggle: async (id, enabled) => {
    await api.tool.toggle(id, enabled)
    await get().load()
  },

  remove: async (id) => {
    await api.tool.remove(id)
    set((state) => (state.selectedId === id ? { selectedId: null } : {}))
    await get().load()
  },

  restore: async () => {
    await api.tool.restoreBuiltins()
    await get().load()
  },

  clearResult: (id) =>
    set((state) => {
      const next = { ...state.results }
      delete next[id]
      return { results: next }
    }),

  historyFor: (id) => get().history.filter((run) => run.toolId === id)
}))
