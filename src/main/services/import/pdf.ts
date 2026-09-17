/**
 * PDF 文本抽取：内置 pdf.js（legacy 构建，纯 JS），不要求用户安装任何外部软件。
 * 按基线把文本片段聚成行，再用全局字号中位数把明显偏大的行还原成 Markdown 标题。
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

interface PdfTextItem {
  str: string
  transform: number[]
  height: number
}

interface PdfPage {
  getTextContent(): Promise<{ items?: PdfTextItem[] }>
}

interface PdfDocument {
  numPages: number
  getPage(index: number): Promise<PdfPage>
  destroy?: () => Promise<void>
}

interface PdfInput {
  data: Uint8Array
  verbosity?: number
  isEvalSupported?: boolean
  cMapUrl?: string
  cMapPacked?: boolean
  standardFontDataUrl?: string
}

interface PdfLibrary {
  getDocument(input: PdfInput): { promise: Promise<PdfDocument> }
  GlobalWorkerOptions?: { workerSrc?: string }
}

// 主进程打包为 CJS，用 createRequire 从 out/main 出发解析 node_modules（打进 asar 同样可用）
const requireFromMain = createRequire(join(__dirname, 'index.js'))

/** pdf.js 的中文字形映射与标准字体目录（打进 asar 后仍可用 Node 的 fs 读取） */
function pdfAssetDir(name: string): string | undefined {
  try {
    return join(dirname(requireFromMain.resolve('pdfjs-dist/package.json')), name)
  } catch {
    return undefined
  }
}

let cached: PdfLibrary | null = null

function loadPdfJs(): PdfLibrary {
  if (cached) return cached
  const loaded = requireFromMain('pdfjs-dist/legacy/build/pdf.js') as PdfLibrary & { PDFJS?: PdfLibrary }
  const library = typeof loaded.getDocument === 'function' ? loaded : (loaded.PDFJS as PdfLibrary)
  // Node 环境没有 worker，文本抽取直接在主线程解析
  if (library.GlobalWorkerOptions) library.GlobalWorkerOptions.workerSrc = ''
  cached = library
  return library
}

interface TextLine {
  text: string
  size: number
}

/** 字号取 transform 的纵向缩放，取不到时退回 height */
function itemSize(item: PdfTextItem): number {
  const scale = Math.abs(item.transform?.[3] ?? 0)
  return scale > 0.5 ? scale : Math.abs(item.height ?? 0)
}

function groupLines(items: PdfTextItem[]): TextLine[] {
  const drafts: { y: number; size: number; parts: { x: number; text: string }[] }[] = []
  for (const item of items) {
    const text = item.str ?? ''
    const y = item.transform?.[5] ?? 0
    const x = item.transform?.[4] ?? 0
    const size = itemSize(item)
    if (text.trim() === '') continue
    const hit = drafts.find((line) => Math.abs(line.y - y) <= Math.max(2, Math.max(line.size, size) * 0.6))
    if (hit) {
      hit.parts.push({ x, text })
      hit.size = Math.max(hit.size, size)
    } else {
      drafts.push({ y, size, parts: [{ x, text }] })
    }
  }
  return drafts
    .sort((a, b) => b.y - a.y)
    .map((line) => ({
      text: line.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      size: line.size
    }))
    .filter((line) => line.text !== '')
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export interface PdfExtractResult {
  content: string
  title: string
  pages: number
}

export async function extractPdf(buffer: Buffer): Promise<PdfExtractResult> {
  const pdfjs = loadPdfJs()
  const doc = await pdfjs
    .getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      isEvalSupported: false,
      cMapUrl: pdfAssetDir('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: pdfAssetDir('standard_fonts')
    })
    .promise
  const pages: TextLine[][] = []
  try {
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index)
      const content = await page.getTextContent()
      pages.push(groupLines((content.items ?? []) as PdfTextItem[]))
    }
  } finally {
    void doc.destroy?.()
  }

  const bodySize = median(pages.flat().map((line) => line.size))
  const blocks: string[] = []
  pages.forEach((lines, index) => {
    if (doc.numPages > 1) blocks.push(`**[第 ${index + 1} 页]**`)
    for (const line of lines) {
      const heading =
        bodySize > 0 && line.size >= bodySize * 1.28 && line.text.length <= 60 && !/[。；，,.;]$/.test(line.text)
      blocks.push(heading ? `## ${line.text}` : line.text)
    }
  })

  const content = blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { content: content === '' ? '' : `${content}\n`, title: '', pages: doc.numPages }
}