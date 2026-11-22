import type { DependencyId } from '@shared/types/domain'
import { RECOMMENDED_DEPENDENCIES } from '@shared/constants'

export function recommendedDependencyIds(): DependencyId[] {
  return [...RECOMMENDED_DEPENDENCIES]
}

export function pickArchiveMember(paths: string[], fileName: string): string | null {
  const wanted = fileName.toLowerCase()
  return paths.find((path) => path.split(/[\\/]/).pop()?.toLowerCase() === wanted) ?? null
}

export function pickLatestStableVersion(html: string): string | null {
  const versions = Array.from(html.matchAll(/href=["'](\d+\.\d+\.\d+)\/?["']/gi), (match) => match[1])
  const unique = [...new Set(versions)]
  unique.sort(compareVersionsDescending)
  return unique[0] ?? null
}

export function compareVersionsDescending(left: string, right: string): number {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function parseChecksum(text: string, fileName: string): string | null {
  const wanted = fileName.toLowerCase()
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (match && match[2].split(/[\\/]/).pop()?.toLowerCase() === wanted) {
      return match[1].toLowerCase()
    }
  }
  return text.trim().match(/^([a-f0-9]{64})/i)?.[1]?.toLowerCase() ?? null
}

export function safeArchiveMember(paths: string[], fileName: string): string | null {
  const hit = pickArchiveMember(paths, fileName)
  if (!hit) return null
  const normalized = hit.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return null
  return hit
}

export function pickPandocWindowsZip<T extends { name: string }>(assets: T[]): T | null {
  return assets.find((asset) => /^pandoc-.*-windows-x86_64\.zip$/i.test(asset.name)) ?? null
}

export function pickLibreOfficeInstaller(listing: string): string | null {
  return listing.match(/href=["'](LibreOffice_[^"']+_Win_x86-64\.msi)["']/i)?.[1] ?? null
}
