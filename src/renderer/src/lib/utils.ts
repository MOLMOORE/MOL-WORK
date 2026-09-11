import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Task } from '@shared/types/domain'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 排序层级：优先事项(0) > 逾期事项(1) > 普通事项(2)，跨层拖拽显示时会被自动归位 */
export function taskTier(task: Task): number {
  if (task.isPriority) return 0
  if (task.isOverdue) return 1
  return 2
}

export interface OrderConflict {
  /** 建议修改为的截止时间 */
  newDueAt: string
  /** 冲突参照任务标题 */
  refTitle: string
}

/**
 * 检测拖拽后的顺序是否破坏"同层级内截止时间升序"。
 * 把截止时间早的任务拖到截止时间晚的位置（或反之）会返回冲突信息；
 * 未设置截止时间的任务可自由拖拽，不参与检测。
 */
export function detectOrderConflict(ordered: Task[], dragId: number): OrderConflict | null {
  const index = ordered.findIndex((task) => task.id === dragId)
  if (index < 0) return null
  const dragged = ordered[index]
  if (!dragged.dueAt) return null

  for (let i = index - 1; i >= 0; i--) {
    const prev = ordered[i]
    if (taskTier(prev) !== taskTier(dragged)) continue
    if (!prev.dueAt) continue
    if (prev.dueAt > dragged.dueAt) return { newDueAt: prev.dueAt, refTitle: prev.title }
    break
  }
  for (let i = index + 1; i < ordered.length; i++) {
    const next = ordered[i]
    if (taskTier(next) !== taskTier(dragged)) continue
    if (!next.dueAt) continue
    if (next.dueAt < dragged.dueAt) return { newDueAt: next.dueAt, refTitle: next.title }
    break
  }
  return null
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function toLocalIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`
}

export function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/** 以日期字符串（yyyy-MM-dd）为基准增减天数 */
export function shiftDayKey(key: string, days: number): string {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

/** 周一为一周起点 */
export function startOfWeekKey(key: string): string {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return dateKey(date)
}

export const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日']

export function weekdayCN(key: string): string {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  return `星期${WEEKDAY_CN[(date.getDay() + 6) % 7]}`
}

export function formatDateCN(key: string): string {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export function toDate(key: string): Date {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** 生成 6×7 的月历矩阵（周一起始） */
export function buildMonthMatrix(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

/** 生成一周 7 天（周一起始） */
export function buildWeekDays(anchor: Date): Date[] {
  const offset = (anchor.getDay() + 6) % 7
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 分钟'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`
  return formatMinutes(ms / 60_000)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(11, 16)
}

export function relativeDay(value: string | null | undefined): string {
  if (!value) return '无截止'
  const target = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(target.getTime())) return formatDay(value)
  const today = new Date()
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diff = Math.round((a - b) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`
  if (diff <= 7) return `${diff} 天后`
  return formatDay(value)
}

export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false
  return value < todayKey() + 'T00:00:00'
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}

export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 16)
}

export function fromDatetimeLocal(value: string): string | null {
  if (!value || value.trim() === '') return null
  return value.length === 16 ? `${value}:00` : value
}

export function initialOf(text: string): string {
  return (text ?? '?').trim().slice(0, 1).toUpperCase()
}
