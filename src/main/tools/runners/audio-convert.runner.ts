import type { ToolDefinition } from '../types'
import { AUDIO_EXTS, VIDEO_EXTS, ensureTargetExt, prepareConversion, runConversion } from './convert-shared'

const TARGETS = [
  { label: 'MP3 音频 (.mp3)', value: 'mp3' },
  { label: 'WAV 音频 (.wav)', value: 'wav' },
  { label: 'M4A 音频 (.m4a)', value: 'm4a' },
  { label: 'FLAC 无损 (.flac)', value: 'flac' },
  { label: 'AAC 音频 (.aac)', value: 'aac' },
  { label: 'OGG 音频 (.ogg)', value: 'ogg' },
  { label: 'Opus 音频 (.opus)', value: 'opus' }
]

export const audioConvertTool: ToolDefinition = {
  manifest: {
    id: 'audio-convert',
    name: '音频转换',
    category: 'audio',
    description:
      '用 FFmpeg 转码音频，或从视频里提取音轨。',
    icon: 'AudioLines',
    requires: ['ffmpeg'],
    builtin: true,
    fields: [
      {
        name: 'sourcePath',
        label: '源音频 / 视频',
        type: 'path',
        pathKind: 'file',
        required: true,
        placeholder: 'D:\\音频\\录音.m4a',
        hint: '源可以是视频，会自动取音轨'
      },
      {
        name: 'targetFormat',
        label: '目标格式',
        type: 'select',
        required: true,
        defaultValue: 'mp3',
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
    const targetFormat = ctx.getString(payload, 'targetFormat', 'mp3')
    const prepared = prepareConversion(ctx, payload, targetFormat)
    if (!prepared.ok) return { ok: false, error: prepared.error }

    const { sourcePath, sourceExt, targetExt, outputPath } = prepared.paths
    const isAudio = AUDIO_EXTS.has(sourceExt)
    const isVideo = VIDEO_EXTS.has(sourceExt)
    if (!isAudio && !isVideo) {
      return { ok: false, error: `不是支持的音频/视频格式：${sourceExt || '(无扩展名)'}` }
    }
    const invalidTarget = ensureTargetExt(targetExt, AUDIO_EXTS, '音频', sourceExt)
    if (invalidTarget) return { ok: false, error: invalidTarget }

    return runConversion({
      engine: 'ffmpeg',
      // 视频源只保留音轨（-vn），音频源直接转码
      args: ['-y', '-i', sourcePath, ...(isVideo ? ['-vn'] : []), outputPath],
      sourcePath,
      outputPath,
      outputs: [
        { label: '源文件', value: sourcePath },
        { label: '输出音频', value: outputPath }
      ]
    })
  }
}
