import { basename, extname } from 'node:path'
import type {
  Note,
  NoteImportItem,
  NoteImportOptions,
  NoteImportProgress,
  NoteImportSummary
} from '@shared/types/domain'
import { prepareDocument } from './import'
import { splitByHeadings, truncateForNote } from './import/text.util'
import { saveNote } from './note.service'
import { saveNoteDocument } from './library.service'
import { logger } from '../utils/logger'

/**
 * 把外部文档（PDF / Word / PPT / Excel / EPUB / 网页 / 纯文本 …）导入成一本「书」。
 * 三种落法：
 * - 文本类（Markdown / TXT / 代码 / CSV / 能解析出结构的 Word）→ 存正文，可编辑；
 * - 原版式类（PDF / PPT / Excel / 转得出 PDF 的 Office）→ 存正文供搜索 + 把渲染件收进书库，只读逐页看；
 * - 网页 / EPUB → 打包成自包含 HTML 收进书库，只读按排版看。
 *
 * 1.2.4 起：多个文件并行解析（Office 转换另有全局串行队列），
 * 每个文件的阶段变化都通过 onProgress 推给渲染层画进度条。
 */

/** 同时解析的文件数：纯 JS 解析是 CPU 活，3 路已经吃满单核，再多会互相抢 */
const CONCURRENCY = 3
/** 单文件内各阶段的完成度权重，用于估算总进度 */
const STAGE_WEIGHT: Record<NoteImportProgress['stage'], number> = {
  queue: 0,
  parse: 0.15,
  render: 0.55,
  store: 0.92,
  done: 1
}

export async function importNoteFiles(
  paths: string[],
  options: NoteImportOptions = {},
  onProgress?: (progress: NoteImportProgress) => void
): Promise<NoteImportSummary> {
  const total = paths.length
  const startedAt = Date.now()
  const weight = new Array<number>(total).fill(0)
  const itemSlots: (NoteImportItem | null)[] = new Array<NoteImportItem | null>(total).fill(null)
  const noteSlots: Note[][] = new Array(total).fill(null).map(() => [])
  let done = 0
  let lastFile = ''

  const emit = (index: number, stage: NoteImportProgress['stage']): void => {
    if (!onProgress) return
    if (index >= 0) weight[index] = STAGE_WEIGHT[stage]
    const sum = weight.reduce((acc, value) => acc + value, 0)
    const percent = Math.max(0, Math.min(100, Math.round((sum / Math.max(1, total)) * 100)))
    const elapsed = Date.now() - startedAt
    const eta = done > 0 ? Math.round((elapsed / done) * (total - done)) : 0
    onProgress({ total, done, file: lastFile, stage, percent, elapsed, eta })
  }
  emit(-1, 'queue')

  /** 解析 + 成书 + 入库 */
  const handle = async (index: number): Promise<void> => {
    const path = paths[index]
    const file = basename(path)
    lastFile = file
    emit(index, 'parse')
    try {
      const doc = await prepareDocument(path, (stage) => emit(index, stage))
      emit(index, 'store')
      const { text } = truncateForNote(doc.content)
      const canSplit = doc.viewMode === 'text' && options.splitByHeading
      const chunks = canSplit ? splitByHeadings(text, 1) : []
      const stem = basename(path, extname(path))
      const pieces = chunks.length > 1 ? chunks : [{ title: doc.title || stem, body: text }]

      for (const [position, piece] of pieces.entries()) {
        const title = (piece.title || doc.title || stem).trim().slice(0, 120)
        const first = position === 0
        const note = saveNote({
          taskId: options.taskId ?? null,
          projectId: options.projectId ?? null,
          title,
          kind: options.kind ?? 'material',
          content: piece.body,
          summary: (options.summary ?? '').trim(),
          filePath: path,
          tags: ['导入', doc.format],
          enableReview: false,
          viewMode: doc.viewMode,
          docKind: null,
          docPath: null,
          pageCount: doc.pageCount,
          lastPage: 1,
          sourceFormat: doc.format,
          readonly: doc.readonly
        })
        // 渲染件只挂在第一条上：拆分出来的后续条目是同一本书的文字分片
        if (first && doc.docBuffer && doc.docKind) {
          const docPath = saveNoteDocument(note.id, doc.docKind, doc.docBuffer)
          saveNote({ id: note.id, title: note.title, docKind: doc.docKind, docPath })
        }
        noteSlots[index].push(note)
      }
      itemSlots[index] = {
        file,
        ok: true,
        noteIds: noteSlots[index].map((note) => note.id),
        format: doc.format,
        chars: doc.chars,
        engine: doc.docEngine || doc.engine,
        viewMode: doc.viewMode,
        pageCount: doc.pageCount,
        warning: doc.warning
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn('导入失败：' + file + ' -> ' + reason)
      itemSlots[index] = { file, ok: false, reason }
    }
    done += 1
    emit(index, 'done')
  }

  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const index = cursor
      cursor += 1
      await handle(index)
    }
  }
  const lanes = Math.max(1, Math.min(CONCURRENCY, total))
  await Promise.all(Array.from({ length: lanes }, worker))

  const items = itemSlots.filter((item): item is NoteImportItem => item !== null)
  const created = noteSlots.flat()
  emit(-1, 'done')
  return { created, items }
}
