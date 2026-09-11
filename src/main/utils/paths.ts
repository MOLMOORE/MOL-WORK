import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'

export function outputsDir(): string {
  const dir = join(app.getPath('userData'), 'outputs')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function tempDir(): string {
  const dir = join(app.getPath('userData'), 'workspace-tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 展开 ~ 并归一化为绝对路径（相对路径按用户主目录解析） */
export function resolveUserPath(input: string): string {
  const trimmed = (input ?? '').trim()
  if (trimmed === '') return outputsDir()
  let target = trimmed
  if (target.startsWith('~')) {
    target = join(homedir(), target.slice(1))
  }
  const absolute = isAbsolute(target) ? target : resolve(homedir(), target)
  return normalize(absolute)
}

/** 防止路径穿越：确保 target 位于 base 之内 */
export function isInside(base: string, target: string): boolean {
  const rel = relative(resolve(base), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`))
}

export function sanitizeFileName(name: string, fallback = 'output'): string {
  const cleaned = (name ?? '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? fallback : cleaned.slice(0, 120)
}

export function withExtension(filePath: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  const current = extname(filePath)
  if (current.toLowerCase() === ext.toLowerCase()) return filePath
  return `${filePath.slice(0, filePath.length - current.length)}${ext}`
}

export function uniquePath(dir: string, baseName: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : extension === '' ? '' : `.${extension}`
  let candidate = join(dir, `${baseName}${ext}`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${baseName}-${index}${ext}`)
    index += 1
  }
  return candidate
}

export function fileExists(target: string): boolean {
  return existsSync(target)
}
