#!/usr/bin/env node
/**
 * 检测工具集所需的外部依赖是否可用。
 * 解析顺序与应用主进程保持一致：PATH → winget 软链 → pip 脚本目录 → Python 包自带二进制。
 * 用法：npm run check-tools
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const IS_WINDOWS = process.platform === 'win32'

const PROBES = [
  { id: 'pandoc', args: ['--version'], hint: 'winget install --id JohnMacFarlane.Pandoc' },
  { id: 'ffmpeg', args: ['-version'], hint: 'winget install --id Gyan.FFmpeg' },
  { id: 'yt-dlp', args: ['--version'], hint: 'winget install --id yt-dlp.yt-dlp' }
]

/** site-packages 内的已知相对路径，支持最后一段使用 * 通配 */
const PACKAGE_PATTERNS = {
  pandoc: ['pypandoc/files/pandoc.exe', 'pypandoc/files/pandoc'],
  ffmpeg: ['imageio_ffmpeg/binaries/ffmpeg-*.exe', 'imageio_ffmpeg/binaries/ffmpeg'],
  'yt-dlp': ['yt_dlp/yt-dlp.exe']
}

const appDataDir = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
const localAppDataDir = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')

function childDirectories(parent) {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function pipScriptDirs() {
  const base = join(appDataDir, 'Python')
  return childDirectories(base).map((version) => join(base, version, 'Scripts'))
}

function pythonInstallRoots() {
  const roots = []
  const localPrograms = join(localAppDataDir, 'Programs', 'Python')
  for (const version of childDirectories(localPrograms)) roots.push(join(localPrograms, version))
  const pythonCore = join(localAppDataDir, 'Python')
  for (const version of childDirectories(pythonCore)) {
    if (version.toLowerCase().startsWith('pythoncore')) roots.push(join(pythonCore, version))
  }
  return roots
}

function sitePackageDirs() {
  const dirs = []
  const base = join(appDataDir, 'Python')
  for (const version of childDirectories(base)) dirs.push(join(base, version, 'site-packages'))
  for (const root of pythonInstallRoots()) dirs.push(join(root, 'Lib', 'site-packages'))
  return dirs
}

function candidateDirs() {
  return [
    join(localAppDataDir, 'Microsoft', 'WinGet', 'Links'),
    ...pipScriptDirs(),
    ...pythonInstallRoots().map((root) => join(root, 'Scripts'))
  ]
}

function matchPattern(name, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

function findInSegment(dir, pattern) {
  const base = join(dir, dirname(pattern))
  if (!existsSync(base)) return null
  try {
    const hit = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isFile() && matchPattern(entry.name, basename(pattern)))
      .map((entry) => join(base, entry.name))
      .sort()
    return hit[0] ?? null
  } catch {
    return null
  }
}

async function which(name) {
  const finder = IS_WINDOWS ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(finder, [name], { timeout: 8000, windowsHide: true, encoding: 'utf8' })
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0]
    return first ?? null
  } catch {
    return null
  }
}

async function resolveBinary(id) {
  const onPath = await which(id)
  if (onPath) return onPath
  const names = IS_WINDOWS ? [`${id}.exe`, `${id}.cmd`, `${id}.bat`, id] : [id]
  for (const dir of candidateDirs()) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  for (const dir of sitePackageDirs()) {
    for (const pattern of PACKAGE_PATTERNS[id] ?? []) {
      const hit = findInSegment(dir, pattern)
      if (hit) return hit
    }
  }
  return null
}

function playwrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH
  return IS_WINDOWS ? join(localAppDataDir, 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright')
}

function findPlaywrightChromium() {
  const browsersPath = playwrightBrowsersPath()
  if (!existsSync(browsersPath)) return null
  for (const dir of childDirectories(browsersPath)) {
    if (!dir.startsWith('chromium-') && !dir.startsWith('chromium_headless_shell-')) continue
    for (const relative of [
      join('chrome-win64', 'chrome.exe'),
      join('chrome-win', 'chrome.exe'),
      join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
      join('chrome-win', 'headless_shell.exe')
    ]) {
      const target = join(browsersPath, dir, relative)
      if (existsSync(target)) return target
    }
  }
  return null
}

async function probe(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 10000, windowsHide: true, encoding: 'utf8' })
    const first = (stdout || stderr).split(/\r?\n/).find((line) => line.trim() !== '')
    return first ? first.trim() : 'unknown'
  } catch {
    return null
  }
}

const rows = []

for (const item of PROBES) {
  const binary = await resolveBinary(item.id)
  const version = binary ? await probe(binary, item.args) : null
  rows.push({ name: item.id, status: version ? '可用' : '未安装', detail: version ?? item.hint, path: binary })
}

const chromium = findPlaywrightChromium()
rows.push({
  name: 'playwright',
  status: chromium ? '可用' : '未安装',
  detail: chromium ?? 'npx playwright install chromium',
  path: chromium
})

const width = Math.max(...rows.map((row) => row.name.length))
console.log('\n外部依赖检测结果\n' + '-'.repeat(72))
for (const row of rows) {
  console.log(`${row.name.padEnd(width)}  ${row.status.padEnd(6)}  ${row.detail}`)
  if (row.path) console.log(`${' '.repeat(width)}            ${row.path}`)
}
console.log('-'.repeat(72))
const missing = rows.filter((row) => row.status === '未安装')
console.log(
  missing.length === 0
    ? '全部依赖可用，工具集可以完整运行。\n'
    : `有 ${missing.length} 项缺失。缺失项对应的工具会给出安装指引，不影响其它功能。\n`
)
