import { dialog } from 'electron'
import type { Note, NoteInput, NoteImportOptions, NoteImportSummary } from '@shared/types/domain'
import { IMPORT_EXTENSIONS } from '@shared/constants'
import { handle } from './handle'
import { deleteNote, listNotes, readNote, saveNote } from '../services/note.service'
import { importNoteFiles } from '../services/note-import.service'
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
