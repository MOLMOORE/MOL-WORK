import { basename, extname } from 'node:path'
import { runToolBinary } from '../../utils/binaries'
import { ensureDir, fileExists, outputsDir, resolveUserPath, sanitizeFileName, uniquePath } from '../../utils/paths'
import type { ToolContext, ToolExecutionResult } from '../types'

export const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.gif',
  '.tiff',
  '.tif',
  '.avif',
  '.heic',
  '.ico'
])

export const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma', '.aiff'])

export const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.ts', '.m4v'])

export const DOC_EXTS = new Set([
  '.md',
  '.markdown',
  '.docx',
  '.html',
  '.htm',
  '.txt',
  '.rst',
  '.epub',
  '.odt',
  '.tex',
  '.rtf',
  '.csv',
  '.org'
])

export interface ConversionPaths {
  sourcePath: string
  sourceExt: string
  targetExt: string
  outputPath: string
}

/** 解析源文件路径并校验存在性，同时计算输出路径 */
export function prepareConversion(
  ctx: ToolContext,
  payload: Record<string, unknown>,
  targetFormat: string
): { ok: true; paths: ConversionPaths; outDir: string } | { ok: false; error: string } {
  const sourcePath = resolveUserPath(ctx.getString(payload, 'sourcePath'))
  if (!fileExists(sourcePath)) {
    return { ok: false, error: `源文件不存在：${sourcePath}` }
  }
  const outDir = payload.outputDir ? ensureDir(resolveUserPath(ctx.getString(payload, 'outputDir'))) : outputsDir()
  const sourceExt = extname(sourcePath).toLowerCase()
  const format = targetFormat.replace(/^\./, '').toLowerCase()
  const targetExt = `.${format}`
  const base = sanitizeFileName(basename(sourcePath, sourceExt), 'converted')
  const outputPath = uniquePath(outDir, `${base}-${format}`, targetExt)
  return { ok: true, paths: { sourcePath, sourceExt, targetExt, outputPath }, outDir }
}

export function ensureExt(path: string, allowed: Set<string>, label: string): string | null {
  const ext = extname(path).toLowerCase()
  if (allowed.has(ext)) return null
  return `不是支持的${label}格式：${ext || '(无扩展名)'}`
}

export function ensureTargetExt(targetExt: string, allowed: Set<string>, label: string, sourceExt: string): string | null {
  if (allowed.has(targetExt)) return null
  return `不支持转换为该${label}格式：${sourceExt || '(无扩展名)'} → ${targetExt}`
}

export interface ExternalRun {
  engine: 'ffmpeg' | 'pandoc'
  args: string[]
  sourcePath: string
  outputPath: string
  outputs: { label: string; value: string }[]
}

/** 执行外部引擎并统一收敛成功/失败结果 */
export async function runConversion({
  engine,
  args,
  sourcePath,
  outputPath,
  outputs
}: ExternalRun): Promise<ToolExecutionResult> {
  const result = await runToolBinary(engine, args, { timeoutMs: 20 * 60 * 1000 })

  if (!result.ok || !fileExists(outputPath)) {
    const reason =
      result.binaryPath === null
        ? `未检测到 ${engine}，请在工具页顶部查看安装指引。`
        : `${engine} 执行失败（退出码 ${result.code}）。`
    return {
      ok: false,
      error: `${reason}\n${(result.stderr || result.error || '').split('\n').slice(-6).join('\n')}`
    }
  }

  return {
    ok: true,
    resultPath: outputPath,
    resultSummary: `${basename(sourcePath)} → ${basename(outputPath)}（${engine}）`,
    outputs: [{ label: '转换引擎', value: `${engine} · ${result.binaryPath}` }, ...outputs],
    preview: `已生成：${outputPath}`
  }
}
