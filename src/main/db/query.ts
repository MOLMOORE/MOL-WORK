import { getDb, toNumber } from './connection'

export type SqlParam = string | number | null | bigint | Uint8Array

export function all<T>(sql: string, ...params: SqlParam[]): T[] {
  return getDb().prepare(sql).all(...params) as T[]
}

export function get<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined
}

export function run(sql: string, ...params: SqlParam[]): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params)
  return {
    changes: toNumber(result.changes),
    lastInsertRowid: toNumber(result.lastInsertRowid)
  }
}

/** 插入并返回自增主键 */
export function insert(sql: string, ...params: SqlParam[]): number {
  return run(sql, ...params).lastInsertRowid
}

export function exec(sql: string): void {
  getDb().exec(sql)
}

export function count(sql: string, ...params: SqlParam[]): number {
  const row = get<{ c: number | bigint }>(sql, ...params)
  return toNumber(row?.c ?? 0)
}
