import type { TimelineEntry } from '@shared/types/domain'
import { all, insert } from '../query'
import { nowIso } from '../../utils/time'

export type MemoryKind = 'due' | 'defer'

export interface MemoryLogInput {
  taskId?: number | null
  taskTitle: string
  kind: MemoryKind
  minutes?: number
  note?: string
}

/** 记录事项截止 / 延期事件，归类为「记忆」进入统计时间线 */
export function recordMemoryLog(input: MemoryLogInput): void {
  insert(
    `INSERT INTO memory_logs (task_id, task_title, kind, minutes, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.taskId ?? null,
    input.taskTitle,
    input.kind,
    input.minutes ?? 0,
    input.note ?? '',
    nowIso()
  )
}

/** 查询时间范围内的记忆事件（用于统计时间线） */
export function listMemoryLogs(fromIso: string, toIso: string): TimelineEntry[] {
  return all<{
    id: number | bigint
    task_title: string
    kind: string
    minutes: number | bigint
    note: string
    created_at: string
  }>(
    'SELECT id, task_title, kind, minutes, note, created_at FROM memory_logs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
    fromIso,
    toIso
  ).map<TimelineEntry>((row) => ({
    id: `memory-${row.id}`,
    kind: 'memory',
    title: strTitle(row.task_title),
    at: String(row.created_at),
    durationMinutes: 0,
    detail:
      row.kind === 'due'
        ? `截止到期 · ${row.note}`
        : `延期 · ${row.note}`
  }))
}

function strTitle(value: string): string {
  return value && value.trim() !== '' ? value : '未命名事项'
}
