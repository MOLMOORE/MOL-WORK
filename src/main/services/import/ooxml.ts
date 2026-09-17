/**
 * Office Open XML（.docx / .pptx / .xlsx）与 .epub 的解析器。
 * 用 jszip 解包 + fast-xml-parser 读 XML，直接产出 Markdown，不依赖 Office / Pandoc。
 */
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { posix } from 'node:path'
import { htmlToMarkdown, tidyMarkdown } from './text.util'

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  commentPropName: undefined,
  preserveOrder: false
})

/** 同一标签出现多次时 fast-xml-parser 会给数组，这里统一成数组 */
function arr<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? (value as T[]) : [value as T]
}

type Node = Record<string, unknown> | string | number | boolean

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (Array.isArray(value) && value.length > 0) return asObject(value[0])
  return null
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(textValue).join('')
  const node = asObject(value)
  if (!node) return ''
  if (node['#text'] !== undefined) return textValue(node['#text'])
  return Object.keys(node)
    .filter((key) => !key.startsWith('@_'))
    .map((key) => textValue(node[key]))
    .join('')
}

async function readEntry(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path)
  if (!file) return null
  try {
    return await file.async('string')
  } catch {
    return null
  }
}

async function parseEntry(zip: JSZip, path: string): Promise<Record<string, unknown> | null> {
  const raw = await readEntry(zip, path)
  if (!raw) return null
  try {
    return asObject(xml.parse(raw))
  } catch {
    return null
  }
}

/** 读取 .rels 关系表：rId → 目标路径（超链接与工作簿 sheet 都靠它定位） */
async function readRels(zip: JSZip, partPath: string): Promise<Record<string, string>> {
  const dir = posix.dirname(partPath)
  const rels = await parseEntry(zip, posix.join(dir, '_rels', `${posix.basename(partPath)}.rels`))
  const map: Record<string, string> = {}
  if (!rels) return map
  const collection = asObject(rels.Relationships ?? rels['Relationships'])
  for (const item of arr(collection?.Relationship)) {
    const node = asObject(item)
    if (!node) continue
    const id = String(node['@_Id'] ?? '')
    const target = String(node['@_Target'] ?? '')
    const mode = String(node['@_TargetMode'] ?? 'Internal')
    if (!id || !target) continue
    map[id] = mode === 'External' ? target : posix.normalize(posix.join(dir, target))
  }
  return map
}

async function coreTitle(zip: JSZip): Promise<string> {
  const core = await parseEntry(zip, 'docProps/core.xml')
  const raw = core ? textValue(core['dc:title'] ?? core.title) : ''
  return raw.trim()
}

/* ============================ Word (.docx) ============================ */

interface RunStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  sup: boolean
  sub: boolean
  mono: boolean
}

function styleOf(rPr: Record<string, unknown> | null): RunStyle {
  return {
    bold: isOn(rPr?.['w:b']),
    italic: isOn(rPr?.['w:i']),
    underline: underlineOn(rPr?.['w:u']),
    strike: isOn(rPr?.['w:strike']) || isOn(rPr?.['w:dstrike']),
    sup: String(asObject(rPr?.['w:vertAlign'])?.['@_w:val'] ?? '') === 'superscript',
    sub: String(asObject(rPr?.['w:vertAlign'])?.['@_w:val'] ?? '') === 'subscript',
    mono: ['Courier New', 'Consolas', 'Menlo'].includes(String(asObject(rPr?.['w:rFonts'])?.['@_w:ascii'] ?? ''))
  }
}

function isOn(value: unknown): boolean {
  const node = asObject(value)
  if (!node) return value !== undefined ? value !== false : false
  const flag = node['@_w:val']
  return flag === undefined ? true : !['0', 'false', 'none'].includes(String(flag))
}

function underlineOn(value: unknown): boolean {
  const node = asObject(value)
  if (!node) return false
  return !['none', '0', 'false'].includes(String(node['@_w:val'] ?? 'single'))
}

