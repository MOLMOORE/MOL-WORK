import { create } from 'zustand'
import type { ReviewItem, ReviewRating, ScheduleEvent, ScheduleInput, Task } from '@shared/types/domain'
import { api } from '../lib/ipc'
import { todayKey } from '../lib/utils'

export type CalendarView = 'dayGridMonth' | 'timeGridWeek'

interface ScheduleState {
  events: ScheduleEvent[]
  reviews: ReviewItem[]
  pendingTasks: Task[]
  view: CalendarView
  selectedDay: string
  loading: boolean
  loadRange: (from: string, to: string) => Promise<void>
  loadReviews: () => Promise<void>
  loadPending: () => Promise<void>
  setView: (view: CalendarView) => void
  setSelectedDay: (day: string) => void
  createEvent: (input: ScheduleInput) => Promise<void>
  updateEvent: (id: number, patch: Partial<ScheduleInput>) => Promise<void>
  removeEvent: (id: number) => Promise<void>
  planTask: (taskId: number, startAt: string, minutes: number) => Promise<void>
  gradeReview: (id: number, rating: ReviewRating) => Promise<ReviewItem>
  planReview: (id: number, day: string) => Promise<void>
  enqueueReviews: (day: string) => Promise<number>
  deferReviews: () => Promise<number>
  refresh: () => Promise<void>
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  events: [],
  reviews: [],
  pendingTasks: [],
  view: 'dayGridMonth',
  selectedDay: todayKey(),
  loading: false,

  loadRange: async (from, to) => {
    set({ loading: true })
    const events = await api.schedule.range(from, to)
    set({ events, loading: false })
  },

  loadReviews: async () => {
    const reviews = await api.review.list()
    set({ reviews })
  },

  loadPending: async () => {
    const pendingTasks = await api.schedule.pendingTasks()
    set({ pendingTasks })
  },

  setView: (view) => set({ view }),

  setSelectedDay: (day) => set({ selectedDay: day }),

  createEvent: async (input) => {
    await api.schedule.create(input)
    await get().refresh()
  },

  updateEvent: async (id, patch) => {
    await api.schedule.update(id, patch)
    await get().refresh()
  },

  removeEvent: async (id) => {
    await api.schedule.remove(id)
    await get().refresh()
  },

  planTask: async (taskId, startAt, minutes) => {
    await api.schedule.planTask(taskId, startAt, minutes)
    await get().refresh()
  },

  gradeReview: async (id, rating) => {
    const review = await api.review.grade(id, rating)
    await get().refresh()
    return review
  },

  planReview: async (id, day) => {
    await api.review.plan(id, day)
    await get().refresh()
  },

  enqueueReviews: async (day) => {
    const created = await api.schedule.enqueueReviews(day)
    await get().refresh()
    return created
  },

  deferReviews: async () => {
    const moved = await api.schedule.deferReviews()
    await get().refresh()
    return moved
  },

  refresh: async () => {
    const { selectedDay } = get()
    const year = Number(selectedDay.slice(0, 4))
    const month = Number(selectedDay.slice(5, 7))
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const [events, reviews, pendingTasks] = await Promise.all([
      api.schedule.range(from, to),
      api.review.list(),
      api.schedule.pendingTasks()
    ])
    set({ events, reviews, pendingTasks })
  }
}))
