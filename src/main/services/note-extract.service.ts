import { writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import type { Note } from '@shared/types/domain'
import { createNote, getNote, updateNote } from '../db/repositories/note.repo'
import { readNoteDocument, saveNoteDocument } from './library.service'
import { logger } from '../utils/logger'

/**
 * 页面提取：从一本书里挑任意几页，拼成一份新的 PDF 收进书库。
 * 用 pdf-lib 直接搬运原页面对象（矢量文字与图片原样保留，不重画、不掉清晰度），
 * 所以扫描版 PDF 提取出来也还是原来的样子。
 */
export interface ExtractInput {
  noteId: number
  pages: number[]
  title?: string
  /** 传了就同时把提取结果另存一份到磁盘（用户自己选的路径） */
  saveTo?: string
}

export interface ExtractResult {
  note: Note
  savedPath: string | null
}

/** 页码去重排序：提取出来的页序与原文一致 */
function normalizePages(pages: number[], total: number): number[] {
  const set = new Set<number>()
  for (const page of pages) {
    const value = Math.round(Number(page))
    if (Number.isFinite(value) && value >= 1 && value <= total) set.add(value)
  }
  return [...set].sort((a, b) => a - b)
}

export async function extractNotePages(input: ExtractInput): Promise<ExtractResult> {
  const source0 = getNote(input.noteId)
  if (!source0) throw new Error('找不到这条资料')
  if (source0.docKind !== 'pdf' || !source0.docPath) throw new Error('只有按原版式保存的书页资料支持按页提取')
  const bytes = readNoteDocument(source0.docPath)
  if (!bytes) throw new Error('书库里的渲染件读不到了')

  const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = source.getPageCount()
  const pages = normalizePages(input.pages ?? [], total)
  if (pages.length === 0) throw new Error('先勾选要提取的页面')

  const output = await PDFDocument.create()
  const copied = await output.copyPages(source, pages.map((page) => page - 1))
  copied.forEach((page) => output.addPage(page))
  const title = (input.title ?? '').trim() || source0.title + '（提取 ' + pages.length + ' 页）'
  output.setProducer('MOL-WORK')
  output.setCreator('MOL-WORK 阅读 · 页面提取')
  output.setTitle(title)
  const buffer = Buffer.from(await output.save({ useObjectStreams: true }))

  const created = createNote({
    taskId: source0.taskId,
    projectId: source0.projectId,
    title: title.slice(0, 120),
    kind: source0.kind === 'note' ? 'note' : 'material',
    content: '',
    summary: '从《' + source0.title + '》提取第 ' + pages.join('、') + ' 页',
    filePath: null,
    tags: ['提取', source0.sourceFormat ?? 'PDF'],
    viewMode: 'pages',
    docKind: null,
    docPath: null,
    pageCount: pages.length,
    lastPage: 1,
    sourceFormat: source0.sourceFormat ?? 'PDF',
    readonly: true
  })
  const docPath = saveNoteDocument(created.id, 'pdf', buffer)
  const note = updateNote(created.id, { docKind: 'pdf', docPath }) as Note

  let savedPath: string | null = null
  if (input.saveTo) {
    try {
      writeFileSync(input.saveTo, buffer)
      savedPath = input.saveTo
    } catch (error) {
      logger.warn('提取结果另存为文件失败：' + input.saveTo, error)
    }
  }
  logger.info('页面提取完成：note=' + source0.id + ' -> ' + note.id + '，' + pages.length + ' 页')
  return { note, savedPath }
}
