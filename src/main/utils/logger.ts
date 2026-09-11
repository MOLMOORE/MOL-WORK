import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

type Level = 'info' | 'warn' | 'error'

let logFile = ''

function resolveLogFile(): string {
  if (logFile) return logFile
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  logFile = join(dir, `workstation-${new Date().toISOString().slice(0, 10)}.log`)
  return logFile
}

function serialize(detail: unknown): string {
  if (detail === undefined) return ''
  if (detail instanceof Error) return ` | ${detail.name}: ${detail.message}`
  if (typeof detail === 'string') return ` | ${detail}`
  try {
    const text = JSON.stringify(detail)
    return ` | ${text && text.length > 2000 ? `${text.slice(0, 2000)}...` : text}`
  } catch {
    return ' | [unserializable]'
  }
}

function write(level: Level, message: string, detail?: unknown): void {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${serialize(detail)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  try {
    appendFileSync(resolveLogFile(), `${line}\n`, 'utf8')
  } catch {
    // 日志写盘失败不应影响主流程
  }
}

export const logger = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
  file: () => resolveLogFile()
}
