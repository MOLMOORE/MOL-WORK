/**
 * 网页与 EPUB 的「富文本」渲染件：把整本书打包成一份自包含 HTML
 * （图片一律内联成 data URI，样式表内联成 <style>），
 * 这样阅读器里的 iframe 不依赖任何外部文件，删掉原文件也照样能完整看。
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import JSZip from 'jszip'
import { decodeText } from './text.util'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

function mimeOf(path: string, fallback = 'application/octet-stream'): string {
  return MIME[extname(path).toLowerCase()] ?? fallback
}

function dataUri(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

const SHELL = (title: string, body: string, style: string): string => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; color: #16181d; }
body { font-family: 'Songti SC', 'Source Han Serif SC', Georgia, 'PingFang SC', 'Microsoft YaHei', serif;
  line-height: 1.75; font-size: 17px; padding: 2.2rem 2.6rem; }
h1, h2, h3, h4 { line-height: 1.35; margin: 1.4em 0 0.6em; }
h1 { font-size: 1.9em; }
h2 { font-size: 1.45em; }
h3 { font-size: 1.2em; }
p { margin: 0 0 0.9em; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #C9CDD4; padding: 6px 9px; text-align: left; }
blockquote { margin: 1em 0; padding: 0.2em 1em; border-left: 3px solid #B7BCC6; color: #4B5563; }
code, pre { font-family: ui-monospace, Consolas, monospace; background: #F3F4F6; border-radius: 4px; }
pre { padding: 10px 12px; overflow-x: auto; }
a { color: #1D7EED; }
.mw-chapter { break-after: page; }
.mw-chapter + .mw-chapter { margin-top: 2rem; padding-top: 1.4rem; border-top: 1px dashed #C9CDD4; }
${style}
</style></head><body>${body}</body></html>`

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 本地相对路径的图片 / 样式表内联；远程链接保持原样 */
function inlineLocalAssets(html: string, baseDir: string, reader: (abs: string) => Buffer | null): string {
  let out = html.replace(/(<img[^>]*?\ssrc=["'])([^"']+)(["'])/gi, (match, head: string, src: string, tail: string) => {
    if (/^(data:|https?:|blob:)/i.test(src)) return match
    const abs = resolve(baseDir, decodeURIComponent(src.split('#')[0]))
    const buffer = reader(abs)
    if (!buffer) return match
    return `${head}${dataUri(mimeOf(abs), buffer)}${tail}`
  })
  out = out.replace(
    /(<link[^>]*?rel=["']stylesheet["'][^>]*?href=["'])([^"']+)(["'])[^>]*>/gi,
    (match: string, _head: string, href: string) => {
      if (/^(data:|https?:)/i.test(href)) return match
      const abs = resolve(baseDir, decodeURIComponent(href))
      const buffer = reader(abs)
      if (!buffer) return match
      return `<style>${buffer.toString('utf8')}</style>`
    }
  )
  return out
}

function bodyOf(html: string): string {
  const match = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (match) return match[1]
  return html
}

function titleOf(html: string, fallback: string): string {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1].replace(/<[^>]+>/g, '').trim() || fallback
}

/** 普通网页 → 自包含 HTML */
export function bundleHtmlFile(filePath: string): { html: string; title: string; engine: string } | null {
  const raw = decodeText(readFileSync(filePath))
  if (raw.trim() === '') return null
  const baseDir = dirname(filePath)
  const inlined = inlineLocalAssets(raw, baseDir, (abs) => (existsSync(abs) ? readFileSync(abs) : null))
  const title = titleOf(inlined, basename(filePath, extname(filePath)))
  return { html: SHELL(title, bodyOf(inlined), ''), title, engine: '网页打包' }
}

/** EPUB：按 spine 顺序把所有章节拼成一本「书」，图片内联 */
export async function bundleEpubFile(
  filePath: string
): Promise<{ html: string; title: string; engine: string; chapters: { title: string; index: number }[] } | null> {
  const zip = await JSZip.loadAsync(readFileSync(filePath))
  const container = zip.file('META-INF/container.xml')
  if (!container) return null
  const containerXml = await container.async('string')
  const opfPath = /<rootfile[^>]*full-path=["']([^"']+)["']/.exec(containerXml)?.[1] ?? 'content.opf'
  const opfFile = zip.file(opfPath)
  if (!opfFile) return null
  const opf = await opfFile.async('string')
  const baseDir = dirname(opfPath) === '.' ? '' : dirname(opfPath)

  // manifest：id -> href
  const manifest = new Map<string, string>()
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0]
    const id = /id=["']([^"']+)["']/.exec(tag)?.[1]
    const href = /href=["']([^"']+)["']/.exec(tag)?.[1]
    if (id && href) manifest.set(id, href)
  }
  const spine: string[] = []
  for (const match of opf.matchAll(/<itemref\b[^>]*idref=["']([^"']+)["'][^>]*>/gi)) spine.push(match[1])
  const order = spine.length > 0 ? spine : [...manifest.keys()]
  const bookTitle = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1].trim() || basename(filePath, '.epub')

  const chapters: { title: string; index: number }[] = []
  const parts: string[] = []
  const readAsset = async (href: string): Promise<Buffer | null> => {
    const clean = decodeURIComponent(href.split('#')[0])
    const full = baseDir === '' ? clean : join(baseDir, clean).replace(/\\/g, '/')
    const file = zip.file(full) ?? zip.file(clean)
    if (!file) return null
    return Buffer.from(await file.async('uint8array'))
  }

  let cursor = 1
  for (const id of order) {
    const href = manifest.get(id)
    if (!href) continue
    const buffer = await readAsset(href)
    if (!buffer) continue
    const raw = buffer.toString('utf8')
    const chapterTitle = titleOf(raw, `第 ${cursor} 节`)
    // 章节内的图片改成 data URI
    const dir = baseDir === '' ? dirname(href) : join(baseDir, dirname(href))
    const inlined = await inlineLocalAssetsAsync(bodyOf(raw), dir, readAsset)
    chapters.push({ title: chapterTitle, index: cursor })
    parts.push(`<section class="mw-chapter" data-chapter="${cursor}" data-title="${escapeHtml(chapterTitle)}">${inlined}</section>`)
    cursor += 1
  }
  if (parts.length === 0) return null
  const style = ''
  return {
    html: SHELL(bookTitle, parts.join('\n'), style),
    title: bookTitle,
    engine: 'EPUB 打包',
    chapters
  }
}

/** 章节里的图片在 zip 内，异步读出来内联成 data URI */
async function inlineLocalAssetsAsync(
  html: string,
  baseDir: string,
  reader: (href: string) => Promise<Buffer | null>
): Promise<string> {
  const matches = [...html.matchAll(/<img[^>]*?\ssrc=["']([^"']+)["']/gi)]
  let out = html
  for (const match of matches) {
    const full = match[0]
    const src = match[1]
    if (/^(data:|https?:|blob:)/i.test(src)) continue
    const resolved = baseDir === '' || baseDir === '.' ? src : join(baseDir, src).replace(/\\/g, '/')
    const buffer = await reader(resolved)
    if (!buffer) continue
    out = out.split(full).join(full.replace(src, dataUri(mimeOf(src), buffer)))
  }
  return out
}
