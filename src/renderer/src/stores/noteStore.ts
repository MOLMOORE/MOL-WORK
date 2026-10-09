import { create } from 'zustand'
import type { Note, NoteInput, ReviewItem, ReviewRating } from '@shared/types/domain'
import { api } from '../lib/ipc'

interface NoteState {
  notes: Note[]
  current: Note | null
  keyword: string
  taskFilter: number | null
  loading: boolean
  saving: boolean
  /** 回收站：软删除的资料 / 笔记 / 卡片，保留期内可恢复（v1.2.6） */
  deleted: Note[]
  deletedLoading: boolean
  load: () => Promise<void>
  setKeyword: (keyword: string) => Promise<void>
  setTaskFilter: (taskId: number | null) => Promise<void>
  select: (id: number) => Promise<void>
  createNote: (input: NoteInput) => Promise<Note>
  saveNote: (input: NoteInput) => Promise<void>
  /** 单条移入回收站 */
  removeNote: (id: number) => Promise<void>
  /** 快速删除模式：批量移入回收站，返回真正删掉的条数 */
  removeNotes: (ids: number[]) => Promise<number>
  /** 拉取回收站列表 */
  loadDeleted: () => Promise<void>
  /** 从回收站恢复（同时刷新列表） */
  restoreNote: (id: number) => Promise<void>
  /** 彻底删除，不可恢复 */
  purgeNote: (id: number) => Promise<void>
  /** 列表拖拽排序：按给定 id 顺序落库，并就地更新本地顺序 */
  reorderNotes: (ids: number[]) => Promise<void>
  gradeReview: (reviewId: number, rating: ReviewRating) => Promise<ReviewItem>
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  current: null,
  keyword: '',
  taskFilter: null,
  loading: false,
  saving: false,
  deleted: [],
  deletedLoading: false,

  load: async () => {
    const { keyword, taskFilter } = get()
    set({ loading: true })
    const notes = await api.note.list(taskFilter)
    const filtered = keyword.trim()
      ? notes.filter(
          (note) =>
            note.title.toLowerCase().includes(keyword.trim().toLowerCase()) ||
            (note.summary ?? '').toLowerCase().includes(keyword.trim().toLowerCase()) ||
            note.content.toLowerCase().includes(keyword.trim().toLowerCase())
        )
      : notes
    set({ notes: filtered, loading: false })
  },

  setKeyword: async (keyword) => {
    set({ keyword })
    await get().load()
  },

  setTaskFilter: async (taskId) => {
    set({ taskFilter: taskId })
    await get().load()
  },

  select: async (id) => {
    const note = await api.note.get(id)
    set({ current: note })
  },

  createNote: async (input) => {
    const note = await api.note.save(input)
    await get().load()
    set({ current: note })
    return note
  },

  saveNote: async (input) => {
    set({ saving: true })
    const note = await api.note.save(input)
    await get().load()
    set({ current: note, saving: false })
  },

  reorderNotes: async (ids) => {
    await api.note.reorder(ids)
    const rank = new Map(ids.map((id, index) => [id, index]))
    set({
      notes: get().notes.map((note) =>
        rank.has(note.id) ? { ...note, sortOrder: rank.get(note.id) as number } : note
      )
    })
  },

  removeNote: async (id) => {
    await api.note.remove(id)
    if (get().current?.id === id) set({ current: null })
    await Promise.all([get().load(), get().loadDeleted()])
  },

  removeNotes: async (ids) => {
    if (ids.length === 0) return 0
    const removed = await api.note.removeMany(ids)
    if (ids.includes(get().current?.id ?? -1)) set({ current: null })
    await Promise.all([get().load(), get().loadDeleted()])
    return removed
  },

  loadDeleted: async () => {
    set({ deletedLoading: true })
    const deleted = await api.note.listDeleted()
    set({ deleted, deletedLoading: false })
  },

  restoreNote: async (id) => {
    await api.note.restore(id)
    await Promise.all([get().load(), get().loadDeleted()])
  },

  purgeNote: async (id) => {
    await api.note.purge(id)
    if (get().current?.id === id) set({ current: null })
    await get().loadDeleted()
  },

  gradeReview: async (reviewId, rating) => {
    const review = await api.review.grade(reviewId, rating)
    await get().load()
    if (get().current?.id === review.noteId) await get().select(review.noteId)
    return review
  }
}))