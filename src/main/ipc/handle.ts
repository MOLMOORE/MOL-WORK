import { ipcMain } from 'electron'
import { logger } from '../utils/logger'

export interface IpcEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * 统一的 IPC handler 包装：把异常转成结构化信封返回，
 * 渲染层据此抛出可读错误，主进程不会因为单次调用失败而崩溃。
 */
export function handle<T>(channel: string, fn: (...args: never[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcEnvelope<T>> => {
    try {
      const data = await fn(...(args as never[]))
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`IPC 调用失败：${channel}`, error)
      return { ok: false, error: message }
    }
  })
}
