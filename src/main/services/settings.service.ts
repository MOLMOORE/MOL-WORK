import { app } from 'electron'
import type { AppSettings } from '@shared/types/domain'
import { getSettings, saveSettings } from '../db/repositories/settings.repo'

export function readSettings(): AppSettings {
  return getSettings(app.getPath('userData'))
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings(patch, app.getPath('userData'))
}

export function dataDir(): string {
  return app.getPath('userData')
}
