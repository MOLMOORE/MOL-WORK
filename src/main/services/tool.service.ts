import type { ToolField, ToolManifest, ToolRunRecord, ToolRunResult } from '@shared/types/domain'
import { allDefinitions, getDefinition, toolIds } from '../tools/registry'
import type { ResolvedToolField, ToolContext, ToolFieldOptions } from '../tools/types'
import { outputsDir } from '../utils/paths'
import { logger } from '../utils/logger'
import {
  getToolRun,
  getToolState,
  insertToolRun,
  listToolRuns,
  listToolRunsBetween,
  listToolStates,
  removeToolState,
  upsertToolState
} from '../db/repositories/tool.repo'
import { listTasks } from '../db/repositories/task.repo'
import { listProjects } from '../db/repositories/project.repo'
import { indexEntity, removeEntity } from '../db/repositories/search.repo'
import { checkDependencies } from '../utils/dependency-check'
import { notifyDataChanged } from './bus'

function resolveOptions(source: ToolField['optionsSource']): ToolFieldOptions[] {
  if (source === 'tasks') {
    return listTasks({ status: 'all' })
      .filter((task) => task.status !== 'done')
      .map((task) => ({
        label: `${task.title}${task.projectName ? ` · ${task.projectName}` : ''}`,
        value: String(task.id)
      }))
  }
  if (source === 'projects') {
    return listProjects().map((project) => ({ label: project.name, value: String(project.id) }))
  }
  return []
}

function hydrateFields(fields: ToolField[]): ResolvedToolField[] {
  return fields.map((field) => {
    if (!field.optionsSource) return field
    const options = resolveOptions(field.optionsSource)
    return { ...field, options: options.length > 0 ? options : field.options }
  })
}

export async function listToolManifests(): Promise<ToolManifest[]> {
  const dependencies = await checkDependencies()
  const states = new Map(listToolStates().map((state) => [state.tool_id, state]))
  return allDefinitions()
    .map((definition) => {
      const state = states.get(definition.manifest.id)
      const manifest: ToolManifest = {
        ...definition.manifest,
        fields: hydrateFields(definition.manifest.fields),
        enabled: state ? Number(state.enabled) === 1 : true,
        installed: state ? Number(state.installed) === 1 : true,
        dependencyStatus: dependencies.filter((dep) => definition.manifest.requires.includes(dep.id))
      }
      return manifest
    })
    .filter((manifest) => manifest.installed)
}

export function syncToolSearchIndex(): void {
  for (const definition of allDefinitions()) {
    indexEntity({
      kind: 'tool',
      refId: definition.manifest.id,
      title: definition.manifest.name,
      body: `${definition.manifest.description} ${definition.manifest.category} 工具`,
      meta: '可用工具'
    })
  }
}

function summarizeInput(payload: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue
    const text = String(value)
    parts.push(`${key}=${text.length > 80 ? `${text.slice(0, 80)}…` : text}`)
    if (parts.length >= 4) break
  }
  return parts.join(' | ').slice(0, 400)
}

function buildContext(): ToolContext {
  return {
    outputRoot: outputsDir(),
    getString: (payload, key, fallback = '') => {
      const value = payload[key]
      if (value === undefined || value === null) return fallback
      const text = String(value).trim()
      return text === '' ? fallback : text
    },
    getNumber: (payload, key, fallback = 0) => {
      const value = Number(payload[key])
      return Number.isFinite(value) ? value : fallback
    },
    getBoolean: (payload, key, fallback = false) => {
      const value = payload[key]
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 1 || value === '1') return true
      if (value === 'false' || value === 0 || value === '0') return false
      return fallback
    }
  }
}

export async function executeTool(
  toolId: string,
  payload: Record<string, unknown>
): Promise<ToolRunResult> {
  const definition = getDefinition(toolId)
  if (!definition) {
    throw new Error(`工具不存在：${toolId}`)
  }

  const state = getToolState(toolId)
  if (state && Number(state.enabled) === 0) {
    throw new Error(`工具「${definition.manifest.name}」已被停用，请先在工具页启用`)
  }

  const started = Date.now()
  logger.info(`工具开始执行：${toolId}`)
  const ctx = buildContext()

  const outcome = await definition.run(payload, ctx)
  const durationMs = Date.now() - started

  const runId = insertToolRun({
    toolId,
    toolName: definition.manifest.name,
    category: definition.manifest.category,
    inputSummary: summarizeInput(payload),
    status: outcome.ok ? 'success' : 'failed',
    durationMs,
    resultPath: outcome.resultPath ?? null,
    resultSummary: outcome.resultSummary ?? null,
    error: outcome.ok ? null : outcome.error ?? '未知错误'
  })

  logger.info(`工具执行结束：${toolId} ${outcome.ok ? 'success' : 'failed'} ${durationMs}ms`)
  notifyDataChanged('tools')

  return {
    ok: outcome.ok,
    run: getToolRun(runId) as ToolRunRecord,
    outputs: outcome.outputs ?? [],
    preview: outcome.preview
  }
}

export function toolHistory(limit = 60): ToolRunRecord[] {
  return listToolRuns(limit)
}

export function listTaskRunsForRange(fromIso: string, toIso: string): ToolRunRecord[] {
  return listToolRunsBetween(fromIso, toIso)
}

export function toggleTool(id: string, enabled: boolean): void {
  upsertToolState(id, { enabled })
  notifyDataChanged('tools')
}

export function removeTool(id: string): void {
  upsertToolState(id, { installed: false })
  removeEntity('tool', id)
  notifyDataChanged('tools')
}

export function restoreBuiltins(): void {
  for (const id of toolIds()) {
    upsertToolState(id, { installed: true, enabled: true })
  }
  removeToolState('__removed__')
  syncToolSearchIndex()
  notifyDataChanged('tools')
}
