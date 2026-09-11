import type { ToolRunRecord } from '@shared/types/domain'
import { all, run } from '../query'
import { mapToolRun, type ToolRunRow } from '../mappers'
import { nowIso } from '../../utils/time'

export interface ToolStateRow {
  tool_id: string
  enabled: number
  installed: number
  config: string
  updated_at: string
}

export function listToolStates(): ToolStateRow[] {
  return all<ToolStateRow>('SELECT * FROM tool_states')
}

export function getToolState(toolId: string): ToolStateRow | undefined {
  return all<ToolStateRow>('SELECT * FROM tool_states WHERE tool_id = ?', toolId)[0]
}

export function upsertToolState(
  toolId: string,
  patch: { enabled?: boolean; installed?: boolean; config?: Record<string, unknown> }
): void {
  const existing = getToolState(toolId)
  if (!existing) {
    run(
      'INSERT INTO tool_states (tool_id, enabled, installed, config, updated_at) VALUES (?, ?, ?, ?, ?)',
      toolId,
      patch.enabled === false ? 0 : 1,
      patch.installed === false ? 0 : 1,
      JSON.stringify(patch.config ?? {}),
      nowIso()
    )
    return
  }
  const fields: string[] = []
  const params: (string | number)[] = []
  if (patch.enabled !== undefined) {
    fields.push('enabled = ?')
    params.push(patch.enabled ? 1 : 0)
  }
  if (patch.installed !== undefined) {
    fields.push('installed = ?')
    params.push(patch.installed ? 1 : 0)
  }
  if (patch.config !== undefined) {
    fields.push('config = ?')
    params.push(JSON.stringify(patch.config))
  }
  if (fields.length === 0) return
  fields.push('updated_at = ?')
  params.push(nowIso())
  run(`UPDATE tool_states SET ${fields.join(', ')} WHERE tool_id = ?`, ...params, toolId)
}

export function removeToolState(toolId: string): void {
  run('DELETE FROM tool_states WHERE tool_id = ?', toolId)
}

export interface ToolRunInsert {
  toolId: string
  toolName: string
  category: string
  inputSummary: string
  status: 'success' | 'failed'
  durationMs: number
  resultPath: string | null
  resultSummary: string | null
  error: string | null
}

export function insertToolRun(record: ToolRunInsert): number {
  const result = run(
    `INSERT INTO tool_runs (tool_id, tool_name, category, input_summary, status, duration_ms, result_path, result_summary, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.toolId,
    record.toolName,
    record.category,
    record.inputSummary,
    record.status,
    record.durationMs,
    record.resultPath,
    record.resultSummary,
    record.error,
    nowIso()
  )
  return result.lastInsertRowid
}

export function getToolRun(id: number): ToolRunRecord | undefined {
  const row = all<ToolRunRow>('SELECT * FROM tool_runs WHERE id = ?', id)[0]
  return row ? mapToolRun(row) : undefined
}

export function listToolRuns(limit = 50): ToolRunRecord[] {
  return all<ToolRunRow>('SELECT * FROM tool_runs ORDER BY created_at DESC LIMIT ?', limit).map(mapToolRun)
}

export function listToolRunsBetween(fromIso: string, toIso: string): ToolRunRecord[] {
  return all<ToolRunRow>(
    'SELECT * FROM tool_runs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC',
    fromIso,
    toIso
  ).map(mapToolRun)
}

export function sumToolDuration(fromIso: string, toIso: string): number {
  const row = all<{ s: number | null }>(
    'SELECT SUM(duration_ms) AS s FROM tool_runs WHERE created_at >= ? AND created_at <= ?',
    fromIso,
    toIso
  )[0]
  return row && row.s !== null ? Number(row.s) : 0
}
