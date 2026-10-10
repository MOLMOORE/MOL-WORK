import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarPlus, Check, Clock, FileText, Pencil, Play, Plus, Square, Trash2, X } from 'lucide-react'
import type { TaskDetail } from '@shared/types/domain'
import { Badge, EmptyState } from '../ui/Feedback'
import { Button, IconButton } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Field'
import { ReviewQueue } from '../review/ReviewQueue'
import { api } from '../../lib/ipc'
import { useAppStore } from '../../stores/appStore'
import { useNoteStore } from '../../stores/noteStore'
import { formatDateTime, formatMinutes, addDays, formatDay, fromDatetimeLocal, todayKey } from '../../lib/utils'

export interface PanelProps {
  detail: TaskDetail
  onRefresh: () => Promise<void>
}

export function SchedulePanel({ detail, onRefresh }: PanelProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const planToday = async (): Promise<void> => {
    const start = `${todayKey()}T${String(new Date().getHours() + 1).padStart(2, '0')}:00:00`
    await api.schedule.planTask(detail.task.id, start, detail.task.estimateMinutes || 60)
    await onRefresh()
    pushToast({ title: '已排入今日日程', tone: 'success' })
  }
  const planTomorrow = async (): Promise<void> => {
    const day = formatDay(addDays(new Date(), 1).toISOString())
    await api.schedule.planTask(detail.task.id, `${day}T09:00:00`, detail.task.estimateMinutes || 60)
    await onRefresh()
    pushToast({ title: '已排入明日日程', tone: 'success' })
  }
  const remove = async (id: number): Promise<void> => {
    await api.schedule.remove(id)
    await onRefresh()
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Button size="sm" variant="primary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={planToday}>
          排入今日
        </Button>
        <Button size="sm" variant="secondary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={planTomorrow}>
          排入明日
        </Button>
      </div>
      {detail.schedules.length === 0 ? (
        <EmptyState icon={<CalendarPlus className="h-5 w-5" />} title="尚未排入日程" description="排入后到点会自动弹出系统通知提醒" />
      ) : (
        detail.schedules.map((event) => (
          <div key={event.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3">
            <Badge tone={event.type === 'review' ? 'info' : 'primary'}>{event.type === 'review' ? '复习' : '任务'}</Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground">{event.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDateTime(event.startAt)} → {formatDateTime(event.endAt).slice(11)}
              </p>
            </div>
            <IconButton label="删除日程" tone="danger" onClick={() => void remove(event.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ))
      )}
    </div>
  )
}

/** 提醒面板：支持在此实时新建、修改、删除提醒（修改后自动重置为待提醒） */
export function ReminderPanel({ detail, onRefresh }: PanelProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [addOpen, setAddOpen] = useState(false)
  const [addAt, setAddAt] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editAt, setEditAt] = useState('')

  const task = detail.task
  const withReminder = detail.schedules.filter((event) => event.reminderAt)

  const create = async (): Promise<void> => {
    const iso = fromDatetimeLocal(addAt)
    if (!iso) {
      pushToast({ title: '请选择提醒时间', tone: 'warning' })
      return
    }
    await api.schedule.create({
      taskId: task.id,
      title: `提醒：${task.title}`,
      type: 'reminder',
      startAt: iso,
      endAt: iso,
      reminderAt: iso
    })
    setAddOpen(false)
    setAddAt('')
    await onRefresh()
    pushToast({ title: '提醒已创建', description: formatDateTime(iso), tone: 'success' })
  }

  const saveEdit = async (id: number): Promise<void> => {
    const iso = fromDatetimeLocal(editAt)
    if (!iso) {
      pushToast({ title: '请选择有效的提醒时间', tone: 'warning' })
      return
    }
    await api.schedule.update(id, { startAt: iso, endAt: iso, reminderAt: iso })
    setEditingId(null)
    await onRefresh()
    pushToast({ title: '提醒时间已更新', description: `${formatDateTime(iso)} · 将重新提醒`, tone: 'success' })
  }

  const remove = async (id: number): Promise<void> => {
    await api.schedule.remove(id)
    await onRefresh()
    pushToast({ title: '提醒已删除', tone: 'success' })
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">到点会弹出系统通知，可在此实时新建或调整提醒时间</p>
        {addOpen ? (
          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setAddOpen(false)}>
            取消
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
            新建提醒
          </Button>
        )}
      </div>

      {addOpen ? (
        <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <Field label="提醒时间" required>
            <Input type="datetime-local" value={addAt} onChange={(event) => setAddAt(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void create()}>
              创建提醒
            </Button>
          </div>
        </div>
      ) : null}

      {withReminder.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="没有设置提醒"
          description="点击「新建提醒」实时添加，排入日程时也会按提前量自动创建"
        />
      ) : (
        withReminder.map((event) => (
          <div key={event.id} className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="flex items-center gap-3">
              <Bell className={event.reminded ? 'h-3.5 w-3.5 shrink-0 text-muted-foreground' : 'h-3.5 w-3.5 shrink-0 text-warning'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{event.title}</p>
                {editingId === event.id ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">修改提醒时间</p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">提醒时间：{formatDateTime(event.reminderAt)}</p>
                )}
              </div>
              {editingId === event.id ? null : (
                <Badge tone={event.reminded ? 'default' : 'warning'}>{event.reminded ? '已提醒' : '待提醒'}</Badge>
              )}
              <div className="flex shrink-0 items-center gap-1">
                {editingId === event.id ? (
                  <>
                    <IconButton label="保存" onClick={() => void saveEdit(event.id)}>
                      <Check className="h-3.5 w-3.5 text-success" />
                    </IconButton>
                    <IconButton label="取消" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <IconButton
                      label="修改提醒时间"
                      onClick={() => {
                        setEditingId(event.id)
                        setEditAt(toDatetimeLocalValue(event.reminderAt))
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="删除提醒" tone="danger" onClick={() => void remove(event.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </>
                )}
              </div>
            </div>

            {editingId === event.id ? (
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  autoFocus
                  type="datetime-local"
                  value={editAt}
                  onChange={(e) => setEditAt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveEdit(event.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-8 flex-1 rounded-lg border border-border bg-input/60 px-2 text-xs text-foreground focus:outline-none"
                />
                <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void saveEdit(event.id)}>
                  保存
                </Button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  )
}

function toDatetimeLocalValue(value: string | null): string {
  return (value ?? '').slice(0, 16)
}

export function NotesPanel({ detail, onRefresh }: PanelProps): JSX.Element {
  const navigate = useNavigate()
  const pushToast = useAppStore((state) => state.pushToast)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [open, setOpen] = useState(false)

  const create = async (): Promise<void> => {
    if (title.trim() === '') {
      pushToast({ title: '请填写笔记标题', tone: 'warning' })
      return
    }
    await api.note.save({ taskId: detail.task.id, title: title.trim(), content, kind: 'note', enableReview: true })
    setTitle('')
    setContent('')
    setOpen(false)
    await onRefresh()
    pushToast({ title: '笔记已保存', description: '已自动加入遗忘曲线复习计划', tone: 'success' })
  }

  return (
    <div className="grid gap-3">
      {open ? (
        <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <Field label="笔记标题" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：TCP 拥塞控制四阶段" />
          </Field>
          <Field label="正文（支持 Markdown）">
            <Textarea rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="## 慢启动&#10;cwnd 从 1 个 MSS 开始…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button size="sm" variant="primary" onClick={create}>
              保存笔记
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>
          新建笔记
        </Button>
      )}

      {detail.notes.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="任务下还没有笔记" description="挂在这里的笔记与资料会按遗忘曲线复习" />
      ) : (
        detail.notes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => navigate('/notes', { state: { noteId: note.id } })}
            className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3 text-left transition-colors hover:border-primary/40"
          >
            <Badge tone={note.kind === 'material' ? 'warning' : note.kind === 'flashcard' ? 'info' : 'primary'}>
              {note.kind === 'material' ? '资料' : note.kind === 'flashcard' ? '卡片' : '笔记'}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground">{note.title}</p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                {note.content.replace(/[#>*`]/g, '').slice(0, 70) || '暂无正文'}
              </p>
            </div>
          </button>
        ))
      )}
    </div>
  )
}

export function FocusPanel({ detail, onRefresh }: PanelProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const [busy, setBusy] = useState(false)
  const active = detail.focusSessions.find((session) => session.endedAt === null)

  const start = async (): Promise<void> => {
    setBusy(true)
    await api.focus.start(detail.task.id, '任务详情页开始专注')
    await onRefresh()
    await refreshOverview()
    setBusy(false)
    pushToast({ title: '已开始专注计时', tone: 'success' })
  }

  const stop = async (): Promise<void> => {
    if (!active) return
    setBusy(true)
    const session = await api.focus.stop(active.id)
    await onRefresh()
    await refreshOverview()
    setBusy(false)
    pushToast({ title: `本次专注 ${formatMinutes(session.durationMinutes)}`, tone: 'success' })
  }

  const total = detail.focusSessions.reduce((sum, session) => sum + session.durationMinutes, 0)

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/25 p-3">
        <Clock className="h-4 w-4 text-tint-primary" />
        <div className="flex-1">
          <p className="text-xs text-foreground">累计专注 {formatMinutes(total)}</p>
          <p className="text-[11px] text-muted-foreground">{active ? '正在计时中…' : '未在计时'}</p>
        </div>
        {active ? (
          <Button size="sm" variant="danger" icon={<Square className="h-3.5 w-3.5" />} loading={busy} onClick={stop}>
            结束专注
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<Play className="h-3.5 w-3.5" />} loading={busy} onClick={start}>
            开始专注
          </Button>
        )}
      </div>

      {detail.focusSessions.length === 0 ? (
        <EmptyState icon={<Clock className="h-5 w-5" />} title="还没有专注记录" description="开始专注，用时计入投入统计" />
      ) : (
        detail.focusSessions.map((session) => (
          <div key={session.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3">
            <Badge tone={session.endedAt ? 'success' : 'warning'}>{session.endedAt ? '已完成' : '进行中'}</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground">
                {session.startedAt.replace('T', ' ').slice(5, 16)} →{' '}
                {session.endedAt ? session.endedAt.replace('T', ' ').slice(11, 16) : '进行中'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{session.note || '无备注'}</p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{formatMinutes(session.durationMinutes)}</span>
          </div>
        ))
      )}
    </div>
  )
}

export function ReviewPanel({ detail, onRefresh }: PanelProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const noteStore = useNoteStore()

  const grade = async (id: number, rating: 0 | 1 | 2 | 3): Promise<void> => {
    const review = await api.review.grade(id, rating)
    await onRefresh()
    await refreshOverview()
    pushToast({
      title: `评分完成，下次复习 ${formatDateTime(review.dueAt)}`,
      tone: 'success'
    })
  }

  const planTomorrow = async (id: number): Promise<void> => {
    const day = formatDay(addDays(new Date(), 1).toISOString())
    await api.review.plan(id, day)
    await onRefresh()
    pushToast({ title: `已排入 ${day} 日程`, tone: 'info' })
  }

  void noteStore

  return (
    <div className="grid gap-3">
      {detail.reviews.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">复习条目 {detail.reviews.length}</Badge>
          <Badge tone="default">
            已掌握 {detail.reviews.filter((item) => item.status === 'mastered').length}
          </Badge>
          <Badge tone="default">
            平均 EF{' '}
            {detail.reviews.length === 0
              ? '—'
              : (detail.reviews.reduce((sum, item) => sum + item.ease, 0) / detail.reviews.length).toFixed(2)}
          </Badge>
        </div>
      ) : null}
      <ReviewQueue items={detail.reviews} onGrade={grade} onPlanTomorrow={planTomorrow} emptyHint="该任务下暂无可复习内容" />
    </div>
  )
}
