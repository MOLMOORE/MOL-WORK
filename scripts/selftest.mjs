#!/usr/bin/env node
/**
 * 工具集端到端自检：以 Electron 主进程身份真实执行全部工具（含外部引擎），打印结构化结果。
 * 数据写入系统临时目录下的 workstation-selftest，不影响真实工作站数据。
 * 用法：npm run selftest
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, WORKSTATION_SELFTEST: '1' }
})

child.on('exit', (code) => {
  console.log(`\n自检进程退出，退出码 ${code}。日志目录：${join(root, 'out')}`)
  process.exit(code ?? 0)
})
