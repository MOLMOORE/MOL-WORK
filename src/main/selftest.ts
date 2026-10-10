/**
 * 临时自检入口（仅 WORKSTATION_SELFTEST=1 时执行，用于阶段二端到端验证）。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initDatabase } from './db/connection'
import { bootstrap } from './services/bootstrap.service'
import { checkDependencies } from './utils/dependency-check'
import { executeTool, listToolManifests } from './services/tool.service'
import { createTaskService } from './services/task.service'
import { ensureDir, fileExists, tempDir } from './utils/paths'
import { runToolBinary } from './utils/binaries'

interface SelfTestRecord {
  tool: string
  ok: boolean
  summary: string
  path: string | null
  error: string | null
  durationMs: number
}

export async function runSelfTest(): Promise<void> {
  initDatabase()
  bootstrap()

  const results: SelfTestRecord[] = []
  const log = (line: string): void => console.log(`[selftest] ${line}`)

  const deps = await checkDependencies(true)
  for (const dep of deps) {
    log(`依赖 ${dep.label}: ${dep.available ? '可用' : '缺失'} ${dep.version ?? ''} -> ${dep.resolvedPath ?? '-'}`)
  }

  const manifests = await listToolManifests()
  log(`已注册工具：${manifests.map((item) => item.id).join(', ')}`)

  const workDir = ensureDir(join(tempDir(), 'selftest'))
  const mdPath = join(workDir, 'sample.md')
  writeFileSync(
    mdPath,
    ['# 阶段二自检文档', '', '这是一段用于验证 Pandoc 转换链路的中文内容。', '', '| 项目 | 状态 |', '| --- | --- |', '| 工具集市 | 已完成 |', ''].join('\n'),
    'utf8'
  )

  const wavPath = join(workDir, 'tone.wav')
  const synth = await runToolBinary('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '44100', wavPath])
  log(`合成测试音频：${synth.ok && fileExists(wavPath) ? '成功' : `失败 ${synth.stderr.slice(-200)}`}`)

  const task = createTaskService({ title: '阶段二自检任务', status: 'todo', progress: 0 })

  const run = async (tool: string, payload: Record<string, unknown>): Promise<string | null> => {
    const started = Date.now()
    try {
      const outcome = await executeTool(tool, payload)
      results.push({
        tool,
        ok: outcome.ok,
        summary: outcome.run.resultSummary ?? '',
        path: outcome.run.resultPath,
        error: outcome.run.error,
        durationMs: outcome.run.durationMs
      })
      log(`${tool} -> ${outcome.ok ? 'OK' : 'FAIL'} ${outcome.run.resultSummary ?? outcome.run.error ?? ''}`)
      return outcome.run.resultPath
    } catch (error) {
      results.push({
        tool,
        ok: false,
        summary: '',
        path: null,
        error: (error as Error).message,
        durationMs: Date.now() - started
      })
      log(`${tool} -> THROW ${(error as Error).message}`)
      return null
    }
  }

  // 文档链路：Markdown → DOCX → Markdown（Pandoc）
  const docxPath = await run('doc-convert', { sourcePath: mdPath, targetFormat: 'docx' })
  if (docxPath) await run('doc-convert', { sourcePath: docxPath, targetFormat: 'md' })

  // 音频链路：WAV → MP3（FFmpeg）
  await run('audio-convert', { sourcePath: wavPath, targetFormat: 'mp3' })

  // 图片链路：合成 PNG → WebP（FFmpeg）
  const pngPath = join(workDir, 'sample.png')
  const image = await runToolBinary('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-frames:v', '1', pngPath])
  log(`合成测试图片：${image.ok && fileExists(pngPath) ? '成功' : `失败 ${image.stderr.slice(-200)}`}`)
  if (fileExists(pngPath)) await run('image-convert', { sourcePath: pngPath, targetFormat: 'webp' })

  // 视频链路：合成测试视频 → MKV（FFmpeg）
  const mp4Path = join(workDir, 'sample.mp4')
  const video = await runToolBinary('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=15', '-pix_fmt', 'yuv420p', mp4Path])
  log(`合成测试视频：${video.ok && fileExists(mp4Path) ? '成功' : `失败 ${video.stderr.slice(-200)}`}`)
  if (fileExists(mp4Path)) await run('video-convert', { sourcePath: mp4Path, targetFormat: 'mkv' })

  await run('unit-convert', { value: 1, fromUnit: 'km', toUnit: 'm' })
  await run('circuit-calc', { mode: 'ohm', voltage: 12, current: 0.5 })
  await run('filter-calc', { mode: 'rc', r: '10k', c: '100n' })
  await run('opamp-calc', { mode: 'gain', rf: '100k', rg: '10k' })
  // 滤波仿真走内置 MNA 引擎，无需外部程序，顺带校验 -3 dB 点
  await run('filter-sim', { topology: 'rc-lowpass', r: '10k', c: '100n', fStart: '10', fStop: '100k' })
  await run('filter-sim', { topology: 'sallen-lowpass', r: '10k', r2: '20k', c: '100n', c2: '47n', fStart: '10', fStop: '100k' })

  // 网页提取：正文 Markdown + 整页截图（Playwright）
  await run('web-extract', { url: 'https://pypi.org/project/requests/', mode: 'article' })
  await run('web-extract', { url: 'https://pypi.org/project/requests/', mode: 'fullpage' })

  // 下载链路（受网络策略影响，失败会记录到结果中）
  await run('file-download', {
    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    mode: 'best',
    outputDir: workDir
  })

  const passed = results.filter((item) => item.ok).length
  console.log('\n==== SELFTEST SUMMARY ====')
  console.log(JSON.stringify({ passed, total: results.length, results }, null, 2))
  console.log('==== SELFTEST END ====')
}
