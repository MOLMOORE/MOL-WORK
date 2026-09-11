import { logger } from '../utils/logger'
import { registerAppIpc } from './app.ipc'
import { registerTaskIpc } from './task.ipc'
import { registerNoteIpc } from './note.ipc'
import { registerScheduleIpc } from './schedule.ipc'
import { registerToolIpc } from './tool.ipc'
import { registerStatsIpc } from './stats.ipc'
import { registerSearchIpc } from './search.ipc'

export function registerIpcHandlers(): void {
  registerAppIpc()
  registerTaskIpc()
  registerNoteIpc()
  registerScheduleIpc()
  registerToolIpc()
  registerStatsIpc()
  registerSearchIpc()
  logger.info('IPC 处理器注册完成')
}
