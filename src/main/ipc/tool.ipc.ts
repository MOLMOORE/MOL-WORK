import type { ToolManifest, ToolRunRecord, ToolRunResult } from '@shared/types/domain'
import { handle } from './handle'
import {
  executeTool,
  listToolManifests,
  removeTool,
  restoreBuiltins,
  toggleTool,
  toolHistory
} from '../services/tool.service'
import { notifyDataChanged } from '../services/bus'

export function registerToolIpc(): void {
  handle<ToolManifest[]>('tool:list', () => listToolManifests())

  handle<void>('tool:toggle', (id: string, enabled: boolean) => {
    toggleTool(id, enabled)
  })

  handle<ToolRunResult>('tool:run', (id: string, payload: Record<string, unknown>) =>
    executeTool(id, payload ?? {})
  )

  handle<ToolRunRecord[]>('tool:history', (limit?: number) => toolHistory(limit ?? 60))

  handle<void>('tool:remove', (id: string) => {
    removeTool(id)
  })

  handle<ToolManifest[]>('tool:restore', () => {
    restoreBuiltins()
    notifyDataChanged('tools')
    return listToolManifests()
  })
}