function wrapInline(text: string, style: RunStyle): string {
  if (text.trim() === '') return text
  const lead = text.slice(0, text.length - text.trimStart().length)
  const tail = text.slice(text.trimEnd().length)
  let body = text.trim()
  if (style.mono) body = `\`${body}\``
  if (style.bold && style.italic) body = `***${body}***`
  else if (style.bold) body = `**${body}**`
  else if (style.italic) body = `*${body}*`
  if (style.strike) body = `~~${body}~~`
  if (style.underline) body = `<u>${body}</u>`
  if (style.sup) body = `<sup>${body}</sup>`
  if (style.sub) body = `<sub>${body}</sub>`
  return `${lead}${body}${tail}`
}

export interface DocxStyleInfo {
  name: string
  level: number
  list: boolean
  ordered: boolean
}

/** 中文 Word 的 styleId 是「1 / 2 / a」这种本地化短码，标题级别只能从 styles.xml 反查 */
async function loadDocxStyles(zip: JSZip): Promise<Record<string, DocxStyleInfo>> {
  const map: Record<string, DocxStyleInfo> = {}
  const styles = await parseEntry(zip, 'word/styles.xml')
  const root = asObject(styles?.['w:styles']) ?? styles
  if (!root) return map
  for (const item of arr(root['w:style'])) {
    const node = asObject(item)
    if (!node) continue
    const id = String(node['@_w:styleId'] ?? '')
    if (id === '') continue
    const name = String(asObject(node['w:name'])?.['@_w:val'] ?? '')
    const outline = Number(asObject(asObject(node['w:pPr'])?.['w:outlineLvl'])?.['@_w:val'])
    const level = Number.isFinite(outline) && outline >= 0 && outline < 9 ? outline + 1 : 0
    const numbering = asObject(node['w:pPr'])?.['w:numPr']
    map[id] = {
      name,
      level,
      list: Boolean(numbering) || /list|列表/i.test(name),
      ordered: /number|数字|编号/i.test(name)
    }
  }
  return map
}

function headingLevel(pPr: Record<string, unknown> | null, styleMap: Record<string, DocxStyleInfo>): number {
  const outline = asObject(pPr?.['w:outlineLvl'])
  if (outline) {
    const level = Number(outline['@_w:val'])
    if (Number.isFinite(level) && level >= 0 && level < 9) return level + 1
  }
  const styleId = String(asObject(pPr?.['w:pStyle'])?.['@_w:val'] ?? '')
  const matched = /(?:heading|标题)\s*([1-6])/i.exec(styleId)
  if (matched) return Number(matched[1])
  if (/^title$/i.test(styleId)) return 1
  const info = styleMap[styleId]
  if (info?.level) return info.level
  const byName = /(?:heading|标题)\s*([1-6])/i.exec(info?.name ?? '')
  if (byName) return Number(byName[1])
  return 0
}

