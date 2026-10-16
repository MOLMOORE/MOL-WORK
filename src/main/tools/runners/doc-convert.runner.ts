import { copyFileSync, renameSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolDefinition, ToolExecutionResult } from '../types'
import { runToolBinary, type ToolCommandResult } from '../../utils/binaries'
import { ensureDir, fileExists, tempDir } from '../../utils/paths'
import { DOC_EXTS, ensureExt, ensureTargetExt, prepareConversion, runConversion } from './convert-shared'

const TARGETS = [
  { label: 'Markdown (.md)', value: 'md' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
  { label: 'PDF (.pdf)', value: 'pdf' },
  { label: '网页 (.html)', value: 'html' },
  { label: '纯文本 (.txt)', value: 'txt' },
  { label: 'EPUB 电子书 (.epub)', value: 'epub' },
  { label: 'OpenDocument (.odt)', value: 'odt' },
  { label: 'LaTeX (.tex)', value: 'tex' }
]

/** LibreOffice 能直接打开的文档格式（转 PDF 或 .doc 归一化时走它） */
const SOFFICE_OPENS = new Set(['.doc', '.docx', '.odt', '.rtf', '.txt', '.csv', '.html', '.htm'])

function scratchDir(): string {
  return ensureDir(join(tempDir(), 'doc-convert'))
}

/** 跨盘安全的移动：rename 失败（EXDEV）时复制后删除临时件 */
function moveInto(from: string, to: string): void {
  try {
    renameSync(from, to)
  } catch {
    copyFileSync(from, to)
    try {
      unlinkSync(from)
    } catch {
      /* 尽力清理 */
    }
  }
}

/**
 * LibreOffice 无头转换，产物落在暂存目录（调用方负责移到最终位置）。
 * 带独立 -env:UserInstallation 配置目录：否则 Windows 上已有 LO 实例在跑时
 * 命令会被转交给该实例并立即返回（unoconv / libreoffice-convert 的通用做法）。
 */
async function sofficeConvert(
  sourcePath: string,
  targetExt: string
): Promise<{ ok: true; file: string; binaryPath: string } | { ok: false; error: string }> {
  const scratch = scratchDir()
  const profile = ensureDir(join(scratch, 'lo-profile'))
  const produced = join(scratch, `${basename(sourcePath, extname(sourcePath))}${targetExt}`)
  const result = await runToolBinary(
    'soffice',
    [
      '--headless',
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--convert-to',
      targetExt.replace(/^\./, ''),
      '--outdir',
      scratch,
      sourcePath
    ],
    { timeoutMs: 5 * 60 * 1000 }
  )
  if (result.binaryPath === null) {
    return { ok: false, error: '未检测到 LibreOffice。安装：winget install --id TheDocumentFoundation.LibreOffice（或官网安装包，装在 Program Files 即可被自动找到）' }
  }
  if (!result.ok || !fileExists(produced)) {
    return {
      ok: false,
      error: `LibreOffice 转换失败（退出码 ${result.code}）。\n${(result.stderr || result.error || '').split('\n').slice(-6).join('\n')}`
    }
  }
  return { ok: true, file: produced, binaryPath: result.binaryPath }
}

function engineFailure(engine: string, result: ToolCommandResult): ToolExecutionResult {
  const reason =
    result.binaryPath === null
      ? `未检测到 ${engine}，请在设置页查看安装指引。`
      : `${engine} 执行失败（退出码 ${result.code}）。`
  return {
    ok: false,
    error: `${reason}\n${(result.stderr || result.error || '').split('\n').slice(-6).join('\n')}`
  }
}

function okResult(engineLabel: string, binaryPath: string, sourcePath: string, outputPath: string): ToolExecutionResult {
  return {
    ok: true,
    resultPath: outputPath,
    resultSummary: `${basename(sourcePath)} → ${basename(outputPath)}（${engineLabel}）`,
    outputs: [
      { label: '转换引擎', value: `${engineLabel} · ${binaryPath}` },
      { label: '源文档', value: sourcePath },
      { label: '输出文档', value: outputPath }
    ],
    preview: `已生成：${outputPath}`
  }
}

export const docConvertTool: ToolDefinition = {
  manifest: {
    id: 'doc-convert',
    name: '文档转换',
    category: 'doc',
    description:
      '在 Word / PDF / Markdown / HTML / EPUB 等格式间互转。',
    icon: 'FileText',
    requires: ['pandoc', 'soffice', 'pdf2docx'],
    builtin: true,
    supportsBatch: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源文档',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\学习资料\\计算机网络.docx',
        hint: '源可为 doc / docx / pdf / md / html / txt / rst / epub / odt / tex / rtf / csv / org'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'md',
        options: TARGETS,
        hint: 'PDF 由 LibreOffice 排版生成；PDF 源转 Word 由 pdf2docx 完成'
      },
      {
        name: 'outputDir',
        label: '输出目录',
        type: 'path',
        pathKind: 'directory',
        placeholder: '留空 = outputs 目录'
      }
    ]
  },

  async run(payload, ctx) {
    const targetFormat = ctx.getString(payload, 'targetFormat', 'md')
    const prepared = prepareConversion(ctx, payload, targetFormat)
    if (!prepared.ok) return { ok: false, error: prepared.error }

    const { sourcePath, sourceExt, targetExt, outputPath } = prepared.paths
    const invalidSource = ensureExt(sourcePath, DOC_EXTS, '文档')
    if (invalidSource) return { ok: false, error: invalidSource }
    const invalidTarget = ensureTargetExt(targetExt, DOC_EXTS, '文档', sourceExt)
    if (invalidTarget) return { ok: false, error: invalidTarget }

    // ① PDF 源：pdf2docx 重建版面（表格 / 图片保留），只支持转 Word
    if (sourceExt === '.pdf') {
      if (targetExt !== '.docx') {
        return { ok: false, error: 'PDF 源目前只支持转为 Word (.docx)，转好后可再由 Word 转其他格式。' }
      }
      return runConversion({
        engine: 'pdf2docx',
        // 0.5.13 起 CLI 为子命令式：pdf2docx convert <in> <out>
        args: ['convert', sourcePath, outputPath],
        sourcePath,
        outputPath,
        outputs: [
          { label: '源文档', value: sourcePath },
          { label: '输出文档', value: outputPath }
        ]
      })
    }

    // ② PDF 目标：pandoc 不产 PDF，统一交给 LibreOffice 排版
    if (targetExt === '.pdf') {
      if (SOFFICE_OPENS.has(sourceExt)) {
        const step = await sofficeConvert(sourcePath, '.pdf')
        if (!step.ok) return { ok: false, error: step.error }
        moveInto(step.file, outputPath)
        return okResult('LibreOffice', step.binaryPath, sourcePath, outputPath)
      }
      // md / tex / epub 等：pandoc 先出中间 docx，再由 LibreOffice 排成 PDF
      const mid = join(scratchDir(), `${basename(outputPath, '.pdf')}-mid.docx`)
      const first = await runToolBinary('pandoc', [sourcePath, '-o', mid, '--standalone'], { timeoutMs: 20 * 60 * 1000 })
      if (!first.ok || !fileExists(mid)) return engineFailure('pandoc', first)
      const second = await sofficeConvert(mid, '.pdf')
      if (!second.ok) return { ok: false, error: `（pandoc → docx 已完成）${second.error}` }
      moveInto(second.file, outputPath)
      return okResult('pandoc → LibreOffice', second.binaryPath, sourcePath, outputPath)
    }

    // ③ 老 .doc 源：pandoc 读不了，先由 LibreOffice 归一化成 docx 再接管
    if (sourceExt === '.doc') {
      if (targetExt === '.docx') {
        const step = await sofficeConvert(sourcePath, '.docx')
        if (!step.ok) return { ok: false, error: step.error }
        moveInto(step.file, outputPath)
        return okResult('LibreOffice', step.binaryPath, sourcePath, outputPath)
      }
      const mid = join(scratchDir(), `${basename(outputPath, targetExt)}-mid.docx`)
      const first = await sofficeConvert(sourcePath, '.docx')
      if (!first.ok) return { ok: false, error: first.error }
      moveInto(first.file, mid)
      const second = await runToolBinary('pandoc', [mid, '-o', outputPath, '--standalone'], { timeoutMs: 20 * 60 * 1000 })
      if (!second.ok || !fileExists(outputPath)) return engineFailure('pandoc', second)
      return okResult('LibreOffice → pandoc', second.binaryPath ?? '', sourcePath, outputPath)
    }

    // ④ 其余格式对：pandoc 原路径不变
    return runConversion({
      engine: 'pandoc',
      args: [sourcePath, '-o', outputPath, '--standalone'],
      sourcePath,
      outputPath,
      outputs: [
        { label: '源文档', value: sourcePath },
        { label: '输出文档', value: outputPath }
      ]
    })
  }
}