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
  /** 缓存标识：同一份文档的画布按 uid + 页码 + 缩放 + 角度复用 */
  uid: number
  pageCount: number
  /** 首页在 scale=1 下的宽高（CSS 像素） */
  baseWidth: number
  baseHeight: number
  /** 书签目录（页码为 0 表示这条书签没有可解析的目标） */
  outline: PdfOutlineItem[]
}

export interface PdfOutlineItem {
  title: string
  page: number
  depth: number
}

let docSeq = 0

/** 书签目录：逐条解析目标页，长文档能拖住首屏，所以放后台补 */
async function buildOutline(doc: PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  const outline: PdfOutlineItem[] = []
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
  return outline
}

/** onOutline 在后台解析完书签后回调，不阻塞首屏 */
export async function openPdf(data: Uint8Array, onOutline?: (outline: PdfOutlineItem[]) => void): Promise<PdfDocInfo> {
  ensureWorker()
  const doc = await pdfjsLib.getDocument({
    data,
    CMapReaderFactory: IpcCMapReader as unknown as never,
    useSystemFonts: true,
    isEvalSupported: false
  }).promise

  const first = await doc.getPage(1)
  const viewport = first.getViewport({ scale: 1 })
  if (onOutline) void buildOutline(doc).then(onOutline).catch(() => undefined)

  return {
    doc,
    uid: ++docSeq,
    pageCount: doc.numPages,
    baseWidth: viewport.width,
    baseHeight: viewport.height,
    outline: []
  }
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
  canvas.style.width = `${Math.round(viewport.width)}px`
  canvas.style.height = `${Math.round(viewport.height)}px`
  // 超大倍率下限制总像素，否则一次渲染就能把主线程卡死几十秒
  const ratioCap = Math.min(ratio, Math.sqrt(14_000_000 / Math.max(1, viewport.width * viewport.height)))
  const sharp = Math.max(1, ratioCap)
  canvas.width = Math.max(1, Math.floor(viewport.width * sharp))
  canvas.height = Math.max(1, Math.floor(viewport.height * sharp))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建画布')
  await page.render({
    canvasContext: context,
    viewport,
    transform: sharp === 1 ? undefined : [sharp, 0, 0, sharp, 0, 0]
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
/* ==========================================================================
 * 渲染队列 + 画布缓存
 * pdf.js 在这里跑的是「无 worker」模式，渲染全在主线程：并发画十页会把界面钉死，
 * 所以同一时刻只画一页，按优先级排队；画好的画布按 页码+缩放+角度 缓存复用，
 * 来回翻页、放大缩小回到原倍率时直接取缓存，不再重画。
 * ========================================================================== */

interface RenderJob {
  priority: number
  seq: number
  run: () => void
}

const pageCache = new Map<string, HTMLCanvasElement>()
const pending = new Map<string, Promise<HTMLCanvasElement>>()
const backlog: RenderJob[] = []
let rendering = false
let jobSeq = 0
/** 缓存上限：超了先丢已经不在页面上的旧画布 */
const MAX_CACHED = 48

function pump(): void {
  if (rendering || backlog.length === 0) return
  backlog.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
  const job = backlog.shift()
  if (!job) return
  rendering = true
  job.run()
}

function remember(key: string, canvas: HTMLCanvasElement): void {
  pageCache.set(key, canvas)
  if (pageCache.size <= MAX_CACHED) return
  for (const old of [...pageCache.keys()]) {
    if (pageCache.size <= MAX_CACHED) break
    const node = pageCache.get(old)
    if (old === key || !node || node.isConnected) continue
    pageCache.delete(old)
  }
}

/** 取某一页在指定倍率下的画布：命中缓存立即返回，未命中排队渲染 */
export function pageCanvas(
  doc: PDFDocumentProxy,
  uid: number,
  pageNumber: number,
  scale: number,
  rotation: number,
  priority = 0
): Promise<HTMLCanvasElement> {
  const rounded = Math.round(scale * 100) / 100
  const key = uid + '|' + pageNumber + '|' + rounded + '|' + rotation
  const cached = pageCache.get(key)
  if (cached) {
    pageCache.delete(key)
    pageCache.set(key, cached)
    return Promise.resolve(cached)
  }
  const inflight = pending.get(key)
  if (inflight) return inflight

  const task = new Promise<HTMLCanvasElement>((resolve, reject) => {
    backlog.push({
      priority,
      seq: ++jobSeq,
      run: () => {
        void renderPage(doc, pageNumber, rounded, rotation)
          .then((rendered) => {
            remember(key, rendered.canvas)
            resolve(rendered.canvas)
          })
          .catch(reject)
          .finally(() => {
            pending.delete(key)
            rendering = false
            pump()
          })
      }
    })
    pump()
  })
  pending.set(key, task)
  return task
}

/** 复制一份画布：同一页同时出现在两处（翻页残影 + 当前页）时用 */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas')
  copy.width = source.width
  copy.height = source.height
  copy.style.width = source.style.width
  copy.style.height = source.style.height
  const context = copy.getContext('2d')
  if (context) context.drawImage(source, 0, 0)
  return copy
}

/** 关掉一本书时丢掉它的缓存画布，长文档不至于占着几百 MB 不放 */
export function forgetPdf(uid: number): void {
  const prefix = uid + '|'
  for (const key of [...pageCache.keys()]) {
    if (!key.startsWith(prefix)) continue
    const node = pageCache.get(key)
    if (node && node.isConnected) continue
    pageCache.delete(key)
  }
}

/** 页面在指定缩放与旋转下的尺寸（CSS 像素） */
export function pageSize(width: number, height: number, scale: number, rotation: number): { width: number; height: number } {
  const swap = ((rotation % 180) + 180) % 180 !== 0
  return {
    width: (swap ? height : width) * scale,
    height: (swap ? width : height) * scale
  }
}
