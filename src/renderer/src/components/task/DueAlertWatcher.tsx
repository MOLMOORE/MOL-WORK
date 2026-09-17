import { useCallback, useEffect, useRef, useState } from 'react'
import { AlarmClock, AlarmClockOff, Hourglass, Star, Timer } from 'lucide-react'
import type { Task } from '@shared/types/domain'
import { APP_NAME } from '@shared/constants'
import { Badge } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { ConfirmDialog, Modal } from '../ui/Overlay'
import { DeferDial, formatDeferSeconds } from './DeferDial'
import { api } from '../../lib/ipc'
import { cn, formatDateTime } from '../../lib/utils'
import { playDoorbell } from '../../lib/sound'
import { useAppStore } from '../../stores/appStore'
import { useTaskStore } from '../../stores/taskStore'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function toLocalIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const STORAGE_ACKED = 'workstation.due-acked'
const STORAGE_SNOOZE = 'workstation.overdue-snooze'
const STORAGE_LAST_REMIND = 'workstation.overdue-last-remind'

/** 逾期事项重提醒间隔：默认每 5 分钟 */
const OVERDUE_REMIND_INTERVAL_MS = 5 * 60 * 1000
const POLL_MS = 20 * 1000
/** 快捷延后档位（秒） */
const QUICK_DEFER: { label: string; seconds: number }[] = [
  { label: '+5分钟', seconds: 5 * 60 },
  { label: '+10分钟', seconds: 10 * 60 },
  { label: '+30分钟', seconds: 30 * 60 },
  { label: '+1小时', seconds: 60 * 60 }
]

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function writeMap(key: string, value: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

function readAcked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_ACKED)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeAcked(set: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_ACKED, JSON.stringify(Array.from(set).slice(-800)))
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

function ackKey(task: Task): string {
  return `${task.id}:${task.dueAt}`
}

/**
 * 截止时间提醒：
 * - 到期事项支持快捷延后（5/10/30 分钟/1 小时）与时/分/秒三个钟表转盘
 * - 「稍后提醒 / 全部稍后提醒」会把事项自动标记为超时（逾期）状态，并按间隔重新提醒
 * - 延期与超时都会计入统计（记忆）
 */
