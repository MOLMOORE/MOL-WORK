import { useEffect, useState } from 'react'
import { AlarmClock, Star } from 'lucide-react'
import type { Task } from '@shared/types/domain'
import { Badge } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Overlay'
import { api } from '../../lib/ipc'
import { cn, formatDateTime } from '../../lib/utils'

const STORAGE_KEY = 'workstation.due-acknowledged'

function readAcked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeAcked(set: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set).slice(-500)))
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

const POLL_MS = 20 * 1000

/** 截止时间到达后弹窗警示，确认过的记录持久化避免重复弹出 */
export function DueAlertWatcher(): JSX.Element | null {
  const [due, setDue] = useState<Task[]>([])

  useEffect(() => {
    let active = true
    const check = async (): Promise<void> => {
      try {
        const list = await api.task.due()
        if (!active) return
        const acked = readAcked()
        setDue(list.filter((task) => !acked.has(`${task.id}:${task.dueAt}`)))
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

  const acknowledge = (): void => {
    const acked = readAcked()
    for (const task of due) acked.add(`${task.id}:${task.dueAt}`)
    writeAcked(acked)
    setDue([])
  }

  if (due.length === 0) return null

  return (
    <Modal
      open
      onClose={acknowledge}
      title="截止时间提醒"
      description={`有 ${due.length} 项任务已到达截止时间`}
      width="max-w-lg"
      footer={
        <Button variant="primary" onClick={acknowledge}>
          已知晓
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {due.map((task) => (
          <div
            key={`${task.id}-${task.dueAt}`}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3',
              task.isPriority ? 'border-danger/60 bg-danger/10' : 'border-border/70 bg-muted/25'
            )}
          >
            <AlarmClock className={cn('mt-0.5 h-4 w-4 shrink-0', task.isPriority ? 'text-danger' : 'text-warning')} />
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
                截止 {formatDateTime(task.dueAt)}
                {task.projectName ? ` · ${task.projectName}` : ''}
              </p>
            </div>
            <Badge tone={task.isPriority ? 'danger' : 'warning'}>{task.isPriority ? '优先' : '普通'}</Badge>
          </div>
        ))}
      </div>
    </Modal>
  )
}
