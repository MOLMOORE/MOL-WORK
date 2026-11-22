import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface HttpDownloadProgress {
  transferred: number
  total: number
  percent: number
  bytesPerSecond: number
}

export interface HttpDownloadOptions {
  url: string
  target: string
  signal?: AbortSignal
  onProgress?: (progress: HttpDownloadProgress) => void
  fetchImpl?: typeof fetch
}

export interface HttpDownloadResult extends HttpDownloadProgress {
  path: string
}

export async function downloadHttpToFile(options: HttpDownloadOptions): Promise<HttpDownloadResult> {
  await mkdir(dirname(options.target), { recursive: true })
  const partial = `${options.target}.part`
  await rm(partial, { force: true })

  const request = options.fetchImpl ?? fetch
  const response = await request(options.url, {
    signal: options.signal,
    redirect: 'follow',
    headers: { 'User-Agent': 'MOL-WORK-Dependency-Downloader' }
  })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败：HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length') ?? 0)
  const stream = createWriteStream(partial)
  let streamError: Error | null = null
  stream.on('error', (error) => {
    streamError = error
  })
  const reader = response.body.getReader()
  let transferred = 0
  let lastAt = Date.now()
  let lastTransferred = 0
  let bytesPerSecond = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (streamError) throw streamError
      const chunk = Buffer.from(value)
      transferred += chunk.length
      if (!stream.write(chunk)) {
        await new Promise<void>((resolve, reject) => {
          stream.once('drain', resolve)
          stream.once('error', reject)
        })
      }

      const now = Date.now()
      if (now - lastAt >= 250) {
        bytesPerSecond = Math.round(((transferred - lastTransferred) * 1000) / (now - lastAt))
        lastAt = now
        lastTransferred = transferred
        options.onProgress?.({
          transferred,
          total,
          percent: total > 0 ? Math.min(99, (transferred / total) * 100) : 0,
          bytesPerSecond
        })
      }
    }
    await new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve)
      stream.once('error', reject)
      stream.end()
    })
    await rename(partial, options.target)
  } catch (error) {
    stream.destroy()
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }

  const final: HttpDownloadResult = {
    path: options.target,
    transferred,
    total: total || transferred,
    percent: 100,
    bytesPerSecond
  }
  options.onProgress?.(final)
  return final
}
