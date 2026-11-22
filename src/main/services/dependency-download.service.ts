import { app, net, shell } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile, rename, rm } from 'node:fs/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import JSZip from 'jszip'
import { DEPENDENCY_META } from '@shared/constants'
import type { DependencyId } from '@shared/types/domain'
import type { DependencyDownloadStatus } from '@shared/types/ipc'
import { emitToRenderer, notifyDataChanged } from './bus'
import {
  findPlaywrightChromium,
  invalidateDependencyCache,
  playwrightBrowsersPath
} from '../utils/dependency-check'
import { managedBinDir } from '../utils/binaries'
import { logger } from '../utils/logger'
import {
  parseChecksum,
  pickLatestStableVersion,
  pickLibreOfficeInstaller,
  pickPandocWindowsZip,
  safeArchiveMember
} from './dependency-download.helpers'
import { downloadHttpToFile } from './dependency-download.io'
import { IPC_EVENTS } from '@shared/types/ipc'

const requireFromMain = createRequire(__filename)
const DEPENDENCY_IDS: DependencyId[] = ['pandoc', 'ffmpeg', 'yt-dlp', 'playwright', 'soffice', 'pdf2docx']
const FFMPEG_ZIP = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
const FFMPEG_SHA = `${FFMPEG_ZIP}.sha256`
const YT_DLP_EXE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const YT_DLP_SHA = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS'
const PANDOC_API = 'https://api.github.com/repos/jgm/pandoc/releases/latest'
const LO_STABLE = 'https://download.documentfoundation.org/libreoffice/stable/'

interface ActiveTask {
  id: DependencyId
  controller: AbortController
  child: ChildProcessWithoutNullStreams | null
}

const statuses = new Map<DependencyId, DependencyDownloadStatus>()
let active: ActiveTask | null = null

function initialStatus(id: DependencyId): DependencyDownloadStatus {
  return {
    id,
    phase: 'idle',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: '',
    resultPath: null
  }
}

function publish(id: DependencyId, patch: Partial<DependencyDownloadStatus>): DependencyDownloadStatus {
  const next = { ...(statuses.get(id) ?? initialStatus(id)), ...patch, id }
  statuses.set(id, next)
  emitToRenderer(IPC_EVENTS.dependencyDownload, next)
  return next
}

function ensureDownloadDirs(): { staging: string; downloads: string } {
  const root = app.getPath('userData')
  const staging = join(root, 'workspace-tmp', 'dependency-download')
  const downloads = join(root, 'downloads')
  mkdirSync(staging, { recursive: true })
  mkdirSync(downloads, { recursive: true })
  return { staging, downloads }
}

async function fetchText(url: string, accept = 'text/plain'): Promise<string> {
  const response = await net.fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: accept,
      'User-Agent': 'MOL-WORK-Dependency-Downloader'
    }
  })
  if (!response.ok) throw new Error(`读取下载信息失败：HTTP ${response.status}`)
  return response.text()
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex').toLowerCase()
}

async function verifyChecksum(path: string, expected: string | null): Promise<void> {
  if (!expected) return
  const actual = await sha256(path)
  if (actual !== expected.toLowerCase()) {
    throw new Error(`文件校验失败，期望 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`)
  }
}

async function download(
  id: DependencyId,
  url: string,
  target: string,
  controller: AbortController,
  phase: 'downloading' | 'installing' = 'downloading'
): Promise<string> {
  publish(id, {
    phase,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: `正在下载 ${DEPENDENCY_META[id].label}…`,
    resultPath: null
  })
  const result = await downloadHttpToFile({
    url,
    target,
    signal: controller.signal,
    fetchImpl: net.fetch as typeof fetch,
    onProgress: (progress) => {
      publish(id, {
        phase,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
        message: `正在下载 ${DEPENDENCY_META[id].label}…`
      })
    }
  })
  return result.path
}

