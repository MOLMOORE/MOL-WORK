import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
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
  if (!value) return null
  return value.length === 16 ? `${value}:00` : value
}

export function initialOf(text: string): string {
  return (text ?? '?').trim().slice(0, 1).toUpperCase()
}
