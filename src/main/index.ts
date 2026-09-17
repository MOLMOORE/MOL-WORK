import { app, BrowserWindow, Menu, nativeImage, Notification, shell, Tray, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { closeDatabase, initDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc'
import { bootstrap } from './services/bootstrap.service'
import { purgeExpiredService } from './services/task.service'
import { readSettings } from './services/settings.service'
import { catchUpOnStartup, startScheduler, stopScheduler } from './services/scheduler.service'
import { emitToRenderer } from './services/bus'
import { IPC_EVENTS } from '@shared/types/ipc'
import { APP_NAME } from '@shared/constants'
import { logger } from './utils/logger'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 用户在退出弹窗中选择「真正退出」后置为 true，绕过 close 拦截 */
let forceQuit = false

// 自检模式使用独立数据目录，避免污染真实用户数据
if (process.env.WORKSTATION_SELFTEST === '1') {
  app.setPath('userData', join(app.getPath('temp'), 'workstation-selftest'))
}

/**
 * 托盘图标：优先读取随包分发的 build/tray.png（与窗口图标同源、透明底），
 * 读取失败时回退到程序内生成的纯黑方块，保证托盘永远可用。
 */
function createTrayImage(): NativeImage {
  const inBuild = join(app.getAppPath(), 'build')
  const trayFile = existsSync(join(inBuild, 'tray.png')) ? join(inBuild, 'tray.png') : join(inBuild, 'icon.png')
  try {
    const image = nativeImage.createFromPath(trayFile)
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
    logger.warn('托盘图标解析为空，回退到内置方块：' + trayFile)
  } catch (error) {
    logger.warn('托盘图标读取失败，回退到内置方块', error)
  }
  const size = 16
  const buffer = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = 0x00
    buffer[i * 4 + 1] = 0x00
    buffer[i * 4 + 2] = 0x00
    buffer[i * 4 + 3] = 0xff
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size })
}

/** 托盘：后台运行时提供入口 */
function createTray(): void {
  if (tray) return
  try {
    tray = new Tray(createTrayImage())
  } catch (error) {
    logger.error('托盘创建失败（后台运行时请通过任务栏窗口回到应用）', error)
    return
  }
  tray.setToolTip(`${APP_NAME}（后台运行中）`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开主窗口',
        click: () => {
          if (!mainWindow) {
            createWindow()
            return
          }
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          forceQuit = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
  })
}

function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#141619',
    autoHideMenuBar: true,
    title: APP_NAME,
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

  // 拦截右上角关闭按钮：按用户设置进入后台 / 退出 / 弹窗询问
  interceptWindowClose(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 拦截窗口关闭：按用户设置进入后台、直接退出或交给渲染层弹窗询问 */
function interceptWindowClose(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (forceQuit) return
    let action: 'ask' | 'background' | 'exit' = 'ask'
    let debugMode = false
    try {
      const settings = readSettings()
      action = settings.closeAction
      debugMode = settings.debugMode === true
    } catch {
      /* 设置不可用时按默认询问 */
    }
    // 调试模式：关闭窗口时直接退出，不弹任何确认（避免调试期间无法关闭软件）
    if (debugMode) {
      logger.info('调试模式：跳过关闭确认，直接退出')
      return
    }
    if (action === 'exit') return
    event.preventDefault()
    if (action === 'background') {
      window.hide()
      logger.info('窗口已进入后台（按用户设置）')
      return
    }
    emitToRenderer(IPC_EVENTS.closeRequest, { at: new Date().toISOString() })
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
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
    startRecycleBinCleaner()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopScheduler()
    destroyTray()
    closeDatabase()
  })
}

/** 回收站过期清理：启动时执行一次，之后每 30 分钟检查一次 */
function startRecycleBinCleaner(): void {
  const clean = (): void => {
    try {
      const purged = purgeExpiredService(readSettings().recycleBinDays)
      if (purged > 0) logger.info(`回收站清理：彻底删除 ${purged} 个过期任务`)
    } catch (error) {
      logger.error('回收站清理失败', error)
    }
  }
  clean()
  setInterval(clean, 30 * 60 * 1000)
}

/** 供 IPC 调用：把窗口隐藏到后台（托盘保持运行） */
export function hideMainWindow(): void {
  if (mainWindow) {
    mainWindow.hide()
    logger.info('窗口已隐藏到后台')
  }
}

/** 供 IPC 调用：真正退出应用（绕过关闭拦截） */
export function quitApplication(): void {
  forceQuit = true
  app.quit()
}

/** 供 IPC 调用：发送系统通知，点击可聚焦主窗口 */
export function showSystemNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const notice = new Notification({ title, body })
  notice.on('click', () => {
    if (!mainWindow) {
      createWindow()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  })
  notice.show()
}
