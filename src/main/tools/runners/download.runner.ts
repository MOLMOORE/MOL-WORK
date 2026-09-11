import { basename, dirname } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { resolveBinary, runToolBinary } from '../../utils/binaries'
import { ensureDir, outputsDir, resolveUserPath, fileExists } from '../../utils/paths'
import type { ToolDefinition } from '../types'

function newestFile(dir: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile())
  if (entries.length === 0) return null
  const sorted = entries
    .map((e) => ({ name: e.name, mtime: statSync(`${dir}/${e.name}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return `${dir}/${sorted[0].name}`
}

export const downloadTool: ToolDefinition = {
  manifest: {
    id: 'file-download',
    name: '文件下载与整理',
    category: 'download',
    description:
      '基于 yt-dlp 下载网络视频/音频/课程资源，自动按模板命名并归档到指定目录，支持仅音频抽取与播放列表开关。',
    icon: 'Download',
    requires: ['yt-dlp'],
    builtin: true,
    fields: [
      {
        name: 'url',
        label: '资源地址',
        type: 'text',
        required: true,
        placeholder: 'https://www.bilibili.com/video/BV1xx411c7mD',
        hint: '支持 YouTube / Bilibili / 慕课等 yt-dlp 覆盖的站点'
      },
      {
        name: 'mode',
        label: '下载模式',
        type: 'select',
        defaultValue: 'best',
        options: [
          { label: '最佳画质（视频+音频）', value: 'best' },
          { label: '仅音频（转 MP3）', value: 'audio' },
          { label: '最高 720P', value: '720' }
        ]
      },
      {
        name: 'outputDir',
        label: '归档目录',
        type: 'path',
        pathKind: 'directory',
        placeholder: '留空则归档到工作站 outputs 目录'
      },
      {
        name: 'allowPlaylist',
        label: '允许下载整个播放列表',
        type: 'checkbox',
        defaultValue: false,
        hint: '关闭时只下载单个视频'
      }
    ]
  },

  async run(payload, ctx) {
    const url = ctx.getString(payload, 'url').trim()
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: '请填写以 http:// 或 https:// 开头的资源地址' }
    }
    const mode = ctx.getString(payload, 'mode', 'best')
    const allowPlaylist = ctx.getBoolean(payload, 'allowPlaylist', false)
    const outDir = payload.outputDir ? ensureDir(resolveUserPath(ctx.getString(payload, 'outputDir'))) : outputsDir()

    const args = ['-P', outDir, '-o', '%(title).120s.%(ext)s', '--no-warnings', '--print', 'after_move:filepath']
    if (!allowPlaylist) args.push('--no-playlist')
    if (mode === 'audio') args.push('-x', '--audio-format', 'mp3')
    else if (mode === '720') args.push('-f', 'bv*[height<=720]+ba/b[height<=720]')
    else args.push('-f', 'bv*+ba/b')

    // 音视频合流与转码依赖 ffmpeg，显式告知 yt-dlp 其位置，避免 PATH 缺失导致合并失败
    const ffmpeg = await resolveBinary('ffmpeg')
    if (ffmpeg) args.push('--ffmpeg-location', dirname(ffmpeg.path))

    args.push(url)

    const result = await runToolBinary('yt-dlp', args, { timeoutMs: 60 * 60 * 1000 })
    if (!result.ok) {
      const reason = result.binaryPath === null ? '未检测到 yt-dlp，请在工具集市顶部查看安装指引。' : `yt-dlp 执行失败（退出码 ${result.code}）。`
      return {
        ok: false,
        error: `${reason}\n${(result.stderr || result.error || '').split('\n').slice(-6).join('\n')}`
      }
    }

    const printed = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && (line.includes(':') || line.includes('/') || line.includes('\\')))
      .pop()
    const saved = printed && fileExists(printed) ? printed : newestFile(outDir)

    return {
      ok: true,
      resultPath: saved,
      resultSummary: saved ? `已归档：${basename(saved)}` : '下载完成（未定位到具体文件）',
      outputs: [
        { label: '下载模式', value: mode === 'audio' ? '仅音频' : mode === '720' ? '最高 720P' : '最佳画质' },
        { label: '归档目录', value: outDir },
        { label: '文件', value: saved ?? '未知' }
      ],
      preview: (result.stdout || '').split('\n').slice(-8).join('\n')
    }
  }
}
