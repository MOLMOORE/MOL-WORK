import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../utils/logger'

/**
 * pdf.js 渲染中文 PDF 时要读字形映射表（cmaps）。渲染进程是 file:// 来源，
 * 拉不到 asar 里的文件，所以由主进程代读，渲染进程通过 IPC 取字节。
 */
export type PdfAssetKind = 'cmaps' | 'standard_fonts'

export function readPdfAsset(kind: PdfAssetKind, name: string): Uint8Array | null {
  // 只允许字母数字、连字符与点，杜绝路径穿越
  if (!/^[\w.-]+$/.test(name)) return null
  const base = join(app.getAppPath(), 'node_modules', 'pdfjs-dist', kind)
  const target = existsSync(join(base, `${name}.bcmap`)) ? join(base, `${name}.bcmap`) : join(base, name)
  try {
    if (!existsSync(target)) return null
    return new Uint8Array(readFileSync(target))
  } catch (error) {
    logger.warn(`读取 pdf.js 资源失败：${target}`, error)
    return null
  }
}