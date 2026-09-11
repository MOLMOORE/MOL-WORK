import { SM2_DEFAULT_EASE } from '@shared/constants'
import type { ReviewItem, ReviewStatus } from '@shared/types/domain'
import { all, insert, run } from '../query'
import type { SqlParam } from '../query'
import { mapReview, type ReviewRow } from '../mappers'
import { endOfDay, nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'

const REVIEW_SELECT = `
SELECT r.*, n.title AS note_title, p.name AS project_name
FROM review_items r
LEFT JOIN notes n ON n.id = r.note_id
LEFT JOIN tasks t ON t.id = r.task_id
LEFT JOIN projects p ON p.id = t.project_id
`

export function listReviews(): ReviewItem[] {
  return all<ReviewRow>(`${REVIEW_SELECT} ORDER BY r.due_at ASC`).map(mapReview)
}

/** 到期复习条目（due_at <= 指定日期当天 23:59:59） */
export function listDueReviews(dateKey: string, limit?: number): ReviewItem[] {
  const sql = `${REVIEW_SELECT} WHERE r.status = 'active' AND r.due_at <= ? ORDER BY r.due_at ASC`
  const rows = limit && limit > 0
    ? all<ReviewRow>(`${sql} LIMIT ?`, endOfDay(dateKey), limit)
    : all<ReviewRow>(sql, endOfDay(dateKey))
  return rows.map(mapReview)
}

/** 未来到期条目（用于次日排程预览） */
export function listUpcomingReviews(fromKey: string, toKey: string): ReviewItem[] {
  return all<ReviewRow>(
    `${REVIEW_SELECT} WHERE r.status = 'active' AND r.due_at >= ? AND r.due_at <= ? ORDER BY r.due_at ASC`,
    `${fromKey}T00:00:00`,
    endOfDay(toKey)
  ).map(mapReview)
}

export function getReview(id: number): ReviewItem | undefined {
  const row = all<ReviewRow>(`${REVIEW_SELECT} WHERE r.id = ?`, id)[0]
  return row ? mapReview(row) : undefined
}

export function getReviewByNote(noteId: number): ReviewItem | undefined {
  const row = all<ReviewRow>(`${REVIEW_SELECT} WHERE r.note_id = ?`, noteId)[0]
  return row ? mapReview(row) : undefined
}

export interface CreateReviewParams {
  noteId: number
  taskId: number | null
  title: string
  dueAt: string
  intervalDays?: number
  stage?: number
}

export function createReview(params: CreateReviewParams): number {
  const id = insert(
    `INSERT INTO review_items (note_id, task_id, title, ease, interval_days, repetitions, lapses, due_at, stage, status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', ?)`,
    params.noteId,
    params.taskId ?? null,
    params.title,
    SM2_DEFAULT_EASE,
    params.intervalDays ?? 0,
    params.dueAt,
    params.stage ?? 0,
    nowIso()
  )
  syncSearch(id)
  return id
}

export interface ReviewUpdatePatch {
  ease?: number
  intervalDays?: number
  repetitions?: number
  lapses?: number
  dueAt?: string
  lastReviewedAt?: string | null
  stage?: number
  lastRating?: number | null
  status?: ReviewStatus
  title?: string
}

export function updateReview(id: number, patch: ReviewUpdatePatch): ReviewItem {
  const map: Record<string, string> = {
    ease: 'ease',
    intervalDays: 'interval_days',
    repetitions: 'repetitions',
    lapses: 'lapses',
    dueAt: 'due_at',
    lastReviewedAt: 'last_reviewed_at',
    stage: 'stage',
    lastRating: 'last_rating',
    status: 'status',
    title: 'title'
  }
  const fields: string[] = []
  const params: SqlParam[] = []
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key]
    if (value !== undefined) {
      fields.push(`${column} = ?`)
      params.push(value as SqlParam)
    }
  }
  if (fields.length > 0) {
    run(`UPDATE review_items SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
    syncSearch(id)
  }
  return getReview(id) as ReviewItem
}

export function removeReview(id: number): void {
  run('DELETE FROM review_items WHERE id = ?', id)
  removeEntity('review', id)
}

export function listReviewsByTask(taskId: number): ReviewItem[] {
  return all<ReviewRow>(`${REVIEW_SELECT} WHERE r.task_id = ? ORDER BY r.due_at ASC`, taskId).map(mapReview)
}

export function dueCount(dateKey: string): number {
  const row = all<{ c: number }>(
    "SELECT COUNT(*) AS c FROM review_items WHERE status = 'active' AND due_at <= ?",
    endOfDay(dateKey)
  )[0]
  return row ? Number(row.c) : 0
}

export function syncSearch(id: number): void {
  const review = getReview(id)
  if (!review) return
  indexEntity({
    kind: 'review',
    refId: id,
    title: review.title,
    body: `${review.noteTitle ?? ''} 第 ${review.stage + 1} 阶段 间隔 ${review.intervalDays} 天`,
    meta: `复习计划 · 下次 ${review.dueAt.slice(0, 10)}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM review_items')
  for (const row of rows) syncSearch(Number(row.id))
}
