/** 统一时间处理：全库使用本地时区的 "yyyy-MM-ddTHH:mm:ss" 字符串，保证可字典序比较 */

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

export function nowIso(): string {
  return toLocalIso(new Date())
}

export function nowDate(): Date {
  return new Date()
}

export function parseIso(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? parseIso(value) : value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayKey(): string {
  return dayKey(new Date())
}

export function startOfDay(value: string | Date): string {
  const date = typeof value === 'string' ? parseIso(value) : value
  date.setHours(0, 0, 0, 0)
  return toLocalIso(date)
}

export function endOfDay(value: string | Date): string {
  const date = typeof value === 'string' ? parseIso(value) : value
  date.setHours(23, 59, 59, 999)
  return toLocalIso(date)
}

export function addDays(value: string | Date, days: number): string {
  const date = typeof value === 'string' ? parseIso(value) : new Date(value.getTime())
  date.setDate(date.getDate() + days)
  return toLocalIso(date)
}

export function addDaysKey(value: string | Date, days: number): string {
  const date = typeof value === 'string' ? parseIso(value) : new Date(value.getTime())
  date.setDate(date.getDate() + days)
  return dayKey(date)
}

export function addMinutes(value: string | Date, minutes: number): string {
  const date = typeof value === 'string' ? parseIso(value) : new Date(value.getTime())
  date.setMinutes(date.getMinutes() + minutes)
  return toLocalIso(date)
}

export function addMinutesToIso(iso: string, minutes: number): string {
  return addMinutes(iso, minutes)
}

export function diffDays(from: string | Date, to: string | Date = new Date()): number {
  const a = typeof from === 'string' ? parseIso(from) : from
  const b = typeof to === 'string' ? parseIso(to) : to
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((bDay - aDay) / 86400000)
}

export function diffMinutes(from: string | Date, to: string | Date = new Date()): number {
  const a = typeof from === 'string' ? parseIso(from) : from
  const b = typeof to === 'string' ? parseIso(to) : to
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
}

export function isSameDay(a: string, b: string): boolean {
  return dayKey(a) === dayKey(b)
}

export function rangeDays(fromKey: string, toKey: string): string[] {
  const result: string[] = []
  let cursor = fromKey
  let guard = 0
  while (cursor <= toKey && guard < 800) {
    result.push(cursor)
    cursor = addDaysKey(cursor, 1)
    guard += 1
  }
  return result
}

/** 以周一为一周起点，返回该日期所在周的周一（yyyy-MM-dd） */
export function startOfWeekKey(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return dayKey(date)
}

/** 返回该日期所在月的最后一个自然日（yyyy-MM-dd） */
export function endOfMonthKey(value: string): string {
  const [year, month] = value.slice(0, 10).split('-').map(Number)
  const date = new Date(year, month, 0)
  return dayKey(date)
}

/** 返回该日期所在月的第一天（yyyy-MM-dd） */
export function startOfMonthKey(value: string): string {
  return `${value.slice(0, 7)}-01`
}
