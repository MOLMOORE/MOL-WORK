import { basename, extname, join } from 'node:path'
import { runToolBinary } from '../../utils/binaries'
import {
  ensureDir,
  fileExists,
  outputsDir,
  resolveUserPath,
  sanitizeFileName,
  uniquePath
} from '../../utils/paths'
import type { ToolDefinition } from '../types'

/** Pandoc 可读取的文档类源格式（PDF 只能作为输出，无法作为输入） */
const DOC_EXTS = new Set(['.md', '.markdown', '.docx', '.html', '.htm', '.txt', '.rst', '.epub', '.odt', '.tex', '.rtf', '.csv', '.org'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma'])
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.ts'])

const DOC_TARGETS = [
  { label: 'Markdown (.md)', value: 'md' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
  { label: '网页 (.html)', value: 'html' },
  { label: '纯文本 (.txt)', value: 'txt' },
  { label: 'EPUB 电子书 (.epub)', value: 'epub' },
  { label: 'OpenDocument (.odt)', value: 'odt' },
  { label: 'LaTeX (.tex)', value: 'tex' }
]

const MEDIA_TARGETS = [
  { label: 'MP3 音频 (.mp3)', value: 'mp3' },
  { label: 'WAV 音频 (.wav)', value: 'wav' },
  { label: 'M4A 音频 (.m4a)', value: 'm4a' },
  { label: 'MP4 视频 (.mp4)', value: 'mp4' },
  { label: 'GIF 动图 (.gif)', value: 'gif' },
  { label: 'WebM (.webm)', value: 'webm' }
]

function pickEngine(sourceExt: string, targetExt: string): 'pandoc' | 'ffmpeg' | null {
  const sourceIsDoc = DOC_EXTS.has(sourceExt)
  const sourceIsMedia = AUDIO_EXTS.has(sourceExt) || VIDEO_EXTS.has(sourceExt)
  const targetIsDoc = DOC_EXTS.has(targetExt)
  const targetIsMedia = AUDIO_EXTS.has(targetExt) || VIDEO_EXTS.has(targetExt)
  if (sourceIsDoc && targetIsDoc) return 'pandoc'
  if (sourceIsMedia && targetIsMedia) return 'ffmpeg'
  return null
}

export const convertTool: ToolDefinition = {
  manifest: {
    id: 'format-convert',
    name: '格式转换',
    category: 'convert',
    description:
      '文档类走 Pandoc、音视频类走 FFmpeg。自动根据源文件扩展名选择引擎，转换结果写入输出目录并记录耗时与存放位置。',
    icon: 'Repeat2',
    requires: ['pandoc', 'ffmpeg'],
    builtin: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源文件路径',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\学习资料\\计算机网络.docx',
        hint: '支持文档（md/docx/html/txt/epub/odt/tex）与音视频（mp3/wav/mp4/mkv/gif…）'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'md',
        options: [...DOC_TARGETS, ...MEDIA_TARGETS],
        hint: '文档转换需要 Pandoc，音视频转换需要 FFmpeg'
      },
      {
        name: 'outputDir',
        label: '输出目录',
        type: 'path',
        pathKind: 'directory',
        placeholder: '留空则输出到工作站 outputs 目录'
      }
    ]
  },

  async run(payload, ctx) {
    const sourcePath = resolveUserPath(ctx.getString(payload, 'sourcePath'))
    const targetFormat = ctx.getString(payload, 'targetFormat', 'md').replace(/^\./, '').toLowerCase()
    const outDir = payload.outputDir ? ensureDir(resolveUserPath(ctx.getString(payload, 'outputDir'))) : outputsDir()

    if (!fileExists(sourcePath)) {
      return { ok: false, error: `源文件不存在：${sourcePath}` }
    }

    const sourceExt = extname(sourcePath).toLowerCase()
    const targetExt = `.${targetFormat}`
    const engine = pickEngine(sourceExt, targetExt)
    if (!engine) {
      return {
        ok: false,
        error: `不支持的转换组合：${sourceExt || '(无扩展名)'} → ${targetExt}。文档与音视频不能跨类转换。`
      }
    }

    const base = sanitizeFileName(basename(sourcePath, sourceExt), 'converted')
    const outputPath = uniquePath(outDir, `${base}-${targetFormat}`, targetExt)

    const args =
      engine === 'pandoc'
        ? [sourcePath, '-o', outputPath, '--standalone']
        : ['-y', '-i', sourcePath, ...(AUDIO_EXTS.has(targetExt) && VIDEO_EXTS.has(sourceExt) ? ['-vn'] : []), outputPath]

    const result = await runToolBinary(engine, args, { timeoutMs: 20 * 60 * 1000 })

    if (!result.ok || !fileExists(outputPath)) {
      const reason = result.binaryPath === null ? `未检测到 ${engine}，请在工具集市顶部查看安装指引。` : `${engine} 执行失败（退出码 ${result.code}）。`
      return {
        ok: false,
        error: `${reason}\n${(result.stderr || result.error || '').split('\n').slice(-6).join('\n')}`
      }
    }

    return {
      ok: true,
      resultPath: outputPath,
      resultSummary: `${basename(sourcePath)} → ${basename(outputPath)}（${engine}）`,
      outputs: [
        { label: '转换引擎', value: `${engine} · ${result.binaryPath}` },
        { label: '源文件', value: sourcePath },
        { label: '输出文件', value: outputPath }
      ],
      preview: `已生成：${outputPath}`
    }
  }
}

export const CONVERT_OUTPUT_HINT = join('outputs', '')
