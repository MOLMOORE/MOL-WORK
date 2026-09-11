import type { ScheduleEvent } from '@shared/types/domain'
import { EVENT_TYPE_META } from '@shared/constants'
import { cn, dateKey, formatTime } from '../../lib/utils'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function buildMonthMatrix(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function buildWeekDays(anchor: Date): Date[] {
  const offset = (anchor.getDay() + 6) % 7
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

export interface MonthGridProps {
  anchor: Date
  events: ScheduleEvent[]
  selectedDay: string
  onSelectDay: (day: string) => void
  onOpenEvent: (event: ScheduleEvent) => void
}

export function MonthGrid({ anchor, events, selectedDay, onSelectDay, onOpenEvent }: MonthGridProps): JSX.Element {
  const matrix = buildMonthMatrix(anchor)
  const today = dateKey(new Date())

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      <div className="grid grid-cols-7 border-b border-border/70 bg-muted/30">
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">
            周{day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {matrix.map((day) => {
          const key = dateKey(day)
          const inMonth = day.getMonth() === anchor.getMonth()
          const dayEvents = events.filter((event) => event.startAt.slice(0, 10) === key)
          const isSelected = key === selectedDay
          const isToday = key === today
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              className={cn(
                'group flex min-h-[112px] flex-col gap-1 border-b border-r border-border/50 p-2 text-left transition-colors',
                !inMonth && 'bg-muted/10 opacity-60',
                isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/30'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[11px] font-medium',
                    isToday
                      ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white'
                      : inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 ? <span className="text-[10px] text-muted-foreground">{dayEvents.length}</span> : null}
              </div>

              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => {
                  const meta = EVENT_TYPE_META[event.type]
                  return (
                    <span
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation()
                        onOpenEvent(event)
                      }}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter') onOpenEvent(event)
                      }}
                      className="flex items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] transition-transform hover:scale-[1.02]"
                      style={{ borderColor: `${meta.color}66`, background: `${meta.color}22`, color: meta.color }}
                    >
                      <span className="truncate">{event.title}</span>
                    </span>
                  )
                })}
                {dayEvents.length > 3 ? (
                  <span className="text-[10px] text-muted-foreground">还有 {dayEvents.length - 3} 项…</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface WeekGridProps {
  anchor: Date
  events: ScheduleEvent[]
  selectedDay: string
  onSelectDay: (day: string) => void
  onOpenEvent: (event: ScheduleEvent) => void
}

export function WeekGrid({ anchor, events, selectedDay, onSelectDay, onOpenEvent }: WeekGridProps): JSX.Element {
  const days = buildWeekDays(anchor)
  const today = dateKey(new Date())

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const key = dateKey(day)
        const dayEvents = events
          .filter((event) => event.startAt.slice(0, 10) === key)
          .sort((a, b) => (a.startAt < b.startAt ? -1 : 1))
        const isSelected = key === selectedDay
        const isToday = key === today
        return (
          <div
            key={key}
            className={cn(
              'flex min-h-[420px] flex-col gap-2 rounded-2xl border p-3 transition-colors',
              isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/15 hover:bg-muted/25'
            )}
          >
            <button type="button" onClick={() => onSelectDay(key)} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                周{WEEKDAYS[(day.getDay() + 6) % 7]}
              </span>
              <span
                className={cn(
                  'flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-semibold',
                  isToday ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white' : 'text-foreground'
                )}
              >
                {day.getDate()}
              </span>
            </button>

            <div className="flex flex-1 flex-col gap-1.5">
              {dayEvents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-[10px] text-muted-foreground">
                  空闲
                </p>
              ) : (
                dayEvents.map((event) => {
                  const meta = EVENT_TYPE_META[event.type]
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onOpenEvent(event)}
                      className="rounded-lg border px-2 py-1.5 text-left transition-transform hover:scale-[1.02]"
                      style={{ borderColor: `${meta.color}66`, background: `${meta.color}1f` }}
                    >
                      <p className="text-[10px] font-medium" style={{ color: meta.color }}>
                        {formatTime(event.startAt)} · {meta.label}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{event.title}</p>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
