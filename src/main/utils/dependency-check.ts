import { DEPENDENCY_META } from '@shared/constants'
import type { DependencyId, DependencyStatus } from '@shared/types/domain'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from './logger'
import { runCommand } from './command'
import { invalidateBinaryCache, resolveBinary, type ToolBinaryId } from './binaries'

interface CacheEntry {
  status: DependencyStatus
  at: number
}

const CACHE_TTL_MS = 60 * 1000
const cache = new Map<DependencyId, CacheEntry>()

const PROBE_ARGS: Record<ToolBinaryId, string[]> = {
  pandoc: ['--version'],
  ffmpeg: ['-version'],
  ffprobe: ['-version'],
  'yt-dlp': ['--version']
}

export function playwrightBrowsersPath(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH
  return process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Local', 'ms-playwright')
    : join(homedir(), '.cache', 'ms-playwright')
}

async function probeBinary(id: Exclude<DependencyId, 'playwright'>): Promise<DependencyStatus> {
  const meta = DEPENDENCY_META[id]
  const binary = await resolveBinary(id as ToolBinaryId)
  if (!binary) {
    return { id, label: meta.label, available: false, version: null, installHint: meta.installHint, resolvedPath: null }
  }
  const probe = await runCommand(binary.path, PROBE_ARGS[id as ToolBinaryId], { timeoutMs: 10000 })
  const firstLine = (probe.stdout || probe.stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '')
  return {
    id,
    label: meta.label,
    available: probe.ok,
    version: firstLine ? firstLine.slice(0, 80) : null,
    installHint: meta.installHint,
    resolvedPath: binary.path
  }
}

/** 定位 Playwright 安装的 Chromium 可执行文件 */
export function findPlaywrightChromium(): string | null {
  const browsersPath = playwrightBrowsersPath()
  if (!existsSync(browsersPath)) return null

  const candidates: string[] = []
  for (const dir of safeReadDir(browsersPath)) {
    if (dir.startsWith('chromium-') || dir.startsWith('chromium_headless_shell-')) {
      candidates.push(join(browsersPath, dir))
    }
  }
  for (const root of candidates) {
    for (const relative of [
      join('chrome-win64', 'chrome.exe'),
      join('chrome-win', 'chrome.exe'),
      join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
      join('chrome-win', 'headless_shell.exe')
    ]) {
      const target = join(root, relative)
      if (existsSync(target)) return target
    }
  }
  return null
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

async function probePlaywright(): Promise<DependencyStatus> {
  const meta = DEPENDENCY_META.playwright
  const executable = findPlaywrightChromium()
  if (!executable) {
    return {
      id: 'playwright',
      label: meta.label,
      available: false,
      version: null,
      installHint: meta.installHint,
      resolvedPath: null
    }
  }
  try {
    const { chromium } = (await import('playwright')) as typeof import('playwright')
    return {
      id: 'playwright',
      label: meta.label,
      available: true,
      version: `Chromium ${chromium.name()}`,
      installHint: meta.installHint,
      resolvedPath: executable
    }
  } catch (error) {
    logger.warn('Playwright 探测失败，回退为文件检测结果', error)
    return {
      id: 'playwright',
      label: meta.label,
      available: true,
      version: 'Chromium 已就绪',
      installHint: meta.installHint,
      resolvedPath: executable
    }
  }
}

export async function checkDependencies(force = false): Promise<DependencyStatus[]> {
  const ids: DependencyId[] = ['pandoc', 'ffmpeg', 'yt-dlp', 'playwright']
  const results: DependencyStatus[] = []
  for (const id of ids) {
    const cached = cache.get(id)
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      results.push(cached.status)
      continue
    }
    const status = id === 'playwright' ? await probePlaywright() : await probeBinary(id)
    cache.set(id, { status, at: Date.now() })
    results.push(status)
  }
  return results
}

export function invalidateDependencyCache(): void {
  cache.clear()
  invalidateBinaryCache()
}
