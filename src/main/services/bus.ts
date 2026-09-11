import { BrowserWindow } from 'electron'
import { logger } from '../utils/logger'

/** 主进程 -> 渲染进程的单向广播，供提醒与数据变更通知使用 */
export function emitToRenderer(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    try {
      window.webContents.send(channel, payload)
    } catch (error) {
      logger.warn(`广播事件失败：${channel}`, error)
    }
  }
}

export function notifyDataChanged(scope: string): void {
  emitToRenderer('event:data-changed', scope)
}
