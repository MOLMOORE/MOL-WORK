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

export interface NoteWithReview extends Note {
  review: ReviewItem | null
}

export function attachReview(note: Note): NoteWithReview {
  return { ...note, review: getReviewByNote(note.id) ?? null }
}

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
