import type { ToolDefinition } from '../types'
import { VIDEO_EXTS, ensureTargetExt, prepareConversion, runConversion } from './convert-shared'

const TARGETS = [
  { label: 'MP4 视频 (.mp4)', value: 'mp4' },
  { label: 'MKV 视频 (.mkv)', value: 'mkv' },
  { label: 'WebM 视频 (.webm)', value: 'webm' },
  { label: 'MOV 视频 (.mov)', value: 'mov' },
  { label: 'AVI 视频 (.avi)', value: 'avi' },
  { label: 'GIF 动图 (.gif)', value: 'gif' }
]

export const videoConvertTool: ToolDefinition = {
  manifest: {
    id: 'video-convert',
    name: '视频转换',
    category: 'video',
    description:
      '基于 FFmpeg 在 MP4 / MKV / WebM / MOV / AVI 之间互转，也可导出 GIF 动图，适合统一素材格式或压缩体积。',
    icon: 'Video',
    requires: ['ffmpeg'],
    builtin: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源视频',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\视频\\录制.mp4',
        hint: '支持 mp4 / mkv / avi / mov / webm / flv / wmv / ts'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'mp4',
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
    const targetFormat = ctx.getString(payload, 'targetFormat', 'mp4')
    const prepared = prepareConversion(ctx, payload, targetFormat)
    if (!prepared.ok) return { ok: false, error: prepared.error }

    const { sourcePath, sourceExt, targetExt, outputPath } = prepared.paths
    if (!VIDEO_EXTS.has(sourceExt)) {
      return { ok: false, error: `不是支持的视频格式：${sourceExt || '(无扩展名)'}` }
    }
    const invalidTarget = ensureTargetExt(targetExt, VIDEO_EXTS, '视频', sourceExt)
    if (invalidTarget) return { ok: false, error: invalidTarget }

    return runConversion({
      engine: 'ffmpeg',
      args: ['-y', '-i', sourcePath, outputPath],
      sourcePath,
      outputPath,
      outputs: [
        { label: '源视频', value: sourcePath },
        { label: '输出视频', value: outputPath }
      ]
    })
  }
}
