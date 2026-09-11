import type { FocusSession, ReviewItem, ReviewRating, ScheduleEvent, ScheduleInput, Task } from '@shared/types/domain'
import { handle } from './handle'
import {
  createSchedule,
  eventsForDay,
  eventsInRange,
  pendingTasksForPlanning,
  planTask,
  removeSchedule,
  updateSchedule
} from '../services/schedule.service'
import { getActiveFocus, listFocusByTask, listFocusRange, logFocus, startFocus, stopFocus } from '../db/repositories/focus.repo'
import { deferTodayReviewsToTomorrow, enqueueDueReviews, gradeReview, planReview } from '../services/review.service'
import { listDueReviews, listReviews } from '../db/repositories/review.repo'
import { notifyDataChanged } from '../services/bus'
import { todayKey } from '../utils/time'

export function registerScheduleIpc(): void {
  handle<ScheduleEvent[]>('schedule:range', (from: string, to: string) => eventsInRange(from, to))

  handle<ScheduleEvent[]>('schedule:day', (dayKey: string) => eventsForDay(dayKey))

  handle<ScheduleEvent>('schedule:create', (input: ScheduleInput) => {
    const event = createSchedule(input)
    notifyDataChanged('schedule')
    return event
  })

  handle<ScheduleEvent>('schedule:update', (id: number, patch: Partial<ScheduleInput>) => {
    const event = updateSchedule(id, patch)
    notifyDataChanged('schedule')
    return event
  })

  handle<void>('schedule:remove', (id: number) => {
    removeSchedule(id)
    notifyDataChanged('schedule')
  })

  handle<ScheduleEvent>('schedule:plan-task', (taskId: number, startAt: string, minutes: number) => {
    const event = planTask(taskId, startAt, minutes)
    notifyDataChanged('schedule')
    return event
  })

  handle<number>('schedule:enqueue-reviews', (dayKey: string) => {
    const created = enqueueDueReviews(dayKey)
    notifyDataChanged('schedule')
    return created
  })

  handle<number>('schedule:defer-reviews', () => {
    const moved = deferTodayReviewsToTomorrow()
    notifyDataChanged('schedule')
    return moved
  })

  handle<Task[]>('schedule:pending-tasks', () => pendingTasksForPlanning())

  handle<ReviewItem[]>('review:due', (dayKey?: string) => listDueReviews(dayKey ?? todayKey()))

  handle<ReviewItem[]>('review:list', () => listReviews())

  handle<ReviewItem>('review:grade', (id: number, rating: ReviewRating) => {
    const item = gradeReview(id, rating)
    notifyDataChanged('review')
    return item
  })

  handle<ScheduleEvent>('review:plan', (id: number, dayKey: string) => {
    const event = planReview(id, dayKey)
    notifyDataChanged('schedule')
    return event
  })

  handle<FocusSession>('focus:start', (taskId: number | null, note?: string) => {
    const session = startFocus(taskId ?? null, note ?? '')
    notifyDataChanged('focus')
    return session
  })

  handle<FocusSession>('focus:stop', (id: number) => {
    const session = stopFocus(id)
    notifyDataChanged('focus')
    return session
  })

  handle<FocusSession | null>('focus:active', () => getActiveFocus())

  handle<FocusSession[]>('focus:list-by-task', (taskId: number) => listFocusByTask(taskId))

  handle<FocusSession[]>('focus:list-range', (from: string, to: string) => listFocusRange(from, to))

  handle<FocusSession>('focus:log', (taskId: number | null, minutes: number, note?: string) => {
    const session = logFocus(taskId ?? null, minutes, note ?? '')
    notifyDataChanged('focus')
    return session
  })
}
