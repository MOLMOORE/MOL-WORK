/**
 * 阅读器用的 PDF 引擎：直接用随包自带的 pdf.js（legacy 构建）。
 * 渲染进程是 file:// 来源，起不了外部 worker 脚本，也拉不到 asar 里的字形映射，
 * 所以：worker 走「主线程假 worker」（把 worker 模块挂到 globalThis.pdfjsWorker），
 * cmaps 走 IPC 由主进程代读。打包后同样可用。
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.js'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf'
import { api } from '../lib/ipc'

let installed = false

function ensureWorker(): void {
  if (installed) return
  const mod = pdfjsWorker as unknown as {
    WorkerMessageHandler?: unknown
    default?: { WorkerMessageHandler?: unknown }
  }
  const handler = mod.WorkerMessageHandler ?? mod.default?.WorkerMessageHandler
  if (handler) {
    ;(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler: handler }
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  installed = true
}

/** 72pt/inch → 96dpi 像素：scale 取这个值时就是「实际大小」 */
export const SCREEN_SCALE = 96 / 72

/** 中文字形映射：主进程代读 asar 里的 .bcmap */
class IpcCMapReader {
  readonly async: boolean = true
  async read({ name }: { name: string }): Promise<{ cmap: Uint8Array }> {
    const bytes = await api.note.pdfAsset('cmaps', `${name}.bcmap`)
    if (!bytes) throw new Error(`缺少字形映射：${name}`)
    return { cmap: bytes }
  }
}

export interface PdfDocInfo {
  doc: PDFDocumentProxy
  pageCount: number
  /** 首页在 scale=1 下的宽高（CSS 像素） */
  baseWidth: number
  baseHeight: number
  /** 书签目录（页码为 0 表示这条书签没有可解析的目标） */
  outline: { title: string; page: number; depth: number }[]
}

export async function openPdf(data: Uint8Array): Promise<PdfDocInfo> {
  ensureWorker()
  const doc = await pdfjsLib.getDocument({
    data,
    CMapReaderFactory: IpcCMapReader as unknown as never,
    useSystemFonts: true,
    isEvalSupported: false
  }).promise

  const first = await doc.getPage(1)
  const viewport = first.getViewport({ scale: 1 })

  const outline: { title: string; page: number; depth: number }[] = []
  try {
    const raw = await doc.getOutline()
    const walk = async (items: never[], depth: number): Promise<void> => {
      for (const entry of items as { title: string; dest?: unknown; items?: unknown }[]) {
        let page = 0
        try {
          const dest = typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest
          if (Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0] as never)) + 1
        } catch {
          page = 0
        }
        outline.push({ title: entry.title, page, depth })
        if (Array.isArray(entry.items) && entry.items.length > 0) await walk(entry.items as never[], depth + 1)
      }
    }
    if (raw && raw.length > 0) await walk(raw as never[], 0)
  } catch {
    /* 没有书签的 PDF 很常见 */
  }

  return { doc, pageCount: doc.numPages, baseWidth: viewport.width, baseHeight: viewport.height, outline }
}

export interface RenderedPage {
  canvas: HTMLCanvasElement
  width: number
  height: number
  page: PDFPageProxy
}

/** 把某一页画到画布上（返回的 canvas 可直接插进 DOM 参与翻页动画） */
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  rotation = 0
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(1, Math.floor(viewport.width * ratio))
  canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
  canvas.style.width = `${Math.round(viewport.width)}px`
  canvas.style.height = `${Math.round(viewport.height)}px`
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建画布')
  await page.render({
    canvasContext: context,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
  }).promise
  return { canvas, width: viewport.width, height: viewport.height, page }
}

/** 取某一页的文字：用于查找、目录兜底与注释摘录 */
export async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent()
  const lines: string[] = []
  let current = ''
  let lastY: number | null = null
  for (const item of content.items as { str?: string; transform?: number[] }[]) {
    if (typeof item.str !== 'string') continue
    const y: number | null = item.transform ? item.transform[5] : lastY
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
      if (current.trim() !== '') lines.push(current.trim())
      current = ''
    }
    current += item.str
    if (y !== undefined) lastY = y
  }
  if (current.trim() !== '') lines.push(current.trim())
  return lines.join('\n')
}