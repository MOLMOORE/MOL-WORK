import {
  EBBINGHAUS_INTERVALS,
  SM2_DEFAULT_EASE,
  SM2_MAX_EASE,
  SM2_MAX_INTERVAL_DAYS,
  SM2_MIN_EASE
} from '@shared/constants'
import type { Note, ReviewItem, ReviewRating, ScheduleEvent } from '@shared/types/domain'
import {
  createReview,
  getReview,
  getReviewByNote,
  listDueReviews,
  listReviews,
  removeReview,
  updateReview
} from '../db/repositories/review.repo'
import { createEvent, listEventsForDay, removeEventsByReview, updateEvent } from '../db/repositories/schedule.repo'
import { addDays, addMinutes, dayKey, endOfDay, nowIso, parseIso, todayKey, toLocalIso } from '../utils/time'
import { readSettings } from './settings.service'

/** SM-2 质量分映射：重来/困难/一般/简单 -> 2/3/4/5 */
const QUALITY: Record<ReviewRating, number> = { 0: 2, 1: 3, 2: 4, 3: 5 }

export interface ScheduleOutcome {
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
  stage: number
  dueAt: string
  status: ReviewItem['status']
}

/**
 * SM-2 简化实现：
 * - 评分低于 3（困难/重来）重置重复次数并回退到 1 天
 * - 通过则按 1、6、interval*ease 递增
 * - ease 按 SM-2 公式更新并夹在 [1.3, 3.2]
 */
export function computeSm2(item: ReviewItem, rating: ReviewRating, now = new Date()): ScheduleOutcome {
  const quality = QUALITY[rating]
  let ease = item.ease || SM2_DEFAULT_EASE
  let { repetitions, intervalDays, lapses, stage } = item

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  ease = Math.min(SM2_MAX_EASE, Math.max(SM2_MIN_EASE, Number(ease.toFixed(2))))

  if (quality < 3) {
    repetitions = 0
    intervalDays = rating === 0 ? 0 : 1
    lapses += 1
    stage = 0
  } else {
    if (repetitions === 0) intervalDays = 1
    else if (repetitions === 1) intervalDays = 6
    else intervalDays = Math.round(Math.max(1, item.intervalDays) * ease)
    if (rating === 3) intervalDays = Math.round(intervalDays * 1.3)
    intervalDays = Math.min(SM2_MAX_INTERVAL_DAYS, intervalDays)
    repetitions += 1
    stage = Math.min(EBBINGHAUS_INTERVALS.length - 1, repetitions)
  }

  return {
    ease,
    intervalDays,
    repetitions,
    lapses,
    stage,
    dueAt: resolveDueAt(intervalDays, rating, now),
    status: intervalDays >= 180 && quality >= 4 ? 'mastered' : 'active'
  }
}

/** 艾宾浩斯固定间隔模式 */
export function computeEbbinghaus(item: ReviewItem, rating: ReviewRating, now = new Date()): ScheduleOutcome {
  let stage = item.stage
  const lapses = rating < 2 ? item.lapses + 1 : item.lapses
  stage = rating < 2 ? 0 : Math.min(EBBINGHAUS_INTERVALS.length - 1, stage + 1)
  const intervalDays = rating < 2 ? 1 : EBBINGHAUS_INTERVALS[stage]
  return {
    ease: item.ease || SM2_DEFAULT_EASE,
    intervalDays,
    repetitions: rating < 2 ? 0 : item.repetitions + 1,
    lapses,
    stage,
    dueAt: resolveDueAt(intervalDays, rating, now),
    status: stage >= EBBINGHAUS_INTERVALS.length - 1 ? 'mastered' : 'active'
  }
}

/** 间隔为 0 表示当天重来，安排在 30 分钟后；否则落到当天的工作开始时刻 */
function resolveDueAt(intervalDays: number, rating: ReviewRating, now: Date): string {
  if (intervalDays <= 0) return addMinutes(toLocalIso(now), rating === 0 ? 10 : 30)
  const settings = readSettings()
  const target = parseIso(addDays(now, intervalDays))
  target.setHours(settings.workStartHour, 0, 0, 0)
  return toLocalIso(target)
}

export function ensureReviewForNote(note: Note): ReviewItem | undefined {
  if (note.kind === 'material') return getReviewByNote(note.id)
  const existing = getReviewByNote(note.id)
  if (existing) {
    if (existing.title !== note.title) updateReview(existing.id, { title: note.title })
    return getReview(existing.id) ?? existing
  }
  const dueAt = `${todayKey()}T${String(readSettings().workStartHour).padStart(2, '0')}:00:00`
  const id = createReview({
    noteId: note.id,
    taskId: note.taskId,
    title: note.title,
    dueAt,
    intervalDays: 0,
    stage: 0
  })
  return getReview(id)
}

