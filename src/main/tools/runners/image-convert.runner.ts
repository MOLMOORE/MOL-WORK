import type { ToolDefinition } from '../types'
import { IMAGE_EXTS, ensureExt, ensureTargetExt, prepareConversion, runConversion } from './convert-shared'

const TARGETS = [
  { label: 'PNG 图片 (.png)', value: 'png' },
  { label: 'JPEG 图片 (.jpg)', value: 'jpg' },
  { label: 'WebP 图片 (.webp)', value: 'webp' },
  { label: 'BMP 位图 (.bmp)', value: 'bmp' },
  { label: 'GIF 图片 (.gif)', value: 'gif' },
  { label: 'TIFF 图片 (.tiff)', value: 'tiff' }
]

export const imageConvertTool: ToolDefinition = {
  manifest: {
    id: 'image-convert',
    name: '图片转换',
    category: 'image',
    description:
      '用 FFmpeg 互转 PNG / JPEG / WebP / BMP / GIF / TIFF，可顺带压缩体积。',
    icon: 'Image',
    requires: ['ffmpeg'],
    builtin: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源图片',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\图片\\封面.png',
        hint: '源可为 png / jpg / webp / bmp / gif / tiff / avif / heic'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'webp',
        options: TARGETS
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
    const targetFormat = ctx.getString(payload, 'targetFormat', 'webp')
    const prepared = prepareConversion(ctx, payload, targetFormat)
    if (!prepared.ok) return { ok: false, error: prepared.error }

    const { sourcePath, sourceExt, targetExt, outputPath } = prepared.paths
    const invalidSource = ensureExt(sourcePath, IMAGE_EXTS, '图片')
    if (invalidSource) return { ok: false, error: invalidSource }
    const invalidTarget = ensureTargetExt(targetExt, IMAGE_EXTS, '图片', sourceExt)
    if (invalidTarget) return { ok: false, error: invalidTarget }

    return runConversion({
      engine: 'ffmpeg',
      args: ['-y', '-i', sourcePath, outputPath],
      sourcePath,
      outputPath,
      outputs: [
        { label: '源图片', value: sourcePath },
        { label: '输出图片', value: outputPath }
      ]
    })
  }
}
