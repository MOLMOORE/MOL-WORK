import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, initDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc'
import { bootstrap } from './services/bootstrap.service'
import { catchUpOnStartup, startScheduler, stopScheduler } from './services/scheduler.service'
import { logger } from './utils/logger'

let mainWindow: BrowserWindow | null = null

// 自检模式使用独立数据目录，避免污染真实用户数据
if (process.env.WORKSTATION_SELFTEST === '1') {
  app.setPath('userData', join(app.getPath('temp'), 'workstation-selftest'))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#0B0F1A',
    autoHideMenuBar: true,
    title: '个人工作站',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    logger.info('主窗口已显示')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 可观测性：把渲染层的错误与加载失败回写到主进程日志，便于离线排查
  mainWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      logger.warn(`渲染层 ${event.level}：${event.message} @ ${event.sourceId}:${event.lineNumber}`)
    }
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    logger.error(`页面加载失败：${code} ${description}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('渲染进程异常退出', details)
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    logger.info('应用启动')
    initDatabase()
    if (process.env.WORKSTATION_SELFTEST === '1') {
      const { runSelfTest } = await import('./selftest')
      await runSelfTest()
      app.exit(0)
      return
    }
    registerIpcHandlers()
    bootstrap()
    const catchUp = catchUpOnStartup()
    logger.info(`启动补算完成：${catchUp.missedReminders} 条待提醒`)
    createWindow()
    startScheduler()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopScheduler()
    closeDatabase()
  })
}
