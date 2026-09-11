import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarCheck, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Sparkles, Trash2 } from 'lucide-react'
import type { ScheduleEvent } from '@shared/types/domain'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Tabs } from '../components/ui/Tabs'
import { ConfirmDialog, Modal } from '../components/ui/Overlay'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { MonthGrid, WeekGrid } from '../components/calendar/CalendarGrid'
import { ReviewQueue } from '../components/review/ReviewQueue'
import { useScheduleStore } from '../stores/scheduleStore'
import { useAppStore } from '../stores/appStore'
import { EVENT_TYPE_META } from '@shared/constants'
import { addDays, dateKey, formatDay, formatTime, todayKey } from '../lib/utils'

export function CalendarPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    events,
    reviews,
    pendingTasks,
    view,
    selectedDay,
    loading,
    loadRange,
    loadReviews,
    loadPending,
    setView,
    setSelectedDay,
    createEvent,
    removeEvent,
    planTask,
    gradeReview,
    planReview,
    enqueueReviews,
    deferReviews
  } = useScheduleStore()
  const pushToast = useAppStore((state) => state.pushToast)
  const refreshOverview = useAppStore((state) => state.refreshOverview)

  const [anchor, setAnchor] = useState(() => new Date())
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleEvent | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'task' | 'review' | 'reminder'>('task')
  const [start, setStart] = useState(`${todayKey()}T09:00`)
  const [minutes, setMinutes] = useState(60)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const from = dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
    const to = dateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0))
    void loadRange(from, to)
    void loadReviews()
    void loadPending()
  }, [anchor, loadRange, loadReviews, loadPending])

  useEffect(() => {
    const state = location.state as { eventId?: number } | null
    if (state?.eventId) {
      const event = events.find((item) => item.id === state.eventId)
      if (event) setSelectedDay(event.startAt.slice(0, 10))
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, events, navigate, location.pathname, setSelectedDay])

  const dayEvents = useMemo(
    () => events.filter((event) => event.startAt.slice(0, 10) === selectedDay).sort((a, b) => (a.startAt < b.startAt ? -1 : 1)),
    [events, selectedDay]
  )

  const dueReviews = useMemo(
    () => reviews.filter((item) => item.status === 'active' && item.dueAt <= `${selectedDay}T23:59:59`),
    [reviews, selectedDay]
  )

  const monthLabel =
    view === 'dayGridMonth'
      ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
      : `${dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() + 6) % 7)))} ~ ${dateKey(
          new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() + 6) % 7) + 6)
        )}`

  const shift = (direction: number): void => {
    const step = view === 'dayGridMonth' ? 1 : 7
    setAnchor((current) =>
      view === 'dayGridMonth'
        ? new Date(current.getFullYear(), current.getMonth() + direction * step, 1)
        : addDays(current, direction * step)
    )
  }

  const handleCreate = async (): Promise<void> => {
    if (title.trim() === '') {
      pushToast({ title: '请填写事件标题', tone: 'warning' })
      return
    }
    setBusy(true)
    const startAt = `${start}:00`
    const endAt = `${start}:00`.replace(
      /T(\d{2}):(\d{2}):00$/,
      (_match, hour: string, minute: string) => {
        const total = Number(hour) * 60 + Number(minute) + minutes
        return `T${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
      }
    )
    await createEvent({ title: title.trim(), type, startAt, endAt, reminderAt: startAt, note })
    setBusy(false)
    setFormOpen(false)
    setTitle('')
    setNote('')
    pushToast({ title: '日程已创建', description: `提醒时间 ${start.replace('T', ' ')}`, tone: 'success' })
  }

  const handleEnqueueTomorrow = async (): Promise<void> => {
    const tomorrow = formatDay(addDays(new Date(), 1).toISOString())
    const created = await enqueueReviews(tomorrow)
    await refreshOverview()
    pushToast({
      title: created > 0 ? `已排入 ${created} 条复习到 ${tomorrow}` : '明天没有需要新增排程的复习',
      tone: created > 0 ? 'success' : 'info'
    })
  }

  const handleDefer = async (): Promise<void> => {
    const moved = await deferReviews()
    await refreshOverview()
    pushToast({ title: moved > 0 ? `已将 ${moved} 项复习顺延到次日` : '今天没有需顺延的复习', tone: 'info' })
  }

  const handleGrade = async (id: number, rating: 0 | 1 | 2 | 3): Promise<void> => {
    const review = await gradeReview(id, rating)
    await loadRange(dateKey(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), dateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)))
    await refreshOverview()
    pushToast({ title: '复习已评分', description: `下次复习 ${review.dueAt.replace('T', ' ').slice(0, 16)}`, tone: 'success' })
  }

  const handlePlanReview = async (id: number): Promise<void> => {
    await planReview(id, selectedDay)
    pushToast({ title: `已排入 ${selectedDay}`, tone: 'success' })
  }

  const handlePlanTask = async (taskId: number): Promise<void> => {
    await planTask(taskId, `${selectedDay}T09:00:00`, 60)
    pushToast({ title: `任务已排入 ${selectedDay} 09:00`, tone: 'success' })
  }

  return (
    <div className="grid gap-5">
      <Card>
        <SectionHeader
          title={monthLabel}
          description="点击日期查看当天安排，事件到点会触发系统通知"
          action={
            <>
              <Tabs
                size="sm"
                value={view}
                onChange={(key) => setView(key as 'dayGridMonth' | 'timeGridWeek')}
                items={[
                  { key: 'dayGridMonth', label: '月视图', icon: <CalendarDays className="h-3 w-3" /> },
                  { key: 'timeGridWeek', label: '周视图', icon: <CalendarCheck className="h-3 w-3" /> }
                ]}
              />
              <IconButton label="上一页" onClick={() => shift(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
                今天
              </Button>
              <IconButton label="下一页" onClick={() => shift(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
              <Button size="sm" variant="primary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setFormOpen(true)}>
                新建日程
              </Button>
            </>
          }
        />

        {loading ? (
          <div className="flex h-[320px] items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span className="text-xs">加载日程…</span>
          </div>
        ) : view === 'dayGridMonth' ? (
          <MonthGrid
            anchor={anchor}
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenEvent={(event) => {
              setSelectedDay(event.startAt.slice(0, 10))
              setDeleteTarget(event)
            }}
          />
        ) : (
          <WeekGrid
            anchor={anchor}
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenEvent={(event) => setDeleteTarget(event)}
          />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <SectionHeader
            title={`${selectedDay} 安排`}
            description={`共 ${dayEvents.length} 项事件`}
            action={
              <>
                <Button size="sm" variant="outline" onClick={handleEnqueueTomorrow}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  复习排入明日
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDefer}>
                  顺延到今天之后
                </Button>
              </>
            }
          />
          {dayEvents.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="这一天还没有安排" description="从右侧待排任务列表点击「排入本日」即可加入日程" />
          ) : (
            <div className="flex flex-col gap-2">
              {dayEvents.map((event) => {
                const meta = EVENT_TYPE_META[event.type]
                return (
                  <div key={event.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 p-3">
                    <span className="h-8 w-1 rounded-full" style={{ background: meta.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{event.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatTime(event.startAt)} → {formatTime(event.endAt)} · {meta.label}
                        {event.reminderAt ? ` · 提醒 ${formatTime(event.reminderAt)}` : ''}
                      </p>
                    </div>
                    <Badge tone={event.reminded ? 'default' : 'warning'}>{event.reminded ? '已提醒' : '待提醒'}</Badge>
                    <IconButton label="删除事件" tone="danger" onClick={() => setDeleteTarget(event)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader title="当日到期复习" description={`${dueReviews.length} 条内容需要按遗忘曲线复习`} />
            <ReviewQueue
              items={dueReviews}
              onGrade={handleGrade}
              onPlanTomorrow={handlePlanReview}
              compact
              emptyHint="该日期没有到期的复习内容"
            />
          </Card>

          <Card>
            <SectionHeader title="待排任务" description="点击排入所选日期，便于按计划推进" />
            {pendingTasks.length === 0 ? (
              <EmptyState icon={<CalendarPlus className="h-5 w-5" />} title="所有任务都已排期" description="新建任务后会出现在这里，可一键排入日历" />
            ) : (
              <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
                {pendingTasks.slice(0, 12).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground">{task.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {task.projectName ?? '未归属'} · 预计 {task.estimateMinutes || 60} 分钟
                      </p>
                    </div>
                    <Button size="xs" variant="secondary" onClick={() => void handlePlanTask(task.id)}>
                      排入本日
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="新建日程"
        description="创建后可到点触发系统通知提醒"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={busy} onClick={handleCreate}>
              创建日程
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="事件标题" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：复习红黑树旋转" />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="事件类型">
              <Select value={type} onChange={(event) => setType(event.target.value as 'task' | 'review' | 'reminder')}>
                <option value="task">任务</option>
                <option value="review">复习</option>
                <option value="reminder">提醒</option>
              </Select>
            </Field>
            <Field label="开始时间">
              <Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label="时长（分钟）">
              <Input type="number" min={10} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
            </Field>
          </div>
          <Field label="备注">
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充说明或关联内容" />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除日程事件"
        description={deleteTarget ? `将删除「${deleteTarget.title}」，删除后不再触发提醒。` : ''}
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await removeEvent(deleteTarget.id)
          setDeleteTarget(null)
          pushToast({ title: '日程已删除', tone: 'success' })
        }}
      />
    </div>
  )
}
