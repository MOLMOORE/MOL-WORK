import { app, dialog, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { AppSettings, DependencyStatus, OverviewData } from '@shared/types/domain'
import { handle } from './handle'
import { dataDir, readSettings, writeSettings } from '../services/settings.service'
import { overview } from '../services/overview.service'
import { bootstrap, seedDemo } from '../services/bootstrap.service'
import { checkDependencies, invalidateDependencyCache } from '../utils/dependency-check'
import { dailyReport, renderReportMarkdown } from '../services/report.service'
import { ensureDir, isInside, resolveUserPath } from '../utils/paths'
import { notifyDataChanged } from '../services/bus'
import { getDbFilePath } from '../db/connection'
import { schedulerStatus } from '../services/scheduler.service'

export function registerAppIpc(): void {
  handle<AppSettings>('app:get-settings', () => readSettings())

  handle<AppSettings>('app:update-settings', (patch: Partial<AppSettings>) => {
    const next = writeSettings(patch)
    if (patch.theme) notifyDataChanged('settings')
    return next
  })

  handle<OverviewData>('app:overview', () => overview())

  handle<string>('app:data-dir', () => dataDir())

  handle<boolean>('app:open-path', async (target: string) => {
    const resolved = resolveUserPath(target)
    const result = await shell.openPath(resolved)
    return result === ''
  })

  handle<boolean>('app:show-item', (target: string) => {
    const resolved = resolveUserPath(target)
    shell.showItemInFolder(resolved)
    return true
  })

  handle<string | null>('app:pick-path', async (mode: 'file' | 'directory' = 'file') => {
    const result = await dialog.showOpenDialog({
      properties: mode === 'directory' ? ['openDirectory', 'createDirectory'] : ['openFile'],
      title: mode === 'directory' ? '选择输出目录' : '选择文件'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  handle<DependencyStatus[]>('app:check-deps', (force?: boolean) => {
    if (force) invalidateDependencyCache()
    return checkDependencies(Boolean(force))
  })

  handle<{ path: string; content: string }>('app:export-report', (dateKey: string) => {
    const report = dailyReport(dateKey)
    const content = renderReportMarkdown(report)
    const dir = ensureDir(join(dataDir(), 'reports'))
    const target = join(dir, `日报-${dateKey}.md`)
    writeFileSync(target, content, 'utf8')
    return { path: target, content }
  })

  handle<{ created: boolean }>('app:seed-demo', () => {
    const result = seedDemo()
    notifyDataChanged('all')
    return result
  })

  handle<Record<string, string>>('app:diagnostics', () => {
    bootstrap()
    const dbPath = getDbFilePath()
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      dataDir: dataDir(),
      database: dbPath,
      databaseName: basename(dbPath),
      insideDataDir: String(isInside(dataDir(), dbPath)),
      scheduler: JSON.stringify(schedulerStatus())
    }
  })
}
