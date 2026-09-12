import type { TimelineEntry } from '@shared/types/domain'
import { all, insert } from '../query'
import { toNumber } from '../connection'
import { nowIso } from '../../utils/time'

export type MemoryKind = 'due' | 'defer'

export interface MemoryLogInput {
  taskId?: number | null
  taskTitle: string
  kind: MemoryKind
  minutes?: number
  /** 本次拖延时长（分钟）：延期=计划被推后的时长；逾期=已超时时长 */
  delayMinutes?: number
  /** 事件发生时所对应的截止时间 */
  dueAt?: string | null
  note?: string
}

export interface MemoryLogRow {
  id: number
  taskId: number | null
  taskTitle: string
  kind: string
  minutes: number
  delayMinutes: number
  dueAt: string | null
  note: string
  createdAt: string
}

/** 记录事项截止 / 延期事件，归类为「记忆」进入统计时间线 */
export function recordMemoryLog(input: MemoryLogInput): void {
  insert(
    `INSERT INTO memory_logs (task_id, task_title, kind, minutes, delay_minutes, due_at, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.taskId ?? null,
    input.taskTitle,
    input.kind,
    input.minutes ?? 0,
    input.delayMinutes ?? 0,
    input.dueAt ?? null,
    input.note ?? '',
    nowIso()
  )
}

interface RawMemoryRow {
  id: number | bigint
  task_id: number | bigint | null
  task_title: string
  kind: string
  minutes: number | bigint
  delay_minutes: number | bigint | null
  due_at: string | null
  note: string
  created_at: string
}

function mapRow(row: RawMemoryRow): MemoryLogRow {
  return {
    id: toNumber(row.id),
    taskId: row.task_id === null || row.task_id === undefined ? null : toNumber(row.task_id),
    taskTitle: row.task_title ?? '',
    kind: row.kind,
    minutes: toNumber(row.minutes),
    delayMinutes: toNumber(row.delay_minutes ?? 0),
    dueAt: row.due_at ?? null,
    note: row.note ?? '',
    createdAt: String(row.created_at)
  }
}

/** 查询时间范围内的记忆事件（用于统计时间线） */
export function listMemoryLogs(fromIso: string, toIso: string): TimelineEntry[] {
  return all<RawMemoryRow>(
    'SELECT id, task_id, task_title, kind, minutes, delay_minutes, due_at, note, created_at FROM memory_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
    fromIso,
    toIso
  ).map<TimelineEntry>((row) => ({
    id: `memory-${row.id}`,
    kind: 'memory',
    title: strTitle(row.task_title),
    at: String(row.created_at),
    durationMinutes: toNumber(row.delay_minutes ?? row.minutes),
    detail:
      row.kind === 'due'
        ? `截止到期 · ${row.note}`
        : `延期 · ${row.note}`
  }))
}

/** 查询原始记忆行（拖延量化分析用） */
export function listMemoryLogsRaw(fromIso: string, toIso: string, limit = 2000): MemoryLogRow[] {
  return all<RawMemoryRow>(
    `SELECT id, task_id, task_title, kind, minutes, delay_minutes, due_at, note, created_at
     FROM memory_logs WHERE created_at >= ? AND created_at <= ?
     ORDER BY created_at DESC LIMIT ?`,
    fromIso,
    toIso,
    limit
  ).map(mapRow)
}

/** 查询某个任务的记忆事件（判断是否已有截止/延期处置记录） */
export function listMemoryLogsByTask(taskId: number): MemoryLogRow[] {
  return all<RawMemoryRow>(
    `SELECT id, task_id, task_title, kind, minutes, delay_minutes, due_at, note, created_at
     FROM memory_logs WHERE task_id = ? ORDER BY created_at ASC`,
    taskId
  ).map(mapRow)
}

/** 最近若干条记忆事件，用于拖延记忆时间线 */
export function listRecentMemoryLogs(limit = 40): MemoryLogRow[] {
  return all<RawMemoryRow>(
    `SELECT id, task_id, task_title, kind, minutes, delay_minutes, due_at, note, created_at
     FROM memory_logs ORDER BY created_at DESC LIMIT ?`,
    limit
  ).map(mapRow)
}

function strTitle(value: string): string {
  return value && value.trim() !== '' ? value : '未命名事项'
}