export function DueAlertWatcher(): JSX.Element | null {
  const [dueTasks, setDueTasks] = useState<Task[]>([])
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [dialTask, setDialTask] = useState<Task | null>(null)
  const [dialHours, setDialHours] = useState(0)
  const [dialMinutes, setDialMinutes] = useState(10)
  const [dialSeconds, setDialSeconds] = useState(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  /** 稍后提醒前的确认（点击后事项将进入超时状态并每 5 分钟重提醒） */
  const [snoozeAsk, setSnoozeAsk] = useState<Task | null>(null)
  const [snoozeAllAsk, setSnoozeAllAsk] = useState(false)

  const pushToast = useAppStore((state) => state.pushToast)
  const knownIdsRef = useRef<Set<number>>(new Set())
  const notifiedRef = useRef<boolean>(false)

  const refreshStores = useCallback((): void => {
    void useTaskStore.getState().load()
    void useAppStore.getState().refreshOverview()
  }, [])

  const removeTask = useCallback((id: number): void => {
    setDueTasks((current) => current.filter((task) => task.id !== id))
    setOverdueTasks((current) => current.filter((task) => task.id !== id))
    setDialTask((current) => (current?.id === id ? null : current))
  }, [])

  useEffect(() => {
    let active = true
    const check = async (): Promise<void> => {
      try {
        const now = Date.now()
        const [dueList, overdueAll] = await Promise.all([api.task.due(), api.task.listOverdue()])
        if (!active) return

        const acked = readAcked()
        setDueTasks(dueList.filter((task) => !acked.has(ackKey(task))))

        const snoozeMap = readMap<number>(STORAGE_SNOOZE)
        const lastRemindMap = readMap<number>(STORAGE_LAST_REMIND)
        const needRemind = overdueAll.filter((task) => {
          if (now < (snoozeMap[String(task.id)] ?? 0)) return false
          const last = lastRemindMap[String(task.id)]
          return last === undefined || now - last >= OVERDUE_REMIND_INTERVAL_MS
        })
        if (needRemind.length > 0) {
          for (const task of needRemind) lastRemindMap[String(task.id)] = now
          writeMap(STORAGE_LAST_REMIND, lastRemindMap)
        }

        // 软件在后台（最小化/失焦）时改用系统级弹窗提醒，点击可回到主窗口
        const currentIds = new Set<number>([...dueList.filter((task) => !acked.has(ackKey(task))).map((task) => task.id), ...needRemind.map((task) => task.id)])
        const hasNew = Array.from(currentIds).some((id) => !knownIdsRef.current.has(id))
        const inBackground = document.hidden || !document.hasFocus()
        const total = currentIds.size
        if (total > 0 && (hasNew || !notifiedRef.current) && inBackground) {
          const first = [...dueList, ...needRemind][0]
          void api.app.notify(
            `截止时间提醒 · ${APP_NAME}`,
            `${total} 项事项到期待处理${first ? `：${first.title}` : ''}，点击回到应用处理`
          )
          notifiedRef.current = true
        }
        knownIdsRef.current = currentIds
        if (total === 0) notifiedRef.current = false

        setOverdueTasks(needRemind)
      } catch {
        /* 桥接不可用时忽略 */
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const open = dueTasks.length > 0 || overdueTasks.length > 0

  /** 只有截止/逾期提醒弹窗在「弹出第一次」时播门铃声，其余弹窗与重复弹出均不响 */
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      const dialogSound = useAppStore.getState().settings?.dialogSound ?? true
      if (dialogSound) playDoorbell()
    }
    if (!open) wasOpenRef.current = false
  }, [open])

  /** 延期：把截止时间从当前时刻延后 seconds 秒 */
  const handleDefer = async (task: Task, seconds: number): Promise<void> => {
    if (seconds <= 0) {
      pushToast({ title: '请先选择延后时长', tone: 'warning' })
      return
    }
    setBusyId(task.id)
    try {
      await api.task.defer(task.id, seconds)
      const acked = readAcked()
      acked.add(ackKey(task))
      writeAcked(acked)
      removeTask(task.id)
      pushToast({ title: `已延后 ${formatDeferSeconds(seconds)}`, description: task.title, tone: 'success' })
      refreshStores()
    } finally {
      setBusyId(null)
    }
  }

  /** 稍后提醒：事项自动变为超时（逾期）状态，并延后本次提醒 */
  const handleSnooze = async (task: Task, minutes = 5): Promise<void> => {
    setBusyId(task.id)
    try {
      if (!task.isOverdue) {
        await api.task.markOverdue(task.id)
      }
      const snoozeMap = readMap<number>(STORAGE_SNOOZE)
      snoozeMap[String(task.id)] = Date.now() + minutes * 60000
      writeMap(STORAGE_SNOOZE, snoozeMap)
      const acked = readAcked()
      acked.add(ackKey(task))
      writeAcked(acked)
      removeTask(task.id)
      pushToast({ title: `已稍后提醒（${minutes} 分钟）`, description: `${task.title} · 已标记为超时状态`, tone: 'info' })
      refreshStores()
    } finally {
      setBusyId(null)
    }
  }

  const snoozeAll = async (): Promise<void> => {
    for (const task of [...dueTasks, ...overdueTasks]) {
      await handleSnooze(task)
    }
  }

  if (!open) return null

  const dialTotalSeconds = dialHours * 3600 + dialMinutes * 60 + dialSeconds

  const renderTaskRow = (task: Task, overdue: boolean): JSX.Element => (
    <div
      key={`${task.id}-${task.dueAt}`}
      className={cn(
        'rounded-xl border p-3',
        task.isPriority ? 'border-danger/60 bg-danger/10' : overdue ? 'border-warning/50 bg-warning/5' : 'border-border bg-muted/25'
      )}
    >
      <div className="flex items-start gap-3">
        {overdue ? (
          <AlarmClockOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        ) : (
          <AlarmClock className={cn('mt-0.5 h-4 w-4 shrink-0', task.isPriority ? 'text-danger' : 'text-warning')} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1.5 truncate text-xs font-medium',
              task.isPriority ? 'text-danger' : 'text-foreground'
            )}
          >
            {task.isPriority ? <Star className="h-3 w-3 shrink-0 fill-current" /> : null}
            {task.title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {overdue ? '超时 · ' : '截止 '}
            {formatDateTime(task.dueAt)}
            {task.projectName ? ` · ${task.projectName}` : ''}
            {overdue ? ' · 每 5 分钟将重新提醒' : ''}
          </p>
        </div>
        <Badge tone={task.isPriority ? 'danger' : overdue ? 'warning' : 'default'}>
          {task.isPriority ? '优先' : overdue ? '超时' : '到期'}
        </Badge>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Hourglass className="h-3 w-3" />
          快捷延后
        </span>
        {QUICK_DEFER.map((option) => (
          <button
            key={option.seconds}
            type="button"
            disabled={busyId === task.id}
            onClick={() => void handleDefer(task, option.seconds)}
            className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-medium text-tint-primary transition-all hover:bg-primary/20 disabled:opacity-50"
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (dialTask?.id === task.id) {
              setDialTask(null)
              return
            }
            setDialTask(task)
            setDialHours(0)
            setDialMinutes(10)
            setDialSeconds(0)
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-all',
            dialTask?.id === task.id
              ? 'border-info/60 bg-info/20 text-tint-info'
              : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
          )}
        >
          <Timer className="h-3 w-3" />
          延时转盘
        </button>
        <button
          type="button"
          disabled={busyId === task.id}
          onClick={() => setSnoozeAsk(task)}
          className="rounded-lg border border-danger/60 bg-danger/15 px-2 py-1 text-[10px] font-medium text-tint-danger transition-all hover:bg-danger/25 disabled:opacity-50"
        >
          稍后提醒
        </button>
      </div>

      {dialTask?.id === task.id ? (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-info/30 bg-info/5 p-3">
          <DeferDial
            hours={dialHours}
            minutes={dialMinutes}
            seconds={dialSeconds}
            onChange={(next) => {
              setDialHours(next.hours)
              setDialMinutes(next.minutes)
              setDialSeconds(next.seconds)
            }}
          />
          {dialTotalSeconds > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              延后 {formatDeferSeconds(dialTotalSeconds)} · 至{' '}
              <span className="font-medium text-foreground">{formatDateTime(toLocalIso(new Date(Date.now() + dialTotalSeconds * 1000)))}</span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">拖动转盘选择延后时长</p>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={busyId === task.id || dialTotalSeconds <= 0}
            onClick={() => void handleDefer(task, dialTotalSeconds)}
          >
            确认延后 {formatDeferSeconds(dialTotalSeconds)}
          </Button>
        </div>
      ) : null}
    </div>
  )

  return (
    <>
    <Modal
      open
      onClose={() => setSnoozeAllAsk(true)}
      title="截止时间提醒"
      description={`${dueTasks.length} 项刚到期 · ${overdueTasks.length} 项超时事项待处理 · 稍后提醒会自动标记为超时状态`}
      width="max-w-2xl"
      footer={
        <Button variant="danger" disabled={busyId !== null} onClick={() => setSnoozeAllAsk(true)}>
          全部稍后提醒（5 分钟）
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {dueTasks.length > 0 ? (
          <section className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              已到期 · {dueTasks.length} 项
            </p>
            {dueTasks.map((task) => renderTaskRow(task, false))}
          </section>
        ) : null}

        {overdueTasks.length > 0 ? (
          <section className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-warning">
              超时事项 · 每 5 分钟重提醒 · {overdueTasks.length} 项
            </p>
            {overdueTasks.map((task) => renderTaskRow(task, true))}
          </section>
        ) : null}
      </div>
    </Modal>

    <ConfirmDialog
      open={snoozeAsk !== null}
      title="稍后提醒 · 将进入超时状态"
      description={`「${snoozeAsk?.title ?? ''}」将进入超时（逾期）状态：优先级最高、红色标识，之后每隔 5 分钟重新提醒一次，直到完成或延期。本次提醒将在 5 分钟后再次弹出。确定继续吗？`}
      confirmText="进入超时并稍后提醒"
      tone="danger"
      onCancel={() => setSnoozeAsk(null)}
      onConfirm={() => {
        const task = snoozeAsk
        setSnoozeAsk(null)
        if (task) void handleSnooze(task)
      }}
    />

    <ConfirmDialog
      open={snoozeAllAsk}
      title="全部稍后提醒 · 将进入超时状态"
      description={`共 ${dueTasks.length + overdueTasks.length} 项事项将全部进入超时（逾期）状态：优先级最高、红色标识，之后每隔 5 分钟重新提醒一次，直到完成或延期。确定继续吗？`}
      confirmText="全部进入超时并稍后提醒"
      tone="danger"
      onCancel={() => setSnoozeAllAsk(false)}
      onConfirm={() => {
        setSnoozeAllAsk(false)
        void snoozeAll()
      }}
    />
    </>
  )
}