function paragraphText(paragraph: Record<string, unknown>, rels: Record<string, string>, styleMap: Record<string, DocxStyleInfo> = {}): string {
  const pPr = asObject(paragraph['w:pPr'])
  let buffer = ''
  const collect = (node: unknown): void => {
    const item = asObject(node)
    if (!item) return
    for (const key of Object.keys(item)) {
      if (key.startsWith('@_')) continue
      for (const child of arr(item[key])) {
        if (key === 'w:r' || key === 'w:hyperlink' || key === 'w:ins' || key === 'w:smartTag' || key === 'w:fldSimple') {
          const childNode = asObject(child)
          if (!childNode) continue
          if (key === 'w:hyperlink') {
            const before = buffer
            collectRuns(childNode, rels)
            const label = buffer.slice(before.length).trim()
            if (label !== '') {
              const id = String(childNode['@_r:id'] ?? '')
              const target = rels[id] ?? ''
              buffer = `${before}[${label}]${target ? `(${target})` : ''}`
            }
            continue
          }
          collectRuns(childNode, rels)
        } else if (key === 'w:t' || key === 'w:delText' || key === '#text') {
          buffer += textValue(child)
        } else if (key === 'w:tab') {
          buffer += '\t'
        } else if (key === 'w:br') {
          buffer += '  \n'
        } else if (key === 'w:drawing' || key === 'w:pict' || key === 'w:object' || key === 'w:footnoteReference') {
          // 图片与内嵌对象不落地为文本，避免笔记里出现一堆乱码
        } else if (key === 'w:instrText') {
          // 域代码本身不显示
        } else if (typeof child === 'object' && child !== null) {
          collect(child)
        }
      }
    }
  }
  const collectRuns = (run: Record<string, unknown>, linkRels: Record<string, string>): void => {
    const style = styleOf(asObject(run['w:rPr']))
    let piece = ''
    for (const key of Object.keys(run)) {
      if (key.startsWith('@_')) continue
      for (const child of arr(run[key])) {
        if (key === 'w:t') piece += textValue(child)
        else if (key === 'w:tab') piece += '\t'
        else if (key === 'w:br') piece += '  \n'
        else if (key === 'w:noBreakHyphen') piece += '-'
        else if (key === 'w:softHyphen') piece += ''
      }
    }
    if (piece !== '') buffer += wrapInline(piece, style)
    void linkRels
  }
  collect(paragraph)

  const level = headingLevel(pPr, styleMap)
  const text = buffer.replace(/\s+$/g, '')
  if (text.trim() === '') return ''
  if (level > 0) return `${'#'.repeat(Math.min(6, level))} ${text.trim()}\n\n`
  const numPr = asObject(pPr?.['w:numPr'])
  const styleInfo = styleMap[String(asObject(pPr?.['w:pStyle'])?.['@_w:val'] ?? '')]
  if (numPr || styleInfo?.list) {
    const indent = Number(asObject(numPr?.['w:ilvl'])?.['@_w:val'] ?? 0)
    const bullet = isOrderedList(pPr, styleInfo) ? '1. ' : '- '
    return `${'  '.repeat(Math.min(3, indent))}${bullet}${text.trim()}\n`
  }
  const align = String(asObject(pPr?.['w:jc'])?.['@_w:val'] ?? '')
  if (/center/.test(align)) return `${text.trim()}\n\n`
  return `${text.trim()}\n\n`
}

function isOrderedList(pPr: Record<string, unknown> | null, styleInfo?: DocxStyleInfo): boolean {
  const styleId = String(asObject(pPr?.['w:pStyle'])?.['@_w:val'] ?? '')
  return Boolean(styleInfo?.ordered) || /listparagraph|numbered|^l\d/i.test(styleId)
}

function tableToMarkdown(table: Record<string, unknown>, rels: Record<string, string>, styleMap: Record<string, DocxStyleInfo> = {}): string {
  const rows: string[][] = []
  for (const rowNode of arr(table['w:tr'])) {
    const row = asObject(rowNode)
    if (!row) continue
    const cells: string[] = []
    for (const cellNode of arr(row['w:tc'])) {
      const cell = asObject(cellNode)
      if (!cell) continue
      const content: string[] = []
      for (const block of arr(cell['w:p'])) {
        const paragraph = asObject(block)
        if (paragraph) content.push(paragraphText(paragraph, rels, styleMap).trim())
      }
      cells.push(content.filter((line) => line !== '').join('<br>').replace(/\|/g, '\\|'))
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  const lines = [`| ${padded[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
  for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return `${lines.join('\n')}\n\n`
}

export async function extractDocx(buffer: Buffer): Promise<{ content: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const document = await parseEntry(zip, 'word/document.xml')
  if (!document) throw new Error('DOCX 里找不到 word/document.xml，文件可能已损坏')
  const rels = await readRels(zip, 'word/document.xml')
  const styleMap = await loadDocxStyles(zip)
  const root = asObject(document['w:document']) ?? document
  const body = asObject(root['w:body'])
  const blocks: string[] = []
  if (body) {
    for (const key of Object.keys(body)) {
      if (key.startsWith('@_')) continue
      if (key === 'w:p') {
        for (const paragraph of arr(body[key])) {
          const node = asObject(paragraph)
          if (node) blocks.push(paragraphText(node, rels, styleMap))
        }
      } else if (key === 'w:tbl') {
        for (const table of arr(body[key])) {
          const node = asObject(table)
          if (node) blocks.push(tableToMarkdown(node, rels, styleMap))
        }
      } else if (key === 'w:sdt') {
        for (const sdt of arr(body[key])) blocks.push(extractSdt(asObject(sdt), rels, styleMap))
      }
    }
  }
  // 脚注与尾注作为附录保留
  const notes = await extractNotesPart(zip, 'word/footnotes.xml', '脚注')
  const endnotes = await extractNotesPart(zip, 'word/endnotes.xml', '尾注')
  const content = tidyMarkdown([...blocks, notes, endnotes].filter((part) => part.trim() !== '').join('\n'))
  const title = await coreTitle(zip)
  return { content, title }
}

function extractSdt(node: Record<string, unknown> | null, rels: Record<string, string>, styleMap: Record<string, DocxStyleInfo>): string {
  if (!node) return ''
  const value = asObject(node['w:sdtContent'])
  if (!value) return ''
  const parts: string[] = []
  for (const paragraph of arr(value['w:p'])) {
    const item = asObject(paragraph)
    if (item) parts.push(paragraphText(item, rels, styleMap))
  }
  for (const table of arr(value['w:tbl'])) {
    const item = asObject(table)
    if (item) parts.push(tableToMarkdown(item, rels, styleMap))
  }
  return parts.join('')
}

async function extractNotesPart(zip: JSZip, path: string, label: string): Promise<string> {
  const part = await parseEntry(zip, path)
  if (!part) return ''
  const lines: string[] = []
  const container = asObject(part['w:footnotes']) ?? asObject(part['w:endnotes']) ?? part
  for (const note of arr(container['w:footnote'] ?? container['w:endnote'])) {
    const node = asObject(note)
    if (!node) continue
    const id = String(node['@_w:id'] ?? '')
    if (['-1', '0'].includes(id)) continue
    const text: string[] = []
    for (const paragraph of arr(node['w:p'])) {
      const item = asObject(paragraph)
      if (item) text.push(paragraphText(item, {}, {}).replace(/[#*_`]/g, '').trim())
    }
    const body = text.filter((line) => line !== '').join(' ')
    if (body !== '') lines.push(`- [${id}] ${body}`)
  }
  return lines.length > 0 ? `## ${label}\n\n${lines.join('\n')}\n` : ''
}