async function extractZipMembers(zipPath: string, fileNames: string[]): Promise<void> {
  const archive = await JSZip.loadAsync(await readFile(zipPath))
  const paths = Object.keys(archive.files)
  for (const fileName of fileNames) {
    const member = safeArchiveMember(paths, fileName)
    if (!member) throw new Error(`压缩包中缺少 ${fileName}`)
    const zipEntry = archive.file(member)
    if (!zipEntry) throw new Error(`无法读取压缩包中的 ${fileName}`)
    const target = join(managedBinDir(), fileName)
    writeFileSync(target, await zipEntry.async('nodebuffer'))
  }
}

async function installFfmpeg(task: ActiveTask): Promise<string> {
  const { staging } = ensureDownloadDirs()
  const archivePath = join(staging, 'ffmpeg-release-essentials.zip')
  await download(task.id, FFMPEG_ZIP, archivePath, task.controller)
  publish(task.id, { phase: 'verifying', percent: 100, message: '正在校验 FFmpeg…' })
  const checksum = parseChecksum(await fetchText(FFMPEG_SHA), basename(archivePath))
  await verifyChecksum(archivePath, checksum)
  publish(task.id, { phase: 'installing', percent: 100, message: '正在解压 FFmpeg…' })
  await extractZipMembers(archivePath, ['ffmpeg.exe', 'ffprobe.exe'])
  await rm(archivePath, { force: true })
  return join(managedBinDir(), 'ffmpeg.exe')
}

async function installYtDlp(task: ActiveTask): Promise<string> {
  const { staging } = ensureDownloadDirs()
  const partialTarget = join(staging, 'yt-dlp.exe')
  await download(task.id, YT_DLP_EXE, partialTarget, task.controller)
  publish(task.id, { phase: 'verifying', percent: 100, message: '正在校验 yt-dlp…' })
  const checksum = parseChecksum(await fetchText(YT_DLP_SHA), 'yt-dlp.exe')
  await verifyChecksum(partialTarget, checksum)
  const target = join(managedBinDir(), 'yt-dlp.exe')
  await rm(target, { force: true })
  await rename(partialTarget, target)
  return target
}

async function installPandoc(task: ActiveTask): Promise<string> {
  const releaseText = await fetchText(PANDOC_API, 'application/vnd.github+json')
  const release = JSON.parse(releaseText) as {
    assets?: { name: string; browser_download_url: string; digest?: string }[]
  }
  const asset = pickPandocWindowsZip(release.assets ?? [])
  if (!asset) throw new Error('Pandoc 最新版没有找到 Windows x86_64 压缩包')

  const { staging } = ensureDownloadDirs()
  const archivePath = join(staging, asset.name)
  await download(task.id, asset.browser_download_url, archivePath, task.controller)
  publish(task.id, { phase: 'verifying', percent: 100, message: '正在校验 Pandoc…' })
  await verifyChecksum(archivePath, asset.digest?.match(/^sha256:(.+)$/i)?.[1] ?? null)
  publish(task.id, { phase: 'installing', percent: 100, message: '正在解压 Pandoc…' })
  await extractZipMembers(archivePath, ['pandoc.exe'])
  await rm(archivePath, { force: true })
  return join(managedBinDir(), 'pandoc.exe')
}

function playwrightCliPath(): string {
  const packageJson = requireFromMain.resolve('playwright/package.json')
  const cli = join(dirname(packageJson), 'cli.js')
  const unpacked = cli.replace(`${join('app.asar', '')}`, `${join('app.asar.unpacked', '')}`)
  return existsSync(unpacked) ? unpacked : cli
}

async function installPlaywright(task: ActiveTask): Promise<string> {
  const cli = playwrightCliPath()
  if (!existsSync(cli)) throw new Error('Playwright CLI 未随应用正确打包')

  publish(task.id, {
    phase: 'installing',
    percent: 0,
    message: '正在下载 Playwright Chromium…'
  })

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath()
      }
    })
    task.child = child
    let output = ''
    const consume = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      output = `${output}${text}`.slice(-8000)
      const matches = [...text.matchAll(/(\d{1,3})%/g)]
      const percent = matches.length > 0 ? Math.min(99, Number(matches.at(-1)?.[1] ?? 0)) : 5
      publish(task.id, {
        phase: 'installing',
        percent,
        message: '正在下载 Playwright Chromium…'
      })
    }
    child.stdout.on('data', consume)
    child.stderr.on('data', consume)
    child.once('error', reject)
    child.once('exit', (code) => {
      task.child = null
      if (task.controller.signal.aborted) {
        reject(new Error('下载已取消'))
      } else if (code === 0) {
        resolve()
      } else {
        const tail = output.trim().split(/\r?\n/).slice(-4).join('\n')
        reject(new Error(`Playwright Chromium 安装失败（退出码 ${code}）${tail ? `\n${tail}` : ''}`))
      }
    })
  })

  const executable = findPlaywrightChromium()
  if (!executable) throw new Error('Playwright 安装结束，但没有找到 Chromium 可执行文件')
  return executable
}

