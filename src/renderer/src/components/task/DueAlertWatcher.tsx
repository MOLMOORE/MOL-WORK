import { useCallback, useEffect, useState } from 'react'
import { AlarmClock, AlarmClockOff, Hourglass, Star, Timer } from 'lucide-react'
import type { Task } from '@shared/types/domain'
import { Badge } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Overlay'
import { DeferDial } from './DeferDial'
import { api } from '../../lib/ipc'
import { cn, formatDateTime } from '../../lib/utils'
import { useAppStore } from '../../stores/appStore'
import { useTaskStore } from '../../stores/taskStore'

const STORAGE_ACKED = 'workstation.due-acked'
const STORAGE_SNOOZE = 'workstation.overdue-snooze'
const STORAGE_LAST_REMIND = 'workstation.overdue-last-remind'

/** 逾期事项重提醒间隔：默认每 5 分钟 */
const OVERDUE_REMIND_INTERVAL_MS = 5 * 60 * 1000
const POLL_MS = 20 * 1000
/** 快捷延后档位（分钟） */
const QUICK_DEFER = [5, 10, 30, 60]

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
 * - 到期事项支持快捷延后（5/10/30 分钟/1 小时）与延时转盘，或保持截止时间升级为「逾期事项」
 * - 逾期事项优先级仅低于优先事项，默认每 5 分钟重新提醒，可延时提醒
 * - 延期与升级都会计入统计（记忆）
 */
export function DueAlertWatcher(): JSX.Element | null {
  const [dueTasks, setDueTasks] = useState<Task[]>([])
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [dialTask, setDialTask] = useState<Task | null>(null)
  const [dialMinutes, setDialMinutes] = useState(15)
  const [busyId, setBusyId] = useState<number | null>(null)

  const pushToast = useAppStore((state) => state.pushToast)

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

  /** 延期：把截止时间从当前时刻延后 minutes 分钟 */
  const handleDefer = async (task: Task, minutes: number): Promise<void> => {
    setBusyId(task.id)
    try {
      await api.task.defer(task.id, minutes)
      const acked = readAcked()
      acked.add(ackKey(task))
      writeAcked(acked)
      removeTask(task.id)
      pushToast({ title: `已延后 ${minutes >= 60 ? `${minutes / 60} 小时` : `${minutes} 分钟`}`, description: task.title, tone: 'success' })
      refreshStores()
    } finally {
      setBusyId(null)
    }
  }

  /** 保持截止时间：升级为逾期事项 */
  const handleKeepOverdue = async (task: Task): Promise<void> => {
    setBusyId(task.id)
    try {
      await api.task.markOverdue(task.id)
      const acked = readAcked()
      acked.add(ackKey(task))
      writeAcked(acked)
      removeTask(task.id)
      pushToast({ title: '已升级为逾期事项', description: '将每 5 分钟重新提醒，直到完成或延期', tone: 'warning' })
      refreshStores()
    } finally {
      setBusyId(null)
    }
  }

  /** 稍后提醒：不改变任何状态，仅延后提醒时间 */
  const handleSnooze = (task: Task, minutes = 5): void => {
    const snoozeMap = readMap<number>(STORAGE_SNOOZE)
    snoozeMap[String(task.id)] = Date.now() + minutes * 60000
    writeMap(STORAGE_SNOOZE, snoozeMap)
    const acked = readAcked()
    acked.add(ackKey(task))
    writeAcked(acked)
    removeTask(task.id)
  }

  const snoozeAll = (): void => {
    for (const task of [...dueTasks, ...overdueTasks]) handleSnooze(task)
  }

  if (!open) return null

  const renderTaskRow = (task: Task, overdue: boolean): JSX.Element => (
    <div
      key={`${task.id}-${task.dueAt}`}
      className={cn(
        'rounded-xl border p-3',
        task.isPriority ? 'border-danger/60 bg-danger/10' : overdue ? 'border-warning/50 bg-warning/5' : 'border-border/70 bg-muted/25'
      )}
    >
      <div className="flex items-start gap-3">
        {overdue ? (
          <AlarmClockOff className={cn('mt-0.5 h-4 w-4 shrink-0 text-warning')} />
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
            {overdue ? '逾期 · ' : '截止 '}
            {formatDateTime(task.dueAt)}
            {task.projectName ? ` · ${task.projectName}` : ''}
            {overdue ? ' · 每 5 分钟将重新提醒' : ''}
          </p>
        </div>
        <Badge tone={task.isPriority ? 'danger' : overdue ? 'warning' : 'default'}>
          {task.isPriority ? '优先' : overdue ? '逾期' : '到期'}
        </Badge>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Hourglass className="h-3 w-3" />
          快捷延后
        </span>
        {QUICK_DEFER.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={busyId === task.id}
            onClick={() => void handleDefer(task, minutes)}
            className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-medium text-[#A5B4FC] transition-all hover:bg-primary/20 disabled:opacity-50"
          >
            +{minutes >= 60 ? `${minutes / 60}小时` : `${minutes}分钟`}
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
            setDialMinutes(15)
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-all',
            dialTask?.id === task.id
              ? 'border-info/60 bg-info/20 text-[#67E8F9]'
              : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
          )}
        >
          <Timer className="h-3 w-3" />
          延时转盘
        </button>
        <button
          type="button"
          disabled={busyId === task.id}
          onClick={() => void handleKeepOverdue(task)}
          className="rounded-lg border border-warning/50 bg-warning/10 px-2 py-1 text-[10px] font-medium text-[#FCD34D] transition-all hover:bg-warning/20 disabled:opacity-50"
        >
          保持截止（升级逾期）
        </button>
        <button
          type="button"
          onClick={() => handleSnooze(task)}
          className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground transition-all hover:text-foreground"
        >
          稍后提醒
        </button>
      </div>

      {dialTask?.id === task.id ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-info/30 bg-info/5 p-3">
          <DeferDial minutes={dialMinutes} onChange={setDialMinutes} />
          <Button
            size="sm"
            variant="primary"
            disabled={busyId === task.id}
            onClick={() => void handleDefer(task, dialMinutes)}
          >
            确认延后 {dialMinutes} 分钟
          </Button>
        </div>
      ) : null}
    </div>
  )

  return (
    <Modal
      open
      onClose={snoozeAll}
      title="截止时间提醒"
      description={`${dueTasks.length} 项刚到期 · ${overdueTasks.length} 项逾期事项待处理`}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={snoozeAll}>
            全部稍后提醒（5 分钟）
          </Button>
        </>
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
              逾期事项 · 每 5 分钟重提醒 · {overdueTasks.length} 项
            </p>
            {overdueTasks.map((task) => renderTaskRow(task, true))}
          </section>
        ) : null}
      </div>
    </Modal>
  )
}