/* ========================== PowerPoint (.pptx) ========================== */

function aTextRuns(paragraph: Record<string, unknown>): string {
  let buffer = ''
  for (const key of Object.keys(paragraph)) {
    if (key.startsWith('@_')) continue
    for (const child of arr(paragraph[key])) {
      const node = asObject(child)
      if (key === 'a:r') {
        const text = textValue(node?.['a:t'])
        const style = styleOf(null)
        const rPr = asObject(node?.['a:rPr'])
        style.bold = isOn(rPr?.['b'])
        style.italic = isOn(rPr?.['i'])
        style.underline = underlineOn({ '@_w:val': String(rPr?.['@_u'] ?? 'none') })
        if (text !== '') buffer += wrapInline(text, style)
      } else if (key === 'a:br') {
        buffer += '  \n'
      } else if (key === 'a:fld') {
        buffer += textValue(node?.['a:t'])
      }
    }
  }
  return buffer
}

function shapeText(txBody: Record<string, unknown>): string {
  const lines: string[] = []
  for (const paragraph of arr(txBody['a:p'])) {
    const node = asObject(paragraph)
    if (!node) continue
    const text = aTextRuns(node).trim()
    if (text === '') continue
    const pPr = asObject(node['a:pPr'])
    const level = Number(pPr?.['@_lvl'] ?? 0)
    const indent = '  '.repeat(Math.min(3, Number.isFinite(level) ? level : 0))
    lines.push(`${indent}- ${text}`)
  }
  return `${lines.join('\n')}\n\n`
}

