import type { ToolDefinition } from '../types'
import { DOC_EXTS, ensureExt, ensureTargetExt, prepareConversion, runConversion } from './convert-shared'

const TARGETS = [
  { label: 'Markdown (.md)', value: 'md' },
  { label: 'Word 文档 (.docx)', value: 'docx' },
  { label: '网页 (.html)', value: 'html' },
  { label: '纯文本 (.txt)', value: 'txt' },
  { label: 'EPUB 电子书 (.epub)', value: 'epub' },
  { label: 'OpenDocument (.odt)', value: 'odt' },
  { label: 'LaTeX (.tex)', value: 'tex' }
]

export const docConvertTool: ToolDefinition = {
  manifest: {
    id: 'doc-convert',
    name: '文档转换',
    category: 'doc',
    description:
      '基于 Pandoc 在 Markdown / Word / HTML / 纯文本 / EPUB / OpenDocument / LaTeX 之间互转，适合笔记与论文材料归档。',
    icon: 'FileText',
    requires: ['pandoc'],
    builtin: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源文档',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\学习资料\\计算机网络.docx',
        hint: '支持 md / markdown / docx / html / txt / rst / epub / odt / tex / rtf / csv / org'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'md',
        options: TARGETS
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
    const targetFormat = ctx.getString(payload, 'targetFormat', 'md')
    const prepared = prepareConversion(ctx, payload, targetFormat)
    if (!prepared.ok) return { ok: false, error: prepared.error }

    const { sourcePath, sourceExt, targetExt, outputPath } = prepared.paths
    const invalidSource = ensureExt(sourcePath, DOC_EXTS, '文档')
    if (invalidSource) return { ok: false, error: invalidSource }
    const invalidTarget = ensureTargetExt(targetExt, DOC_EXTS, '文档', sourceExt)
    if (invalidTarget) return { ok: false, error: invalidTarget }

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
