import { Notification } from 'electron'
import { EVENT_TYPE_META } from '@shared/constants'
import { IPC_EVENTS, type ReminderPayload } from '@shared/types/ipc'
import { markReminded, listDueReminders } from '../db/repositories/schedule.repo'
import { addDaysKey, dayKey, nowIso, todayKey } from '../utils/time'
import { logger } from '../utils/logger'
import { emitToRenderer, notifyDataChanged } from './bus'
import { enqueueDueReviews } from './review.service'
import { readSettings } from './settings.service'

const TICK_MS = 30 * 1000
let timer: NodeJS.Timeout | null = null
let lastAutoScheduleDay = ''

export function startScheduler(): void {
  if (timer) return
  tick()
  timer = setInterval(tick, TICK_MS)
  logger.info(`调度器已启动，轮询间隔 ${TICK_MS / 1000}s`)
}

export function stopScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  logger.info('调度器已停止')
}

function tick(): void {
  try {
    dispatchReminders()
    autoScheduleNextDayReviews()
  } catch (error) {
    logger.error('调度器执行异常', error)
  }
}

/** 到点触发系统通知，并推送到渲染层用于顶栏铃铛提醒 */
function dispatchReminders(): void {
  const due = listDueReminders(nowIso(), 30)
  if (due.length === 0) return

  for (const event of due) {
    const typeLabel = EVENT_TYPE_META[event.type]?.label ?? '提醒'
    const payload: ReminderPayload = {
      eventId: event.id,
      title: `${typeLabel}提醒 · ${event.title}`,
      body: `${event.startAt.replace('T', ' ').slice(0, 16)} 开始${event.note ? ` · ${event.note}` : ''}`,
      type: event.type,
      startAt: event.startAt
    }

    if (Notification.isSupported()) {
      new Notification({ title: payload.title, body: payload.body }).show()
    }
    markReminded(event.id)
    emitToRenderer(IPC_EVENTS.reminder, payload)
    logger.info(`已发送提醒：${event.title}`)
  }
  notifyDataChanged('schedule')
}

/** 每天到达设定时刻后，把到期复习内容自动排入次日日程 */
function autoScheduleNextDayReviews(): void {
  const settings = readSettings()
  if (!settings.autoScheduleNextDay) return
  const today = todayKey()
  if (lastAutoScheduleDay === today) return
  if (new Date().getHours() < settings.autoScheduleHour) return

  lastAutoScheduleDay = today
  const tomorrow = addDaysKey(today, 1)
  const created = enqueueDueReviews(tomorrow)
  if (created > 0) {
    logger.info(`已自动把 ${created} 条待复习内容排入 ${tomorrow} 日程`)
    emitToRenderer(IPC_EVENTS.reviewAutoScheduled, { date: tomorrow, count: created })
    notifyDataChanged('schedule')
  }
}

/** 应用启动时补算错过提醒并清理异常退出残留的专注记录 */
export function catchUpOnStartup(): { missedReminders: number } {
  const now = nowIso()
  const missed = listDueReminders(now, 100)
  logger.info(`启动补算：${missed.length} 条到期提醒`)
  return { missedReminders: missed.length }
}

export function schedulerStatus(): { running: boolean; lastAutoScheduleDay: string; today: string } {
  return { running: timer !== null, lastAutoScheduleDay, today: dayKey(new Date()) }
}