function drawingTable(graphic: Record<string, unknown>): string {
  const tbl = asObject(graphic['a:tbl'])
  if (!tbl) return ''
  const rows: string[][] = []
  for (const rowNode of arr(tbl['a:tr'])) {
    const row = asObject(rowNode)
    if (!row) continue
    const cells: string[] = []
    for (const cellNode of arr(row['a:tc'])) {
      const cell = asObject(cellNode)
      const parts: string[] = []
      for (const paragraph of arr(cell?.['a:txBody'])) {
        // a:txBody 在 tc 下直接是对象，这里兼容两种写法
        const node = asObject(paragraph) ?? cell
        if (node?.['a:txBody'] !== undefined) {
          for (const inner of arr((asObject(node['a:txBody']) ?? node)['a:p'])) {
            const item = asObject(inner)
            if (item) parts.push(aTextRuns(item).trim())
          }
        } else if (node) {
          parts.push(aTextRuns(node).trim())
        }
      }
      if (cell?.['a:txBody'] && parts.length === 0) {
        const body = asObject(cell['a:txBody'])
        for (const inner of arr(body?.['a:p'])) {
          const item = asObject(inner)
          if (item) parts.push(aTextRuns(item).trim())
        }
      }
      cells.push(parts.filter((part) => part !== '').join(' ').replace(/\|/g, '\\|'))
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  const lines = [`| ${padded[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
  for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return `${lines.join('\n')}\n\n`
}

interface SlideParts {
  title: string
  blocks: string[]
}

function walkShapeTree(tree: Record<string, unknown>, parts: SlideParts): void {
  for (const key of Object.keys(tree)) {
    if (key.startsWith('@_')) continue
    for (const child of arr(tree[key])) {
      const node = asObject(child)
      if (!node) continue
      if (key === 'p:sp') {
        const body = asObject(node['p:txBody'])
        if (!body) continue
        const phType = String(asObject(asObject(asObject(node['p:nvSpPr'])?.['p:nvPr'])?.['p:ph'])?.['@_type'] ?? '')
        const text = shapeText(body).trim()
        if (text === '') continue
        if (/^(ctrTitle|title)$/.test(phType) && parts.title === '') {
          parts.title = text.replace(/^- /gm, '').replace(/\n+/g, ' ').trim()
        } else {
          parts.blocks.push(text)
        }
      } else if (key === 'p:graphicFrame') {
        const data = asObject(asObject(node['a:graphic'])?.['a:graphicData'])
        if (data) {
          const table = drawingTable(data).trim()
          if (table !== '') parts.blocks.push(table)
        }
      } else if (key === 'p:grpSp') {
        const inner = asObject(node['p:spTree'])
        if (inner) walkShapeTree(inner, parts)
      }
    }
  }
}

function slideNumber(name: string): number {
  const matched = /(\d+)\.xml$/i.exec(name)
  return matched ? Number(matched[1]) : 0
}

export async function extractPptx(buffer: Buffer): Promise<{ content: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
  if (slidePaths.length === 0) throw new Error('PPTX 里找不到任何幻灯片，文件可能已损坏')

  const blocks: string[] = []
  let deckTitle = ''
  for (const [index, path] of slidePaths.entries()) {
    const slide = await parseEntry(zip, path)
    const tree = asObject(asObject(slide?.['p:sld'])?.['p:cSld'])
    const shapeTree = asObject(tree?.['p:spTree'])
    const parts: SlideParts = { title: '', blocks: [] }
    if (shapeTree) walkShapeTree(shapeTree, parts)
    const number = index + 1
    if (number === 1 && parts.title !== '') deckTitle = parts.title
    const notes = await notesForSlide(zip, number)
    const body = parts.blocks.join('\n\n')
    if (parts.title === '' && body === '' && notes === '') continue
    blocks.push(`## 第 ${number} 页${parts.title ? ` · ${parts.title}` : ''}\n\n${body}${notes ? `\n\n**演讲者备注**：${notes}\n` : ''}`)
  }
  return { content: tidyMarkdown(blocks.join('\n\n')), title: deckTitle }
}

async function notesForSlide(zip: JSZip, slideNumberValue: number): Promise<string> {
  const notes = await parseEntry(zip, `ppt/notesSlides/notesSlide${slideNumberValue}.xml`)
  const body = asObject(asObject(asObject(notes?.['p:notes'])?.['p:cSld'])?.['p:spTree'])
  if (!body) return ''
  const texts: string[] = []
  for (const shape of arr(body['p:sp'])) {
    const node = asObject(shape)
    const txBody = asObject(node?.['p:txBody'])
    if (!txBody) continue
    const ph = String(asObject(asObject(asObject(node?.['p:nvSpPr'])?.['p:nvPr'])?.['p:ph'])?.['@_type'] ?? '')
    if (/sldNum|dt|ftr/i.test(ph)) continue
    for (const paragraph of arr(txBody['a:p'])) {
      const item = asObject(paragraph)
      if (!item) continue
      const text = aTextRuns(item).trim()
      if (text !== '') texts.push(text)
    }
  }
  return texts.join(' ').replace(/\s+/g, ' ').trim()
}
/* ============================ Excel (.xlsx) ============================ */

function columnOf(reference: string): number {
  const letters = /^([A-Z]+)/i.exec(reference)?.[1]
  if (!letters) return -1
  let index = 0
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

export async function extractXlsx(buffer: Buffer): Promise<{ content: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const shared: string[] = []
  const sst = await parseEntry(zip, 'xl/sharedStrings.xml')
  if (sst) {
    for (const item of arr(asObject(sst.sst)?.si)) {
      const node = asObject(item)
      if (!node) continue
      const parts: string[] = []
      if (typeof node.t === 'string') parts.push(node.t)
      for (const run of arr(node.r)) {
        const runNode = asObject(run)
        if (runNode && typeof runNode.t === 'string') parts.push(runNode.t)
      }
      shared.push(parts.join(''))
    }
  }

  const workbook = asObject((await parseEntry(zip, 'xl/workbook.xml'))?.workbook)
  const rels = await readRels(zip, 'xl/workbook.xml')
  const sheets = arr(asObject(workbook?.sheets)?.sheet)
  const blocks: string[] = []
  const names = sheets.length > 0 ? sheets : Object.keys(zip.files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))

  for (const entry of names) {
    const sheetNode = asObject(entry)
    const name = sheetNode ? String(sheetNode['@_name'] ?? `工作表${blocks.length + 1}`) : '工作表'
    const rid = sheetNode ? String(sheetNode['@_r:id'] ?? '') : ''
    const path = sheetNode ? rels[rid] ?? `xl/${rid}` : String(entry)
    const normalized = path.replace(/^\/?xl\//, 'xl/').replace(/^xl\/xl\//, 'xl/')
    const parsed = asObject((await parseEntry(zip, normalized))?.worksheet)
    const data = asObject(parsed?.sheetData)
    if (!data) continue
    const rows: string[][] = []
    for (const rowNode of arr(data.row)) {
      const row = asObject(rowNode)
      if (!row) continue
      const cells: string[] = []
      let cursor = 0
      for (const cellNode of arr(row.c)) {
        const cell = asObject(cellNode)
        if (!cell) continue
        const ref = String(cell['@_r'] ?? '')
        const target = ref ? columnOf(ref) : cursor
        while (cursor < target) {
          cells.push('')
          cursor += 1
        }
        cells.push(cellText(cell, shared))
        cursor = target + 1
      }
      if (cells.some((value) => value !== '')) rows.push(cells)
      if (rows.length >= 2000) break
    }
    if (rows.length === 0) continue
    const width = Math.max(...rows.map((row) => row.length))
    const padded = rows.slice(0, 400).map((row) => {
      const fixed = [...row, ...Array.from({ length: width - row.length }, () => '')]
      return fixed.map((value) => value.replace(/\|/g, '\\|'))
    })
    const lines = [`| ${padded[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
    for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`)
    const more = rows.length > 400 ? `\n\n> 表格较大，仅显示前 400 行。` : ''
    blocks.push(`## ${name}\n\n${lines.join('\n')}${more}\n`)
  }
  if (blocks.length === 0) throw new Error('XLSX 中没有读到任何单元格数据')
  return { content: tidyMarkdown(blocks.join('\n')), title: await coreTitle(zip) }
}

function cellText(cell: Record<string, unknown>, shared: string[]): string {
  const type = String(cell['@_t'] ?? '')
  if (type === 's') {
    const index = Number(textValue(cell.v))
    return Number.isFinite(index) ? shared[index] ?? '' : ''
  }
  if (type === 'inlineStr') {
    const inline = asObject(cell.is)
    if (!inline) return ''
    const parts: string[] = []
    if (typeof inline.t === 'string') parts.push(inline.t)
    for (const run of arr(inline.r)) {
      const node = asObject(run)
      if (node && typeof node.t === 'string') parts.push(node.t)
    }
    return parts.join('')
  }
  if (type === 'b') return textValue(cell.v) === '1' ? 'TRUE' : 'FALSE'
  const raw = textValue(cell.v)
  const formula = asObject(cell.f)
  if (raw === '' && formula) return ''
  return raw
}

/* ============================= eBook (.epub) ============================= */

export async function extractEpub(buffer: Buffer): Promise<{ content: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const container = asObject((await parseEntry(zip, 'META-INF/container.xml'))?.container)
  const rootfiles = asObject(container?.rootfiles)
  const rootfile = asObject(arr(rootfiles?.rootfile)[0])
  const opfPath = String(rootfile?.['@_full-path'] ?? '')
  if (!opfPath) throw new Error('EPUB 缺少 container.xml，无法解析')
  const opf = asObject((await parseEntry(zip, opfPath))?.package)
  const manifest = asObject(opf?.manifest)
  const items: Record<string, Record<string, unknown>> = {}
  for (const item of arr(manifest?.item)) {
    const node = asObject(item)
    if (node) items[String(node['@_id'])] = node
  }
  const spine = asObject(opf?.spine)
  const base = posix.dirname(opfPath)
  const blocks: string[] = []
  let bookTitle = await coreTitle(zip)
  for (const ref of arr(spine?.itemref)) {
    const node = asObject(ref)
    if (!node) continue
    const item = items[String(node['@_idref'])]
    if (!item) continue
    const href = String(item['@_href'] ?? '')
    if (!/\.x?html?$/i.test(href)) continue
    const path = posix.normalize(posix.join(base, decodeURIComponent(href)))
    const raw = await readEntry(zip, path)
    if (!raw) continue
    const chapterTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1]
    const body = htmlToMarkdown(raw)
    if (body.trim() === '') continue
    const title = chapterTitle ? tidyTitle(chapterTitle) : ''
    if (!bookTitle && title) bookTitle = title
    // 章节自带标题时不再重复加一层
    const needsHeading = title !== '' && !/^#{1,6}\s/.test(body.trimStart())
    blocks.push(`${needsHeading ? `# ${title}\n\n` : ''}${body}`)
  }
  if (blocks.length === 0) throw new Error('EPUB 中没有读到正文内容')
  return { content: tidyMarkdown(blocks.join('\n\n---\n\n')), title: bookTitle }
}

function tidyTitle(raw: string): string {
  return decodeEntitiesSafe(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().slice(0, 80)
}

function decodeEntitiesSafe(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,10});/g, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole
    }
    return whole
  })
}

