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

interface Record {
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

  const results: Record[] = []
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
  const docxPath = await run('format-convert', { sourcePath: mdPath, targetFormat: 'docx' })
  if (docxPath) await run('format-convert', { sourcePath: docxPath, targetFormat: 'md' })

  // 媒体链路：WAV → MP3（FFmpeg）
  await run('format-convert', { sourcePath: wavPath, targetFormat: 'mp3' })

  await run('unit-convert', { value: 1, fromUnit: 'km', toUnit: 'm' })
  await run('circuit-calc', { mode: 'ohm', voltage: 12, current: 0.5 })
  await run('flashcard-maker', {
    taskId: task.id,
    question: '阶段二自检问题？',
    answer: '用于验证卡片与复习计划联动。',
    tags: '自检'
  })

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
