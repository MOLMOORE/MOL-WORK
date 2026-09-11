import { useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, GripVertical, Inbox, Star, X } from 'lucide-react'
import type { Task } from '@shared/types/domain'
import { TASK_STATUS_META } from '@shared/constants'
import {
  WEEKDAY_CN,
  buildMonthMatrix,
  buildWeekDays,
  cn,
  dateKey,
  relativeDay
} from '../../lib/utils'

export type BoardView = 'day' | 'week' | 'month'

export interface ScheduleBoardProps {
  view: BoardView
  anchor: Date
  selectedDay: string
  tasks: Task[]
  onMove: (taskId: number, dayKey: string) => Promise<void>
  onReorder: (orderedIds: number[]) => Promise<void>
  onOpen: (task: Task) => void
  /** 快捷切换完成状态 */
  onToggleTask?: (task: Task) => void
  /** 快捷删除任务 */
  onRemoveTask?: (task: Task) => void
  /** 点击日期块切换所选日期 */
  onSelectDay: (dayKey: string) => void
  onCreateAt?: (dayKey: string) => void
}

function dayOf(task: Task): string | null {
  return task.dueAt ? task.dueAt.slice(0, 10) : null
}

function timeOf(task: Task): string {
  return task.dueAt ? task.dueAt.slice(11, 16) : ''
}

/** 日期分组的任务：同日内时间靠上优先，时间相同再优先事项置顶，其余按 sort_order 排序 */
function groupByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = dayOf(task)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(task)
    map.set(key, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const timeA = a.dueAt ?? ''
      const timeB = b.dueAt ?? ''
      if (timeA !== timeB) return timeA < timeB ? -1 : 1
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1
      return a.sortOrder === b.sortOrder ? a.id - b.id : a.sortOrder - b.sortOrder
    })
  }
  return map
}

