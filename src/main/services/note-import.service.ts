import { basename } from 'node:path'
import type { Note, NoteImportItem, NoteImportOptions, NoteImportSummary } from '@shared/types/domain'
import { parseDocument } from './import'
import { splitByHeadings, truncateForNote } from './import/text.util'
import { saveNote } from './note.service'
import { logger } from '../utils/logger'

/**
 * 把外部文档（PDF / Word / PPT / Excel / EPUB / 网页 / 纯文本 …）导入为笔记或资料。
 * 解析在 services/import 里完成，这里只负责：截断保护 → 可选按标题拆分 → 落库。
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
      const doc = await parseDocument(path)
      const { text } = truncateForNote(doc.content)
      const chunks = options.splitByHeading ? splitByHeadings(text, 1) : []
      const pieces =
        chunks.length > 1
          ? chunks
          : [{ title: doc.title || basename(path, '.' + (path.split('.').pop() ?? '')), body: text }]

      const ids: number[] = []
      for (const [index, piece] of pieces.entries()) {
        const title = (piece.title || doc.title || file).trim().slice(0, 120)
        const note = saveNote({
          taskId: options.taskId ?? null,
          projectId: options.projectId ?? null,
          title,
          kind: options.kind ?? 'material',
          content: piece.body,
          filePath: path,
          tags: ['导入', doc.format],
          enableReview: false
        })
        ids.push(note.id)
        created.push(note)
      }
      items.push({ file, ok: true, noteIds: ids, format: doc.format, chars: doc.chars, engine: doc.engine })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn(`导入失败：${file} → ${reason}`)
      items.push({ file, ok: false, reason })
    }
  }
  return { created, items }
}