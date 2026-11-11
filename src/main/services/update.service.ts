import electronUpdater, {
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater'
import { app, shell } from 'electron'
import { IPC_EVENTS, type UpdateStatus } from '@shared/types/ipc'
import { logger } from '../utils/logger'
import { emitToRenderer } from './bus'
import { GitHubApiUpdateProvider } from './github-api-update.provider'

const { autoUpdater } = electronUpdater
const RELEASE_PAGE = 'https://github.com/MOLMOORE/MOL-WORK/releases/latest'
const AUTO_CHECK_DELAY_MS = 12_000

let initialized = false
let status: UpdateStatus = createInitialStatus()

function updateSupported(): boolean {
  const unpacked = /[\\/]win-unpacked[\\/]/i.test(process.execPath)
  return app.isPackaged && !unpacked && process.env.WORKSTATION_SELFTEST !== '1'
}

function createInitialStatus(): UpdateStatus {
  const supported = updateSupported()
  return {
    supported,
    phase: supported ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    latestVersion: null,
    releaseDate: null,
    releaseName: null,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: supported ? null : '开发、自检和绿色版解包模式不检查自动更新。'
  }
}

function publish(patch: Partial<UpdateStatus>): UpdateStatus {
  status = { ...status, ...patch }
  emitToRenderer(IPC_EVENTS.updateStatus, status)
  return status
}

function infoPatch(info: UpdateInfo): Partial<UpdateStatus> {
  return {
    latestVersion: info.version,
    releaseDate: info.releaseDate || null,
    releaseName: info.releaseName ?? null
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function initUpdateService(): void {
  if (initialized) return
  initialized = true
  status = createInitialStatus()

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.allowPrerelease = false
  autoUpdater.disableDifferentialDownload = true
  autoUpdater.setFeedURL({
    provider: 'custom',
    owner: 'MOLMOORE',
    repo: 'MOL-WORK',
    updateProvider: GitHubApiUpdateProvider
  } as unknown as Parameters<typeof autoUpdater.setFeedURL>[0])
  autoUpdater.logger = {
    info: (message?: unknown) => logger.info(`更新器：${String(message ?? '')}`),
    warn: (message?: unknown) => logger.warn(`更新器：${String(message ?? '')}`),
    error: (message?: unknown) => logger.error(`更新器：${String(message ?? '')}`),
    debug: (message: string) => logger.info(`更新器：${message}`)
  }

  autoUpdater.on('checking-for-update', () => {
    publish({ phase: 'checking', message: '正在检查 GitHub Releases…', percent: 0 })
  })
  autoUpdater.on('update-available', (info) => {
    publish({
      ...infoPatch(info),
      phase: 'available',
      message: `发现新版本 v${info.version}`,
      percent: 0
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    publish({
      ...infoPatch(info),
      phase: 'not-available',
      message: '当前已经是最新版本。'
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      phase: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
      message: `正在下载 v${status.latestVersion ?? ''}`
    })
  })
  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    publish({
      ...infoPatch(event),
      phase: 'downloaded',
      percent: 100,
      message: '更新已下载，可以重启安装。'
    })
  })
  autoUpdater.on('error', (error) => {
    logger.error('自动更新失败', error)
    publish({ phase: 'error', message: errorMessage(error) })
  })
}

export function startAutomaticUpdateCheck(): void {
  if (!updateSupported()) return
  setTimeout(() => {
    void checkForUpdates().catch((error) => logger.warn('启动自动检查更新失败', error))
  }, AUTO_CHECK_DELAY_MS)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!updateSupported()) return status
  if (status.phase === 'checking' || status.phase === 'downloading' || status.phase === 'downloaded') {
    return status
  }
  publish({ phase: 'checking', message: '正在检查 GitHub Releases…', percent: 0 })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    logger.error('检查更新失败', error)
    publish({ phase: 'error', message: errorMessage(error) })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!updateSupported()) return status
  if (status.phase !== 'available') throw new Error('当前没有可下载的新版本')
  publish({
    phase: 'downloading',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: `正在下载 v${status.latestVersion ?? ''}`
  })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    logger.error('下载更新失败', error)
    publish({ phase: 'error', message: errorMessage(error) })
  }
  return status
}

export function installDownloadedUpdate(prepareQuit: () => void): UpdateStatus {
  if (!updateSupported()) return status
  if (status.phase !== 'downloaded') throw new Error('更新尚未下载完成')
  prepareQuit()
  publish({ message: '正在退出并安装更新…' })
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return status
}

export async function openUpdatePage(): Promise<boolean> {
  await shell.openExternal(RELEASE_PAGE)
  return true
}
