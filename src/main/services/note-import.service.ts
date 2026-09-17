import { basename, extname } from 'node:path'
import type { Note, NoteImportItem, NoteImportOptions, NoteImportSummary } from '@shared/types/domain'
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
 */
export async function importNoteFiles(
  paths: string[],
  options: NoteImportOptions = {}
): Promise<NoteImportSummary> {
  const created: Note[] = []
  const items: NoteImportItem[] = []

  for (const path of paths) {
    const file = basename(path)
    try {
      const doc = await prepareDocument(path)
      const { text } = truncateForNote(doc.content)
      const canSplit = doc.viewMode === 'text' && options.splitByHeading
      const chunks = canSplit ? splitByHeadings(text, 1) : []
      const stem = basename(path, extname(path))
      const pieces =
        chunks.length > 1 ? chunks : [{ title: doc.title || stem, body: text }]

      const ids: number[] = []
      for (const [index, piece] of pieces.entries()) {
        const title = (piece.title || doc.title || stem).trim().slice(0, 120)
        const first = index === 0
        const note = saveNote({
          taskId: options.taskId ?? null,
          projectId: options.projectId ?? null,
          title,
          kind: options.kind ?? 'material',
          content: piece.body,
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
        ids.push(note.id)
        created.push(note)
      }
      items.push({
        file,
        ok: true,
        noteIds: ids,
        format: doc.format,
        chars: doc.chars,
        engine: doc.docEngine || doc.engine,
        viewMode: doc.viewMode,
        pageCount: doc.pageCount,
        warning: doc.warning
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn(`导入失败：${file} → ${reason}`)
      items.push({ file, ok: false, reason })
    }
  }
  return { created, items }
}