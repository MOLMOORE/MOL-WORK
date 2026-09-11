import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../utils/logger'
import { runMigrations } from './migrations'

let instance: DatabaseSync | null = null
let dbFilePath = ''

export function getDb(): DatabaseSync {
  if (!instance) {
    throw new Error('数据库尚未初始化，请先调用 initDatabase()')
  }
  return instance
}

export function getDbFilePath(): string {
  return dbFilePath
}

/**
 * 初始化本地 SQLite 数据库（WAL 模式 + 外键约束 + 全文索引）。
 * 使用 Electron 内置的 node:sqlite，无需任何原生模块编译。
 */
export function initDatabase(): DatabaseSync {
  if (instance) return instance

  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  dbFilePath = join(dir, 'workstation.db')

  const db = new DatabaseSync(dbFilePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')

  runMigrations(db)

  instance = db
  logger.info(`数据库就绪：${dbFilePath}`)
  return db
}

export function closeDatabase(): void {
  if (!instance) return
  try {
    instance.close()
    logger.info('数据库连接已关闭')
  } catch (error) {
    logger.error('关闭数据库失败', error)
  }
  instance = null
}

/** 在事务中执行一段逻辑，失败自动回滚 */
export function transaction<T>(fn: () => T): T {
  const db = getDb()
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