async function resolveLibreOfficeInstaller(): Promise<string> {
  const stable = await fetchText(LO_STABLE)
  const version = pickLatestStableVersion(stable)
  if (!version) throw new Error('无法确定 LibreOffice 最新稳定版本')
  const directory = `${LO_STABLE}${version}/win/x86_64/`
  const listing = await fetchText(directory)
  const installer = pickLibreOfficeInstaller(listing)
  if (!installer) throw new Error(`LibreOffice ${version} 没有找到 Windows 安装包`)
  return new URL(installer, directory).href
}

async function downloadLibreOffice(task: ActiveTask): Promise<string> {
  const url = await resolveLibreOfficeInstaller()
  const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'LibreOffice_Setup.msi')
  const { downloads } = ensureDownloadDirs()
  const target = join(downloads, fileName)
  await download(task.id, url, target, task.controller)
  publish(task.id, { phase: 'verifying', percent: 100, message: '正在校验 LibreOffice 安装包…' })
  const checksum = parseChecksum(await fetchText(`${url}.sha256`), fileName)
  await verifyChecksum(target, checksum)
  return target
}

function failStatus(id: DependencyId, error: unknown, cancelled = false): DependencyDownloadStatus {
  return publish(id, {
    phase: cancelled ? 'cancelled' : 'error',
    percent: 0,
    message: cancelled ? '下载已取消' : error instanceof Error ? error.message : String(error)
  })
}

export function dependencyDownloadStatuses(): DependencyDownloadStatus[] {
  return DEPENDENCY_IDS.map((id) => statuses.get(id) ?? initialStatus(id))
}

export async function downloadDependency(id: DependencyId): Promise<DependencyDownloadStatus> {
  const meta = DEPENDENCY_META[id]
  if (meta.installMode === 'guide') {
    if (meta.guideUrl) await shell.openExternal(meta.guideUrl)
    return publish(id, {
      phase: 'manual',
      percent: 100,
      message: '已打开安装说明，需要 Python 3.10 或更高版本'
    })
  }

  if (active) {
    if (active.id === id) return statuses.get(id) ?? initialStatus(id)
    throw new Error(`正在下载 ${DEPENDENCY_META[active.id].label}，请等待当前任务结束`)
  }

  const task: ActiveTask = { id, controller: new AbortController(), child: null }
  active = task
  publish(id, {
    phase: 'resolving',
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    message: `正在准备 ${meta.label}…`,
    resultPath: null
  })

  try {
    let resultPath = ''
    if (id === 'ffmpeg') resultPath = await installFfmpeg(task)
    else if (id === 'yt-dlp') resultPath = await installYtDlp(task)
    else if (id === 'pandoc') resultPath = await installPandoc(task)
    else if (id === 'playwright') resultPath = await installPlaywright(task)
    else if (id === 'soffice') resultPath = await downloadLibreOffice(task)

    invalidateDependencyCache()
    notifyDataChanged('tools')
    return publish(id, {
      phase: 'done',
      percent: 100,
      message:
        id === 'soffice'
          ? '安装包已下载，请运行安装程序后重新检测'
          : `${meta.label} 已准备完成`,
      resultPath
    })
  } catch (error) {
    logger.warn(`依赖下载失败：${id}`, error)
    return failStatus(id, error, task.controller.signal.aborted)
  } finally {
    active = null
  }
}

export function cancelDependencyDownload(id: DependencyId): void {
  if (!active || active.id !== id) return
  active.controller.abort()
  active.child?.kill()
  publish(id, { message: '正在取消下载…' })
}
