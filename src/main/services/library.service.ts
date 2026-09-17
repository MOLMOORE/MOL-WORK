import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { logger } from '../utils/logger'

/**
 * 书库：<userData>/library/<noteId>/document.pdf|document.html
 * 导入的资料要能「像一本书一样」完整翻阅，就不能只留一条文件路径——
 * 原文件被移动或删除时书就废了，所以渲染件统一收进书库自己保管。
 */
export function libraryRoot(): string {
  const dir = join(app.getPath('userData'), 'library')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function noteLibraryDir(noteId: number): string {
  const dir = join(libraryRoot(), String(noteId))
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 写入渲染件，返回绝对路径 */
export function saveNoteDocument(noteId: number, kind: 'pdf' | 'html', data: Buffer): string {
  const target = join(noteLibraryDir(noteId), `document.${kind}`)
  writeFileSync(target, data)
  return target
}

/** 读取渲染件；只允许书库内的路径，避免被当成任意文件读取的入口 */
export function readNoteDocument(docPath: string): Buffer | null {
  try {
    const root = resolve(libraryRoot())
    const target = resolve(docPath)
    if (!target.startsWith(root)) {
      logger.warn(`书库外的路径被拒绝读取：${target}`)
      return null
    }
    if (!existsSync(target)) return null
    return readFileSync(target)
  } catch (error) {
    logger.warn('读取书库文件失败', error)
    return null
  }
}

/** 删除笔记时清掉它的书库目录 */
export function removeNoteLibrary(noteId: number): void {
  try {
    rmSync(join(libraryRoot(), String(noteId)), { recursive: true, force: true })
  } catch (error) {
    logger.warn(`清理书库目录失败：${noteId}`, error)
  }
}