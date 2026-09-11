import type { ScheduleEvent, ScheduleInput, Task } from '@shared/types/domain'
import {
  createEvent,
  listEvents,
  listEventsForDay,
  listUpcomingEvents,
  removeEvent,
  updateEvent
} from '../db/repositories/schedule.repo'
import { listTasks } from '../db/repositories/task.repo'
import { all } from '../db/query'
import { addMinutes, endOfDay, nowIso, startOfDay } from '../utils/time'
import { readSettings } from './settings.service'

export function eventsInRange(fromKey: string, toKey: string): ScheduleEvent[] {
  return listEvents(startOfDay(fromKey), endOfDay(toKey))
}

export function upcomingEvents(limit = 8): ScheduleEvent[] {
  return listUpcomingEvents(nowIso(), limit)
}

export function planTask(taskId: number, startAt: string, minutes?: number): ScheduleEvent {
  const task = listTasks().find((t) => t.id === taskId)
  if (!task) throw new Error(`任务不存在：${taskId}`)
  const settings = readSettings()
  const duration = minutes && minutes > 0 ? minutes : task.estimateMinutes > 0 ? task.estimateMinutes : settings.defaultFocusMinutes
  const reminderLead = settings.notifyLeadMinutes
  return createEvent({
    taskId,
    title: task.title,
    type: 'task',
    startAt,
    endAt: addMinutes(startAt, duration),
    reminderAt: addMinutes(startAt, -reminderLead),
    note: task.projectName ?? ''
  })
}

export function createSchedule(input: ScheduleInput): ScheduleEvent {
  return createEvent(input)
}

export function updateSchedule(id: number, patch: Partial<ScheduleInput>): ScheduleEvent {
  return updateEvent(id, patch)
}

export function removeSchedule(id: number): void {
  removeEvent(id)
}

/** 尚未排入日程的待办任务 */
export function pendingTasksForPlanning(): Task[] {
  const tasks = listTasks({ status: 'all' }).filter((t) => t.status !== 'done')
  const scheduledIds = new Set(
    all<{ task_id: number | null }>(
      'SELECT task_id FROM schedule_events WHERE end_at >= ? AND task_id IS NOT NULL',
      nowIso()
    ).map((row) => Number(row.task_id))
  )
  return tasks.filter((t) => !scheduledIds.has(t.id))
}

export function eventsForDay(dayKeyValue: string): ScheduleEvent[] {
  return listEventsForDay(dayKeyValue)
}
