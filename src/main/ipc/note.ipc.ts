import { dialog, shell } from 'electron'
import type {
  Note,
  NoteDocInfo,
  NoteExtractInput,
  NoteExtractResult,
  NoteInput,
  NoteImportOptions,
  NoteImportProgress,
  NoteImportSummary,
  NoteMark,
  NoteMarkInput
} from '@shared/types/domain'
import { IPC_EVENTS } from '@shared/types/ipc'
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
import { extractNotePages } from '../services/note-extract.service'
import { reorderNotes } from '../db/repositories/note.repo'
import { readPdfAsset, type PdfAssetKind } from '../services/pdf-assets'
import { emitToRenderer, notifyDataChanged } from '../services/bus'

/** 导入进度广播：换文件或换阶段立刻发，同一阶段内按 120ms 节流，够画进度条也不刷屏 */
let lastProgressAt = 0
let lastProgressKey = ''
function pushImportProgress(progress: NoteImportProgress): void {
  const now = Date.now()
  const key = progress.file + '|' + progress.stage + '|' + progress.done
  const final = progress.stage === 'done' && progress.done >= progress.total
  if (!final && key === lastProgressKey && now - lastProgressAt < 120) return
  lastProgressKey = key
  lastProgressAt = now
  emitToRenderer(IPC_EVENTS.noteImport, progress)
}

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
    const summary = await importNoteFiles(paths, options, pushImportProgress)
    if (summary.created.length > 0) notifyDataChanged('notes')
    return summary
  })

  // ---------- 列表拖拽排序 / 页面提取（v1.2.5） ----------
  handle<void>('note:reorder', (ids: number[]) => reorderNotes(Array.isArray(ids) ? ids.map(Number) : []))

  handle<NoteExtractResult>('note:extract-pages', (input: NoteExtractInput) => extractNotePages(input))

  handle<string>('note:pick-save-path', async (defaultName: string) => {
    const result = await dialog.showSaveDialog({
      title: '保存提取出的 PDF',
      defaultPath: defaultName || '提取页面.pdf',
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
    })
    return result.canceled || !result.filePath ? '' : result.filePath
  })

  /** 只弹选择框拿路径：导入前先让渲染层问用户填简介与关联任务 / 课程 */
  handle<string[]>('note:pick-paths', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择要导入的笔记或文章',
      buttonLabel: '下一步',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的文档（PDF / Office / 网页 / 文本）', extensions: IMPORT_EXTENSIONS.map((ext) => ext.slice(1)) },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
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
    const summary = await importNoteFiles(result.filePaths, options, pushImportProgress)
    if (summary.created.length > 0) notifyDataChanged('notes')
    return summary
  })
}
