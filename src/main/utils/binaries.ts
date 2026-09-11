import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import { runCommand, whichCommand, type CommandOptions, type CommandResult } from './command'
import { logger } from './logger'

/** 工具集实际调用的外部可执行文件 */
export type ToolBinaryId = 'pandoc' | 'ffmpeg' | 'ffprobe' | 'yt-dlp'

export type BinarySource = 'managed' | 'path' | 'pip' | 'winget'

export interface ResolvedBinary {
  id: ToolBinaryId
  path: string
  source: BinarySource
}

/**
 * site-packages 内的已知相对路径（支持最后一段使用 * 通配）。
 * 用于识别通过 pip 安装的、自带二进制的包（pypandoc_binary / imageio-ffmpeg）。
 */
const PACKAGE_PATTERNS: Record<ToolBinaryId, string[]> = {
  pandoc: ['pypandoc/files/pandoc.exe', 'pypandoc/files/pandoc'],
  ffmpeg: ['imageio_ffmpeg/binaries/ffmpeg-*.exe', 'imageio_ffmpeg/binaries/ffmpeg'],
  ffprobe: ['imageio_ffmpeg/binaries/ffprobe-*.exe', 'imageio_ffmpeg/binaries/ffprobe'],
  'yt-dlp': ['yt_dlp/yt-dlp.exe']
}

const CACHE_TTL_MS = 60 * 1000
const cache = new Map<ToolBinaryId, { resolved: ResolvedBinary | null; at: number }>()

const IS_WINDOWS = process.platform === 'win32'

/** 工作站托管的二进制目录：<userData>/bin，优先于系统 PATH */
export function managedBinDir(): string {
  const dir = join(app.getPath('userData'), 'bin')
  mkdirSync(dir, { recursive: true })
  return dir
}

function appDataDir(): string {
  return process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
}

function localAppDataDir(): string {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
}

/** pip --user 的脚本目录：%APPDATA%\Python\Python3XX\Scripts */
function pipScriptDirs(): string[] {
  const base = join(appDataDir(), 'Python')
  return childDirectories(base).map((version) => join(base, version, 'Scripts'))
}

/** pip --user 的 site-packages 目录 */
function pipSitePackageDirs(): string[] {
  const base = join(appDataDir(), 'Python')
  return childDirectories(base).map((version) => join(base, version, 'site-packages'))
}

/** 常规 Python 安装（含 Scripts 与 Lib\site-packages） */
function pythonInstallRoots(): string[] {
  const roots: string[] = []
  const localPrograms = join(localAppDataDir(), 'Programs', 'Python')
  for (const version of childDirectories(localPrograms)) roots.push(join(localPrograms, version))
  const pythonCore = join(localAppDataDir(), 'Python')
  for (const version of childDirectories(pythonCore)) {
    if (version.toLowerCase().startsWith('pythoncore')) roots.push(join(pythonCore, version))
  }
  return roots
}

/** winget 安装的可执行文件软链目录 */
function wingetLinkDirs(): string[] {
  return [join(localAppDataDir(), 'Microsoft', 'WinGet', 'Links')]
}

function childDirectories(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function candidateDirs(): { dir: string; source: BinarySource }[] {
  const list: { dir: string; source: BinarySource }[] = [{ dir: managedBinDir(), source: 'managed' }]
  for (const dir of wingetLinkDirs()) list.push({ dir, source: 'winget' })
  for (const dir of pipScriptDirs()) list.push({ dir, source: 'pip' })
  for (const root of pythonInstallRoots()) {
    list.push({ dir: join(root, 'Scripts'), source: 'pip' })
  }
  return list
}

function sitePackageDirs(): string[] {
  const dirs = pipSitePackageDirs()
  for (const root of pythonInstallRoots()) dirs.push(join(root, 'Lib', 'site-packages'))
  return dirs
}

function matchPattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

function findInFirstSegment(dir: string, pattern: string): string | null {
  const base = join(dir, dirname(pattern))
  const filePattern = basename(pattern)
  if (!existsSync(base)) return null
  try {
    const hit = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isFile() && matchPattern(entry.name, filePattern))
      .map((entry) => join(base, entry.name))
      .sort()
    return hit[0] ?? null
  } catch {
    return null
  }
}

function executableNames(id: ToolBinaryId): string[] {
  return IS_WINDOWS ? [`${id}.exe`, `${id}.cmd`, `${id}.bat`, id] : [id]
}

function probeCandidateDirs(id: ToolBinaryId): ResolvedBinary | null {
  for (const { dir, source } of candidateDirs()) {
    for (const name of executableNames(id)) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return { id, path: candidate, source }
    }
  }
  return null
}

function probePythonPackages(id: ToolBinaryId): ResolvedBinary | null {
  for (const dir of sitePackageDirs()) {
    for (const pattern of PACKAGE_PATTERNS[id]) {
      const hit = findInFirstSegment(dir, pattern)
      if (hit) return { id, path: hit, source: 'pip' }
    }
  }
  return null
}

/**
 * 解析外部可执行文件的真实路径。
 * 顺序：托管 bin 目录 → 系统 PATH → winget 软链 → pip 脚本目录 → Python 包自带二进制。
 */
export async function resolveBinary(id: ToolBinaryId, force = false): Promise<ResolvedBinary | null> {
  const cached = cache.get(id)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.resolved

  let resolved: ResolvedBinary | null = null

  const managed = join(managedBinDir(), executableNames(id)[0])
  if (existsSync(managed)) {
    resolved = { id, path: managed, source: 'managed' }
  }

  if (!resolved) {
    const onPath = await whichCommand(id)
    if (onPath) resolved = { id, path: onPath, source: 'path' }
  }

  if (!resolved) resolved = probeCandidateDirs(id)
  if (!resolved) resolved = probePythonPackages(id)

  if (resolved) logger.info(`外部依赖已解析：${id} -> ${resolved.path} (${resolved.source})`)
  cache.set(id, { resolved, at: Date.now() })
  return resolved
}

/** 一次性解析多个二进制，供依赖检测与运行器复用 */
export async function resolveBinaries(ids: ToolBinaryId[]): Promise<Map<ToolBinaryId, ResolvedBinary | null>> {
  const entries = await Promise.all(ids.map(async (id) => [id, await resolveBinary(id)] as const))
  return new Map(entries)
}

export interface ToolCommandResult extends CommandResult {
  /** 解析到的可执行文件路径，解析失败时为 null */
  binaryPath: string | null
}

/** 解析后执行：避免因 PATH 缺失导致工具不可用 */
export async function runToolBinary(
  id: ToolBinaryId,
  args: string[],
  options: CommandOptions = {}
): Promise<ToolCommandResult> {
  const binary = await resolveBinary(id)
  if (!binary) {
    return {
      ok: false,
      code: 127,
      stdout: '',
      stderr: '',
      binaryPath: null,
      error: `未找到可执行文件 ${id}，请在设置页查看安装指引`
    }
  }
  const result = await runCommand(binary.path, args, options)
  return { ...result, binaryPath: binary.path }
}

export function invalidateBinaryCache(): void {
  cache.clear()
}

/** 诊断用：当前参与检索的目录列表 */
export function binarySearchDirs(): string[] {
  return [
    ...candidateDirs().map((item) => item.dir),
    ...sitePackageDirs()
  ]
}
