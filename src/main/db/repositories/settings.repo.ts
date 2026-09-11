import { DEFAULT_SETTINGS } from '@shared/constants'
import type { AppSettings } from '@shared/types/domain'
import { all, run } from '../query'
import { nowIso } from '../../utils/time'

const SETTINGS_KEY = 'app'

export function getSettings(fallbackDataDir = ''): AppSettings {
  const row = all<{ value: string }>('SELECT value FROM settings WHERE key = ?', SETTINGS_KEY)[0]
  const base: AppSettings = { ...DEFAULT_SETTINGS, dataDir: fallbackDataDir }
  if (!row) return base
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>
    return { ...base, ...parsed, dataDir: parsed.dataDir || fallbackDataDir }
  } catch {
    return base
  }
}

export function saveSettings(patch: Partial<AppSettings>, fallbackDataDir = ''): AppSettings {
  const merged = { ...getSettings(fallbackDataDir), ...patch }
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    JSON.stringify(merged)
  )
  void nowIso()
  return merged
}
