import type { DatabaseSync } from 'node:sqlite'
import { logger } from '../../utils/logger'
import { INIT_SQL } from './001_init'
import { TASK_PRIORITY_ORDER_SQL } from './002_task_priority_order'
import { TASK_RECYCLE_OVERDUE_MEMORY_SQL } from './003_recycle_overdue_memory'
import { PROCRASTINATION_INTELLIGENCE_SQL } from './004_procrastination_intelligence'
import { NOTE_DOCUMENTS_SQL } from './005_note_documents'
import { NOTE_SUMMARY_READING_SQL } from './006_note_summary_reading'
import { NOTE_SORT_ORDER_SQL } from './007_note_sort_order'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { version: 1, name: 'init', sql: INIT_SQL },
  { version: 2, name: 'task-priority-order', sql: TASK_PRIORITY_ORDER_SQL },
  { version: 3, name: 'recycle-overdue-memory', sql: TASK_RECYCLE_OVERDUE_MEMORY_SQL },
  { version: 4, name: 'procrastination-intelligence', sql: PROCRASTINATION_INTELLIGENCE_SQL },
  { version: 5, name: 'note-documents', sql: NOTE_DOCUMENTS_SQL },
  { version: 6, name: 'note-summary-reading', sql: NOTE_SUMMARY_READING_SQL },
  { version: 7, name: 'note-sort-order', sql: NOTE_SORT_ORDER_SQL }
]

/**
 * 基于 PRAGMA user_version 的顺序迁移执行器。
 * 每个迁移在独立事务中执行，失败即回滚，避免留下半成品 schema。
 */
export function runMigrations(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  const current = Number(row?.user_version ?? 0)
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version)

  if (pending.length === 0) {
    logger.info(`数据库结构已是最新（version=${current}）`)
    return
  }

  for (const migration of pending) {
    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
      logger.info(`迁移完成：v${migration.version} ${migration.name}`)
    } catch (error) {
      db.exec('ROLLBACK')
      logger.error(`迁移失败：v${migration.version} ${migration.name}`, error)
      throw error
    }
  }
}
