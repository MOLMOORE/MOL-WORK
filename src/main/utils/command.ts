import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

export interface CommandResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
  error?: string
}

export interface CommandOptions {
  cwd?: string
  timeoutMs?: number
  maxBuffer?: number
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const started = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
      windowsHide: true,
      shell: false,
      encoding: 'utf8'
    })
    logger.info(`命令执行成功：${command} (${Date.now() - started}ms)`)
    return { ok: true, code: 0, stdout: stdout ?? '', stderr: stderr ?? '' }
  } catch (error) {
    const detail = error as Error & { code?: number; stdout?: string; stderr?: string }
    logger.warn(`命令执行失败：${command} ${args.join(' ')}`, detail.message)
    return {
      ok: false,
      code: typeof detail.code === 'number' ? detail.code : 1,
      stdout: detail.stdout ?? '',
      stderr: detail.stderr ?? detail.message,
      error: detail.message
    }
  }
}

/** 通过 where/which 解析可执行文件是否存在 */
export async function whichCommand(name: string): Promise<string | null> {
  const finder = process.platform === 'win32' ? 'where' : 'which'
  const result = await runCommand(finder, [name], { timeoutMs: 8000 })
  if (!result.ok) return null
  const first = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0]
  return first ?? null
}
