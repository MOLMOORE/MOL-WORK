import { dialog, shell } from 'electron'
import type {
  Note,
  NoteDocInfo,
  NoteInput,
  NoteImportOptions,
  NoteImportSummary,
  NoteMark,
  NoteMarkInput
} from '@shared/types/domain'
import { IMPORT_EXTENSIONS } from '@shared/constants'
import { handle } from './handle'
import {
  deleteNote,
  dropNoteMark,
  listNotes,
  markNoteProgress,
  noteMarks,
  noteSourcePath,
  readNote,
  readNoteDoc,
  saveNote,
  saveNoteMark
} from '../services/note.service'
import { importNoteFiles } from '../services/note-import.service'
import { readPdfAsset, type PdfAssetKind } from '../services/pdf-assets'
import { notifyDataChanged } from '../services/bus'

export function registerNoteIpc(): void {
  handle<Note[]>('note:list', (taskId?: number | null, keyword?: string) => listNotes(taskId, keyword))

  handle<Note>('note:get', (id: number) => readNote(id))

  handle<Note>('note:save', (input: NoteInput) => {
    const note = saveNote(input)
    notifyDataChanged('notes')
    return note
  })

  handle<void>('note:remove', (id: number) => {
    deleteNote(id)
    notifyDataChanged('notes')
  })

  // ---------- 阅读器：文档、阅读进度与读书笔记 ----------
  handle<NoteDocInfo>('note:doc', (id: number) => readNoteDoc(id))

  handle<Note>('note:progress', (id: number, page: number, pageCount?: number) =>
    markNoteProgress(id, page, pageCount) ?? readNote(id)
  )

  handle<NoteMark[]>('note:marks', (noteId: number) => noteMarks(noteId))

  handle<NoteMark>('note:mark-save', (input: NoteMarkInput) => saveNoteMark(input))

  handle<void>('note:mark-remove', (id: number) => dropNoteMark(id))

  handle<string>('note:open-source', async (id: number) => {
    const target = noteSourcePath(id)
    if (!target) throw new Error('这条笔记没有关联的源文件')
    return shell.openPath(target)
  })

  handle<void>('note:reveal-source', (id: number) => {
    const target = noteSourcePath(id)
    if (target) shell.showItemInFolder(target)
  })

  /** pdf.js 的中文字形映射 / 标准字体：渲染进程拉不到 asar 内的文件，由主进程代读 */
  handle<Uint8Array | null>('note:pdf-asset', (kind: PdfAssetKind, name: string) => readPdfAsset(kind, name))

  handle<NoteImportSummary>('note:import-files', async (paths: string[], options?: NoteImportOptions) => {
    const summary = await importNoteFiles(paths, options)
    if (summary.created.length > 0) notifyDataChanged('notes')
    return summary
  })

  handle<NoteImportSummary>('note:import-pick', async (options?: NoteImportOptions) => {
    const result = await dialog.showOpenDialog({
      title: '选择要导入的笔记或文章',
      buttonLabel: '导入',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的文档（PDF / Office / 网页 / 文本）', extensions: IMPORT_EXTENSIONS.map((ext) => ext.slice(1)) },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { created: [], items: [] }
    const summary = await importNoteFiles(result.filePaths, options)
    if (summary.created.length > 0) notifyDataChanged('notes')
    return summary
  })
}
