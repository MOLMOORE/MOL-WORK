import { SEARCH_MIN_TRIGRAM_LENGTH } from '@shared/constants'
import type { SearchHit } from '@shared/types/domain'
import { toNumber } from '../connection'
import { all, run } from '../query'
import { logger } from '../../utils/logger'

interface SearchRow {
  kind: string
  ref_id: string
  title: string
  body: string
  meta: string
  score?: number
  snip?: string
}

export interface IndexEntry {
  kind: SearchHit['kind']
  refId: number | string
  title: string
  body: string
  meta: string
}

export function indexEntity(entry: IndexEntry): void {
  try {
    run('DELETE FROM search_index WHERE kind = ? AND ref_id = ?', entry.kind, String(entry.refId))
    run(
      'INSERT INTO search_index (kind, ref_id, title, body, meta) VALUES (?, ?, ?, ?, ?)',
      entry.kind,
      String(entry.refId),
      entry.title,
      entry.body,
      entry.meta
    )
  } catch (error) {
    logger.warn(`写入全文索引失败：${entry.kind}#${entry.refId}`, error)
  }
}

export function removeEntity(kind: SearchHit['kind'], refId: number | string): void {
  try {
    run('DELETE FROM search_index WHERE kind = ? AND ref_id = ?', kind, String(refId))
  } catch (error) {
    logger.warn(`删除全文索引失败：${kind}#${refId}`, error)
  }
}

export function clearIndex(): void {
  try {
    run('DELETE FROM search_index')
  } catch (error) {
    logger.warn('清空全文索引失败', error)
  }
}

function toHit(row: SearchRow): SearchHit {
  return {
    kind: row.kind as SearchHit['kind'],
    refId: Number.isNaN(Number(row.ref_id)) ? row.ref_id : toNumber(row.ref_id),
    title: row.title,
    snippet: (row.snip ?? row.body ?? row.title).slice(0, 240),
    meta: row.meta,
    score: row.score === undefined ? 0 : -Number(row.score)
  }
}

function searchLike(keyword: string, limit: number): SearchHit[] {
  const like = `%${keyword}%`
  return all<SearchRow>(
    `SELECT kind, ref_id, title, body, meta, body AS snip, 0 AS score
     FROM search_index
     WHERE title LIKE ? OR body LIKE ? OR meta LIKE ?
     LIMIT ?`,
    like,
    like,
    like,
    limit
  ).map(toHit)
}

/**
 * 全局搜索：优先使用 FTS5 trigram（支持中文子串），
 * 关键词短于 3 字符或 FTS 语法异常时退化为 LIKE 扫描。
 */
export function search(keyword: string, limit = 20): SearchHit[] {
  const q = keyword.trim()
  if (q.length === 0) return []

  if ([...q].length < SEARCH_MIN_TRIGRAM_LENGTH) {
    return searchLike(q, limit)
  }

  const match = `"${q.replace(/"/g, '""')}"`
  try {
    const rows = all<SearchRow>(
      `SELECT kind, ref_id, title,
              snippet(search_index, 3, '‹', '›', '…', 14) AS snip,
              meta, bm25(search_index) AS score
       FROM search_index
       WHERE search_index MATCH ?
       ORDER BY score
       LIMIT ?`,
      match,
      limit
    )
    if (rows.length > 0) return rows.map(toHit)
    return searchLike(q, limit)
  } catch (error) {
    logger.warn('FTS 查询失败，回退 LIKE 搜索', error)
    return searchLike(q, limit)
  }
}