export function gradeReview(id: number, rating: ReviewRating): ReviewItem {
  const item = getReview(id)
  if (!item) throw new Error(`复习条目不存在：${id}`)
  const settings = readSettings()
  const outcome =
    settings.reviewAlgorithm === 'ebbinghaus'
      ? computeEbbinghaus(item, rating)
      : computeSm2(item, rating)

  const updated = updateReview(id, {
    ease: outcome.ease,
    intervalDays: outcome.intervalDays,
    repetitions: outcome.repetitions,
    lapses: outcome.lapses,
    stage: outcome.stage,
    dueAt: outcome.dueAt,
    lastReviewedAt: nowIso(),
    lastRating: rating,
    status: outcome.status
  })

  removeEventsByReview(id)
  if (updated.status === 'active') {
    scheduleReviewEvent(updated)
  }
  return updated
}

export function rolebackReview(id: number): ReviewItem {
  return updateReview(id, { status: 'active', dueAt: nowIso(), stage: 0, repetitions: 0, intervalDays: 0 })
}

export function scheduleReviewEvent(item: ReviewItem, forceDayKey?: string): ScheduleEvent {
  const settings = readSettings()
  const base = forceDayKey ? parseIso(`${forceDayKey}T00:00:00`) : parseIso(item.dueAt)
  const start = parseIso(item.dueAt)
  const hour = forceDayKey ? settings.autoScheduleHour : start.getHours()
  const startAt = forceDayKey
    ? toLocalIso(new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, 0, 0))
    : item.dueAt
  const minutes = Math.max(10, Math.min(30, Math.round((item.intervalDays || 1) * 2) + 10))
  return createEvent({
    taskId: item.taskId,
    reviewItemId: item.id,
    title: `复习：${item.title}`,
    type: 'review',
    startAt,
    endAt: addMinutes(startAt, minutes),
    reminderAt: addMinutes(startAt, -settings.notifyLeadMinutes),
    note: `第 ${item.stage + 1} 阶段 · 间隔 ${item.intervalDays} 天`
  })
}

/** 将指定日期内到期的复习内容排入日程（已排期的会跳过） */
export function enqueueDueReviews(dayKeyValue: string): number {
  const settings = readSettings()
  const due = listDueReviews(dayKeyValue, settings.dailyReviewLimit)
  if (due.length === 0) return 0
  const existing = listEventsForDay(dayKeyValue).filter((e) => e.reviewItemId !== null)
  const scheduledIds = new Set(existing.map((e) => e.reviewItemId as number))

  let created = 0
  let cursorHour = settings.autoScheduleHour
  for (const item of due) {
    if (scheduledIds.has(item.id)) continue
    const dayStart = parseIso(`${dayKeyValue}T00:00:00`)
    const hour = Math.min(settings.workEndHour, cursorHour)
    const startAt = toLocalIso(
      new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hour, 0, 0)
    )
    createEvent({
      taskId: item.taskId,
      reviewItemId: item.id,
      title: `复习：${item.title}`,
      type: 'review',
      startAt,
      endAt: addMinutes(startAt, 25),
      reminderAt: addMinutes(startAt, -settings.notifyLeadMinutes),
      note: `遗忘曲线第 ${item.stage + 1} 阶段`
    })
    created += 1
    cursorHour = Math.min(settings.workEndHour, cursorHour + 1)
  }
  return created
}

/** 把当天到期未完成的复习内容整体顺延到次日 */
export function deferTodayReviewsToTomorrow(): number {
  const today = todayKey()
  const tomorrow = dayKey(addDays(new Date(), 1))
  const events = listEventsForDay(today).filter((e) => e.type === 'review' && e.startAt <= nowIso())
  const lead = readSettings().notifyLeadMinutes
  for (const event of events) {
    const moved = parseIso(`${tomorrow}T${String(readSettings().autoScheduleHour).padStart(2, '0')}:00:00`)
    const startAt = toLocalIso(moved)
    updateEvent(event.id, {
      startAt,
      endAt: addMinutes(startAt, 25),
      reminderAt: addMinutes(startAt, -lead)
    })
  }
  return events.length
}

export function planReview(id: number, dateKey: string): ScheduleEvent {
  const item = getReview(id)
  if (!item) throw new Error(`复习条目不存在：${id}`)
  removeEventsByReview(id)
  return scheduleReviewEvent(item, dateKey)
}

export function reviewOverview(): {
  items: ReviewItem[]
  dueToday: number
  overdue: number
  mastered: number
  averageEase: number
} {
  const items = listReviews()
  const today = todayKey()
  const now = nowIso()
  const dueToday = items.filter((r) => r.status === 'active' && dayKey(r.dueAt) <= today && r.dueAt <= endOfDay(today)).length
  const overdue = items.filter((r) => r.status === 'active' && r.dueAt < now).length
  const mastered = items.filter((r) => r.status === 'mastered').length
  const active = items.filter((r) => r.status === 'active')
  const averageEase = active.length === 0 ? 0 : Number((active.reduce((s, r) => s + r.ease, 0) / active.length).toFixed(2))
  return { items, dueToday, overdue, mastered, averageEase }
}

export function dropReviewForNote(noteId: number): void {
  const existing = getReviewByNote(noteId)
  if (!existing) return
  removeEventsByReview(existing.id)
  removeReview(existing.id)
}
