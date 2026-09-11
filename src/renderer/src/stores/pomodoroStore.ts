import { create } from 'zustand'
import type { PomodoroPhase } from '@shared/types/domain'
import { api } from '../lib/ipc'
import { useAppStore } from './appStore'

export interface PomodoroConfig {
  /** 各阶段时长（秒） */
  focus: number
  short: number
  long: number
  /** 每完成多少个专注进入一次长休息 */
  roundsPerLong: number
  autoStartNext: boolean
  sound: boolean
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
  roundsPerLong: 4,
  autoStartNext: true,
  sound: true
}

export const PHASE_META: Record<PomodoroPhase, { label: string; color: string }> = {
  focus: { label: '专注', color: '#6366F1' },
  shortBreak: { label: '短休息', color: '#22C55E' },
  longBreak: { label: '长休息', color: '#22D3EE' }
}

interface PomodoroState {
  phase: PomodoroPhase
  running: boolean
  secondsLeft: number
  /** 本轮长休息前已完成的专注数 */
  completedFocus: number
  /** 本次运行累计完成的番茄数 */
  totalFocus: number
  taskId: number | null
  config: PomodoroConfig
  sync: (config: Partial<PomodoroConfig>) => void
  setTask: (taskId: number | null) => void
  start: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  skip: () => void
}

let timer: ReturnType<typeof setInterval> | null = null

function durationOf(phase: PomodoroPhase, config: PomodoroConfig): number {
  if (phase === 'focus') return config.focus
  if (phase === 'shortBreak') return config.short
  return config.long
}

function stopTimer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function ensureTimer(tick: () => void): void {
  if (timer) return
  timer = setInterval(tick, 1000)
}

/** 用 Web Audio 合成提示音，避免依赖外部音频资源 */
function beep(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const notes = [880, 1174]
    notes.forEach((freq, index) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = freq
      gain.gain.value = 0.0001
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      const start = ctx.currentTime + index * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
      oscillator.start(start)
      oscillator.stop(start + 0.2)
    })
    window.setTimeout(() => void ctx.close(), 900)
  } catch {
    /* 浏览器环境不支持时静默忽略 */
  }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const tick = (): void => {
    const state = get()
    if (!state.running) return
    if (state.secondsLeft > 1) {
      set({ secondsLeft: state.secondsLeft - 1 })
      return
    }
    complete()
  }

  const complete = (): void => {
    const { phase, config, taskId, completedFocus } = get()
    if (config.sound) beep()
    const pushToast = useAppStore.getState().pushToast

    if (phase === 'focus') {
      void api.focus
        .log(taskId, Math.max(1, Math.round(config.focus / 60)), '番茄钟专注')
        .then(() => useAppStore.getState().refreshOverview())
        .catch(() => undefined)
      const nextCompleted = completedFocus + 1
      const goLong = nextCompleted % Math.max(1, config.roundsPerLong) === 0
      const nextPhase: PomodoroPhase = goLong ? 'longBreak' : 'shortBreak'
      pushToast({
        title: '专注完成',
        description: goLong ? '该长休息了，放松一下' : '进入短休息',
        tone: 'success'
      })
      set({
        phase: nextPhase,
        secondsLeft: durationOf(nextPhase, config),
        completedFocus: goLong ? 0 : nextCompleted,
        totalFocus: get().totalFocus + 1,
        running: config.autoStartNext
      })
    } else {
      pushToast({ title: '休息结束', description: '开始下一个专注周期', tone: 'info' })
      set({ phase: 'focus', secondsLeft: durationOf('focus', config), running: config.autoStartNext })
    }

    if (!get().running) stopTimer()
  }

  return {
    phase: 'focus',
    running: false,
    secondsLeft: DEFAULT_POMODORO_CONFIG.focus,
    completedFocus: 0,
    totalFocus: 0,
    taskId: null,
    config: DEFAULT_POMODORO_CONFIG,

    sync: (config) => {
      const next = { ...get().config, ...config }
      const wasRunning = get().running
      set({ config: next })
      if (!wasRunning) set({ secondsLeft: durationOf(get().phase, next) })
      else {
        const current = get().secondsLeft
        const max = durationOf(get().phase, next)
        if (current > max) set({ secondsLeft: max })
      }
    },

    setTask: (taskId) => set({ taskId }),

    start: () => {
      set({ running: true })
      ensureTimer(() => tick())
    },

    pause: () => {
      set({ running: false })
      stopTimer()
    },

    toggle: () => {
      if (get().running) get().pause()
      else get().start()
    },

    reset: () => {
      stopTimer()
      const { config, phase } = get()
      set({ running: false, secondsLeft: durationOf(phase, config) })
    },

    skip: () => {
      // 跳过时保持当前的运行/暂停状态，仅切换到下一阶段
      const wasRunning = get().running
      complete()
      set({ running: wasRunning })
      if (!wasRunning) stopTimer()
    }
  }
})