export function ScheduleBoard({
  view,
  anchor,
  selectedDay,
  tasks,
  onMove,
  onReorder,
  onOpen,
  onToggleTask,
  onRemoveTask,
  onSelectDay,
  onCreateAt
}: ScheduleBoardProps): JSX.Element {
  const draggingRef = useRef<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overTaskId, setOverTaskId] = useState<number | null>(null)

  const byDay = useMemo(() => groupByDay(tasks), [tasks])
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const unscheduled = useMemo(() => tasks.filter((task) => !task.dueAt), [tasks])
  const today = dateKey(new Date())

  const clearDrag = (): void => {
    draggingRef.current = null
    setDraggingId(null)
    setOverDay(null)
    setOverTaskId(null)
  }

  const startDrag = (task: Task) => (event: React.DragEvent): void => {
    draggingRef.current = task.id
    setDraggingId(task.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(task.id))
  }

  /** 提交拖拽：把任务放入 dayKey，并可插入到 beforeTaskId 之前；优先事项始终置顶 */
  const commitDrop = async (dayKey: string, beforeTaskId?: number): Promise<void> => {
    const draggedId = draggingRef.current
    if (draggedId === null) return
    const dragged = taskById.get(draggedId)
    if (!dragged) {
      clearDrag()
      return
    }
    const sameDay = dayOf(dragged) === dayKey
    const ordered = (byDay.get(dayKey) ?? []).filter((task) => task.id !== draggedId)
    let insertAt = ordered.length
    if (beforeTaskId !== undefined) {
      const index = ordered.findIndex((task) => task.id === beforeTaskId)
      if (index >= 0) insertAt = index
    }
    ordered.splice(insertAt, 0, dragged)
    // 直接按拖拽后的相对顺序持久化；展示时再按"时间靠上 → 优先靠上"规则排序
    const list = ordered.map((task) => task.id)
    clearDrag()
    if (!sameDay) await onMove(draggedId, dayKey)
    await onReorder(list)
  }

  const dayDropProps = (dayKey: string): React.HTMLAttributes<HTMLElement> => ({
    onDragOver: (event) => {
      if (draggingRef.current === null) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (overDay !== dayKey) setOverDay(dayKey)
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setOverDay((current) => (current === dayKey ? null : current))
      }
    },
    onDrop: (event) => {
      event.preventDefault()
      event.stopPropagation()
      void commitDrop(dayKey)
    }
  })

  const renderCard = (task: Task, compact = false): JSX.Element => (
    <TaskCard
      key={task.id}
      task={task}
      compact={compact}
      dragging={draggingId === task.id}
      highlight={overTaskId === task.id}
      onOpen={() => onOpen(task)}
      onToggle={onToggleTask ? () => onToggleTask(task) : undefined}
      onRemove={onRemoveTask ? () => onRemoveTask(task) : undefined}
      onDragStart={startDrag(task)}
      onDragEnd={clearDrag}
      onDragOver={(event) => {
        if (draggingRef.current === null || draggingRef.current === task.id) return
        event.preventDefault()
        event.stopPropagation()
        setOverTaskId(task.id)
        setOverDay(dayOf(task))
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const key = dayOf(task)
        if (key) void commitDrop(key, task.id)
      }}
    />
  )

  if (view === 'day') {
    const dayKey = selectedDay
    const list = byDay.get(dayKey) ?? []
    const week = buildWeekDays(anchor)
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-7 gap-2">
            {week.map((date) => {
              const key = dateKey(date)
              const count = (byDay.get(key) ?? []).length
              const active = key === selectedDay
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDay(key)}
                  title={`切换到 ${key}`}
                  {...dayDropProps(key)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors',
                    active ? 'border-primary/50 bg-primary/10' : 'border-border/70 bg-muted/20 hover:bg-muted/40',
                    overDay === key && 'border-primary bg-primary/20'
                  )}
                >
                  <span className="text-[10px] text-muted-foreground">周{WEEKDAY_CN[(date.getDay() + 6) % 7]}</span>
                  <span
                    className={cn(
                      'flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-semibold',
                      key === today ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white' : 'text-foreground'
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{count} 项</span>
                </button>
              )
            })}
          </div>

          <div
            {...dayDropProps(dayKey)}
            className={cn(
              'flex min-h-[320px] flex-col gap-2 rounded-2xl border p-3 transition-colors',
              overDay === dayKey ? 'border-primary/60 bg-primary/5' : 'border-border/70 bg-muted/10'
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">当天事项 · {list.length} 项</p>
              <p className="text-[11px] text-muted-foreground">拖拽卡片可与其他日期互换，或调整日内顺序</p>
            </div>
            {list.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">这一天还没有安排，把左侧任务拖进来即可</p>
                {onCreateAt ? (
                  <button
                    type="button"
                    onClick={() => onCreateAt(dayKey)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    + 新建当日任务
                  </button>
                ) : null}
              </div>
            ) : (
              list.map((task) => renderCard(task))
            )}
          </div>
        </div>

        <UnscheduledPanel
          tasks={unscheduled}
          draggingId={draggingId}
          onOpen={onOpen}
          onDragStart={startDrag}
          onDragEnd={clearDrag}
        />
      </div>
    )
  }

  if (view === 'week') {
    const week = buildWeekDays(anchor)
    return (
      <div className="grid grid-cols-7 gap-2">
        {week.map((date) => {
          const key = dateKey(date)
          const list = byDay.get(key) ?? []
          return (
            <div
              key={key}
              {...dayDropProps(key)}
              className={cn(
                'flex min-h-[420px] flex-col gap-2 rounded-2xl border p-2 transition-colors',
                key === today ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-muted/15',
                overDay === key && 'border-primary/70 bg-primary/10'
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                title={`切换到 ${key}`}
                className="flex cursor-pointer items-center justify-between rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/50"
              >
                <span className="text-[11px] text-muted-foreground">周{WEEKDAY_CN[(date.getDay() + 6) % 7]}</span>
                <span
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-semibold',
                    key === today ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white' : 'text-foreground'
                  )}
                >
                  {date.getDate()}
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-1.5">
                {list.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-[10px] text-muted-foreground">
                    空闲
                  </p>
                ) : (
                  list.map((task) => renderCard(task, true))
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const matrix = buildMonthMatrix(anchor)
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      <div className="grid grid-cols-7 border-b border-border/70 bg-muted/30">
        {WEEKDAY_CN.map((day) => (
          <div key={day} className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">
            周{day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {matrix.map((date) => {
          const key = dateKey(date)
          const list = byDay.get(key) ?? []
          const inMonth = date.getMonth() === anchor.getMonth()
          const isToday = key === today
          return (
            <div
              key={key}
              {...dayDropProps(key)}
              onClick={() => onSelectDay(key)}
              className={cn(
                'flex min-h-[120px] cursor-pointer flex-col gap-1 border-b border-r border-border/50 p-1.5 transition-colors',
                !inMonth && 'bg-muted/10 opacity-60',
                key === selectedDay && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                overDay === key && 'bg-primary/20'
              )}
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-medium',
                    isToday ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white' : 'text-foreground'
                  )}
                >
                  {date.getDate()}
                </span>
                {list.length > 0 ? <span className="text-[10px] text-muted-foreground">{list.length}</span> : null}
              </div>
              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {list.slice(0, 3).map((task) => renderCard(task, true))}
                {list.length > 3 ? (
                  <span className="px-1 text-[10px] text-muted-foreground">还有 {list.length - 3} 项…</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  compact: boolean
  dragging: boolean
  highlight: boolean
  onOpen: () => void
  onToggle?: () => void
  onRemove?: () => void
  onDragStart: (event: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
}

function TaskCard({
  task,
  compact,
  dragging,
  highlight,
  onOpen,
  onToggle,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: TaskCardProps): JSX.Element {
  const done = task.status === 'done'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={(event) => {
        // 避免点击卡片时冒泡触发日期块的选择
        event.stopPropagation()
        onOpen()
      }}
      className={cn(
        'group cursor-grab rounded-xl border px-2 py-1.5 text-left transition-all active:cursor-grabbing',
        task.isPriority ? 'border-danger/60 bg-danger/10' : 'border-border/70 bg-muted/30 hover:border-primary/40',
        dragging && 'opacity-40',
        highlight && 'ring-1 ring-primary/60',
        done && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        {task.isPriority ? <Star className="h-3 w-3 shrink-0 fill-danger text-danger" /> : null}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{timeOf(task) || '全天'}</span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[11px] font-medium',
            task.isPriority ? 'text-danger' : 'text-foreground',
            done && 'line-through'
          )}
        >
          {task.title}
        </span>
        {onToggle ? (
          <button
            type="button"
            title={done ? '标记为未完成' : '标记完成'}
            aria-label={done ? '标记为未完成' : '标记完成'}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
              done
                ? 'border-success bg-success/25 text-success'
                : 'border-border text-transparent hover:border-success hover:bg-success/15 hover:text-success'
            )}
          >
            <Check className="h-2.5 w-2.5" />
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            title="删除任务"
            aria-label="删除任务"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground/60 transition-all hover:border-danger hover:bg-danger/15 hover:text-danger"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </div>
      {!compact && (task.projectName || task.status !== 'todo') ? (
        <div className="mt-1 flex items-center gap-1.5 pl-4">
          {task.projectName ? (
            <span className="truncate text-[10px] text-muted-foreground">{task.projectName}</span>
          ) : null}
          {task.status !== 'todo' ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">{TASK_STATUS_META[task.status].label}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface UnscheduledPanelProps {
  tasks: Task[]
  draggingId: number | null
  onOpen: (task: Task) => void
  onDragStart: (task: Task) => (event: React.DragEvent) => void
  onDragEnd: () => void
}

function UnscheduledPanel({ tasks, draggingId, onOpen, onDragStart, onDragEnd }: UnscheduledPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/10 p-3">
      <div className="flex items-center gap-1.5">
        <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">未排期任务</p>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tasks.length}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">拖到任意日期即可排期（保留 09:00 默认时间）</p>
      <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-2 py-6 text-center text-[10px] text-muted-foreground">
            全部任务都已排期
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={onDragStart(task)}
              onDragEnd={onDragEnd}
              onClick={() => onOpen(task)}
              className={cn(
                'cursor-grab rounded-xl border px-2 py-1.5 active:cursor-grabbing',
                task.isPriority ? 'border-danger/60 bg-danger/10' : 'border-border/70 bg-muted/30',
                draggingId === task.id && 'opacity-40'
              )}
            >
              <div className="flex items-center gap-1.5">
                <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span
                  className={cn('truncate text-[11px] font-medium', task.isPriority ? 'text-danger' : 'text-foreground')}
                >
                  {task.title}
                </span>
              </div>
              <p className="mt-0.5 pl-4 text-[10px] text-muted-foreground">{relativeDay(task.dueAt)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
