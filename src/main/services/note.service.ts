import type { Note, NoteInput, ReviewItem } from '@shared/types/domain'
import {
  createNote,
  getNote,
  listNotes as repoListNotes,
  removeNote,
  updateNote
} from '../db/repositories/note.repo'
import type { Note as NoteEntity } from '@shared/types/domain'
import { getReviewByNote } from '../db/repositories/review.repo'
import { dropReviewForNote, ensureReviewForNote } from './review.service'
import { readNoteDocument, removeNoteLibrary } from './library.service'
import { existsSync } from 'node:fs'
import type { NoteDocInfo, NoteMark, NoteMarkInput } from '@shared/types/domain'
import { createMark, deleteMark, listMarks, setNoteProgress, updateMark } from '../db/repositories/note.repo'

export interface NoteWithReview extends Note {
  review: ReviewItem | null
}

export function attachReview(note: Note): NoteWithReview {
  return { ...note, review: getReviewByNote(note.id) ?? null }
}

/** 列表与详情都带上 projectName / readingMinutes（仓储层的 SELECT 已经算好） */
export function listNotes(taskId?: number | null, keyword?: string): NoteWithReview[] {
  return repoListNotes(taskId, keyword).map(attachReview)
}

export function readNote(id: number): NoteWithReview {
  const note = getNote(id)
  if (!note) throw new Error(`笔记不存在：${id}`)
  return attachReview(note)
}

export function saveNote(input: NoteInput): NoteWithReview {
  const isUpdate = typeof input.id === 'number' && input.id > 0
  const note = isUpdate ? updateNote(input.id as number, input) : createNote(input)

  if (input.enableReview === false) {
    dropReviewForNote(note.id)
  } else if (note.kind !== 'material') {
    ensureReviewForNote(note)
  }
  const refreshed = getNote(note.id) as NoteEntity
  return attachReview(refreshed)
}

export function deleteNote(id: number): void {
  dropReviewForNote(id)
  removeNote(id)
  removeNoteLibrary(id)
}

/**
 * 阅读器取文档：书页模式回 PDF 字节，富文本模式回自包含 HTML，
 * 文本模式只回正文。渲染件缺失（文件被手工删了）时自动退回文本模式。
 */
export function readNoteDoc(id: number): NoteDocInfo {
  const note = readNote(id)
  const missing = !note.docPath || !existsSync(note.docPath)
  if (missing && (note.viewMode === 'pages' || note.viewMode === 'rich')) {
    const fallback = updateNote(note.id, { viewMode: 'text', docKind: null, docPath: null })
    return {
      note: attachReview(fallback ?? note),
      viewMode: 'text',
      docKind: null,
      pageCount: 0,
      data: null,
      html: null,
      text: note.content,
      sourcePath: note.filePath,
      sourceFormat: note.sourceFormat,
      readonly: note.readonly
    }
  }
  if (note.docPath && note.docKind === 'pdf') {
    const buffer = readNoteDocument(note.docPath)
    return {
      note,
      viewMode: 'pages',
      docKind: 'pdf',
      pageCount: note.pageCount,
      data: buffer ? new Uint8Array(buffer) : null,
      html: null,
      text: note.content,
      sourcePath: note.filePath,
      sourceFormat: note.sourceFormat,
      readonly: note.readonly
    }
  }
  if (note.docPath && note.docKind === 'html') {
    const buffer = readNoteDocument(note.docPath)
    return {
      note,
      viewMode: 'rich',
      docKind: 'html',
      pageCount: note.pageCount,
      data: null,
      html: buffer ? buffer.toString('utf8') : null,
      text: note.content,
      sourcePath: note.filePath,
      sourceFormat: note.sourceFormat,
      readonly: note.readonly
    }
  }
  return {
    note,
    viewMode: 'text',
    docKind: null,
    pageCount: 0,
    data: null,
    html: null,
    text: note.content,
    sourcePath: note.filePath,
    sourceFormat: note.sourceFormat,
    readonly: note.readonly
  }
}

/** 打开原始文件（书库里的是渲染件，原件可能还在别处） */
export function noteSourcePath(id: number): string | null {
  return readNote(id).filePath
}

export function noteMarks(noteId: number): NoteMark[] {
  return listMarks(noteId)
}

export function saveNoteMark(input: NoteMarkInput): NoteMark {
  if (input.id) {
    const updated = updateMark(input.id, input)
    if (updated) return updated
  }
  return createMark(input)
}

export function dropNoteMark(id: number): void {
  deleteMark(id)
}

export function markNoteProgress(id: number, page: number, pageCount?: number): NoteWithReview | undefined {
  const note = setNoteProgress(id, page, pageCount)
  return note ? attachReview(note) : undefined
}

/** 由工具调用：创建一张学习卡片并立即纳入遗忘曲线复习计划 */
export function createFlashcard(input: {
  taskId: number | null
  question: string
  answer: string
  tags: string[]
  title?: string
}): NoteWithReview {
  const title = input.title ?? input.question.slice(0, 40)
  const content = [
    '## 问题',
    '',
    input.question,
    '',
    '## 答案',
    '',
    input.answer
  ].join('\n')

  const note = createNote({
    taskId: input.taskId,
    title: title.trim() === '' ? '未命名卡片' : title.trim(),
    kind: 'flashcard',
    content,
    tags: input.tags
  })
  ensureReviewForNote(note)
  return attachReview(getNote(note.id) as Note)
}
