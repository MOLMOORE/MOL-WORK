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
  load: () => Promise<void>
  setKeyword: (keyword: string) => Promise<void>
  setTaskFilter: (taskId: number | null) => Promise<void>
  select: (id: number) => Promise<void>
  createNote: (input: NoteInput) => Promise<Note>
  saveNote: (input: NoteInput) => Promise<void>
  removeNote: (id: number) => Promise<void>
  gradeReview: (reviewId: number, rating: ReviewRating) => Promise<ReviewItem>
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  current: null,
  keyword: '',
  taskFilter: null,
  loading: false,
  saving: false,

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

  removeNote: async (id) => {
    await api.note.remove(id)
    if (get().current?.id === id) set({ current: null })
    await get().load()
  },

  gradeReview: async (reviewId, rating) => {
    const review = await api.review.grade(reviewId, rating)
    await get().load()
    if (get().current?.id === review.noteId) await get().select(review.noteId)
    return review
  }
}))