/* ====================== OpenDocument（.odt / .ods / .odp） ====================== */

export async function extractOdf(buffer: Buffer): Promise<{ content: string; title: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const raw = await readEntry(zip, 'content.xml')
  if (!raw) throw new Error('OpenDocument 里找不到 content.xml')
  const parsed = asObject(xml.parse(raw))
  const blocks: string[] = []
  const walk = (node: Record<string, unknown>, depth: number): void => {
    for (const key of Object.keys(node)) {
      if (key.startsWith('@_')) continue
      for (const child of arr(node[key])) {
        const item = asObject(child)
        const ownText = typeof child === 'string' ? child : item ? textValue(item) : ''
        if (/^text:h$/.test(key)) {
          const level = Number(item?.['@_text:outline-level'] ?? 1)
          blocks.push(`${'#'.repeat(Math.min(6, Number.isFinite(level) ? level : 1))} ${ownText.trim()}\n\n`)
        } else if (/^text:p$/.test(key)) {
          const style = String(item?.['@_text:style-name'] ?? '')
          const prefix = /List/i.test(style) ? '- ' : ''
          blocks.push(`${prefix}${ownText.trim()}\n\n`)
        } else if (/^table:table$/.test(key) && item) {
          blocks.push(odfTable(item))
        } else if (item && depth < 12) {
          walk(item, depth + 1)
        }
      }
    }
  }
  const root = asObject(parsed?.['office:document-content']) ?? parsed
  if (root) walk(asObject(root['office:body']) ?? root, 0)
  return { content: tidyMarkdown(blocks.join('')), title: '' }
}

function odfTable(table: Record<string, unknown>): string {
  const rows: string[][] = []
  for (const rowNode of arr(table['table:table-row'])) {
    const row = asObject(rowNode)
    if (!row) continue
    const cells: string[] = []
    for (const cellNode of arr(row['table:table-cell'])) {
      const cell = asObject(cellNode)
      cells.push(cell ? textValue(cell).replace(/\s+/g, ' ').trim() : '')
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  const lines = [`| ${padded[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
  for (const row of padded.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return `${lines.join('\n')}\n\n`
}
