import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Clock, FileText, Layers, Trash2 } from 'lucide-react'
import type { TaskStatus } from '@shared/types/domain'
import { Drawer, ConfirmDialog } from '../ui/Overlay'
import { Tabs } from '../ui/Tabs'
import { Badge, Progress, Spinner } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { FocusPanel, NotesPanel, ReminderPanel, ReviewPanel, SchedulePanel } from './TaskLinkedPanels'
import { TaskForm } from './TaskForm'
import { useTaskStore } from '../../stores/taskStore'
import { useAppStore } from '../../stores/appStore'
import { TASK_STATUS_META } from '@shared/constants'
import { fromDatetimeLocal, formatMinutes, toDatetimeLocal } from '../../lib/utils'

type TabKey = 'schedule' | 'reminder' | 'notes' | 'focus' | 'review'

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']

export function TaskDetailDrawer(): JSX.Element | null {
  const detail = useTaskStore((state) => state.detail)
  const loading = useTaskStore((state) => state.detailLoading)
  const closeDetail = useTaskStore((state) => state.closeDetail)
  const refreshDetail = useTaskStore((state) => state.refreshDetail)
  const updateTask = useTaskStore((state) => state.updateTask)
  const removeTask = useTaskStore((state) => state.removeTask)
  const refreshOverview = useAppStore((state) => state.refreshOverview)
  const pushToast = useAppStore((state) => state.pushToast)

  const [tab, setTab] = useState<TabKey>('schedule')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [doneAsk, setDoneAsk] = useState(false)

  useEffect(() => {
    if (detail) setTab('schedule')
  }, [detail?.task.id])

  if (!loading && !detail) return null

  const task = detail?.task
  const open = Boolean(detail) || loading

  const scheduleReviewCount = detail?.reviews.length ?? 0
  const dueReviewCount = detail?.reviews.filter((item) => item.status === 'active').length ?? 0

  const patch = async (payload: Parameters<typeof updateTask>[1]): Promise<void> => {
    if (!task) return
    await updateTask(task.id, payload)
    await refreshOverview()
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={closeDetail}
        title={task?.title ?? '加载中…'}
        subtitle={task ? `${task.projectName ?? '未归属'} · 更新于 ${task.updatedAt.replace('T', ' ').slice(5, 16)}` : ''}
        width="w-[620px]"
        footer={
          task ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                className="text-danger hover:bg-danger/15"
                onClick={() => setConfirmOpen(true)}
              >
                删除任务
              </Button>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                  编辑
                </Button>
                <Button size="sm" variant="primary" onClick={() => setDoneAsk(true)}>
                  标记完成
                </Button>
              </div>
            </>
          ) : null
        }
      >
        {loading && !task ? (
          <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span className="text-xs">加载任务详情…</span>
          </div>
        ) : null}

        {task && detail ? (
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/25 p-4">
              <div className="grid grid-cols-3 gap-3">
                <Field label="状态">
                  <Select value={task.status} onChange={(event) => void patch({ status: event.target.value as TaskStatus })}>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {TASK_STATUS_META[status].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="事项类型">
                  <Select
                    value={task.isPriority ? 'priority' : 'normal'}
                    onChange={(event) => void patch({ isPriority: event.target.value === 'priority' })}
                  >
                    <option value="normal">普通事项</option>
                    <option value="priority">优先事项</option>
                  </Select>
                </Field>
                <Field label="截止时间">
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocal(task.dueAt)}
                    onChange={(event) => void patch({ dueAt: fromDatetimeLocal(event.target.value) })}
                  />
                </Field>
              </div>

              <Field label={`进度 ${task.progress}%（拖动即时保存）`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={task.progress}
                  onChange={(event) => void patch({ progress: Number(event.target.value) })}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#6366F1]"
                />
              </Field>

              <Progress value={task.progress} tone={task.status === 'done' ? 'success' : 'primary'} />

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="primary">{TASK_STATUS_META[task.status].label}</Badge>
                {task.isPriority ? <Badge tone="danger">优先事项</Badge> : null}
                <Badge tone="info">预计 {formatMinutes(task.estimateMinutes)}</Badge>
                <Badge tone="success">已投入 {formatMinutes(task.focusMinutes ?? 0)}</Badge>
                <Badge tone="default">笔记 {task.noteCount ?? 0}</Badge>
                <Badge tone="default">日程 {task.scheduleCount ?? 0}</Badge>
                <Badge tone={dueReviewCount > 0 ? 'danger' : 'default'}>待复习 {dueReviewCount}</Badge>
                {task.tags.map((tag) => (
                  <Badge key={tag} tone="warning">
                    #{tag}
                  </Badge>
                ))}
              </div>

              {task.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{task.detail}</p> : null}
            </div>

            <Tabs
              value={tab}
              onChange={(key) => setTab(key as TabKey)}
              items={[
                { key: 'schedule', label: '日程', icon: <CalendarDays className="h-3 w-3" />, count: detail.schedules.length },
                { key: 'reminder', label: '提醒', icon: <Bell className="h-3 w-3" /> },
                { key: 'notes', label: '笔记资料', icon: <FileText className="h-3 w-3" />, count: detail.notes.length },
                { key: 'focus', label: '专注记录', icon: <Clock className="h-3 w-3" />, count: detail.focusSessions.length },
                { key: 'review', label: '复习', icon: <Layers className="h-3 w-3" />, count: scheduleReviewCount }
              ]}
            />

            <div>
              {tab === 'schedule' ? <SchedulePanel detail={detail} onRefresh={refreshDetail} /> : null}
              {tab === 'reminder' ? <ReminderPanel detail={detail} onRefresh={refreshDetail} /> : null}
              {tab === 'notes' ? <NotesPanel detail={detail} onRefresh={refreshDetail} /> : null}
              {tab === 'focus' ? <FocusPanel detail={detail} onRefresh={refreshDetail} /> : null}
              {tab === 'review' ? <ReviewPanel detail={detail} onRefresh={refreshDetail} /> : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <TaskForm open={editOpen} onClose={() => setEditOpen(false)} initial={task ?? null} />

      <ConfirmDialog
        open={confirmOpen}
        title="删除任务"
        description="任务会先移入回收站，保留期内可随时恢复；超过保留期后自动彻底删除。"
        confirmText="移入回收站"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (!task) return
          setConfirmOpen(false)
          await removeTask(task.id)
          await refreshOverview()
          pushToast({ title: '任务已移入回收站', description: task.title, tone: 'success' })
        }}
      />

      <ConfirmDialog
        open={doneAsk}
        title="标记为已完成"
        description={`确定要将「${task?.title ?? ''}」标记为已完成吗？`}
        confirmText="确认完成"
        tone="primary"
        onCancel={() => setDoneAsk(false)}
        onConfirm={async () => {
          setDoneAsk(false)
          await patch({ status: 'done' })
          pushToast({ title: '任务已完成', tone: 'success' })
        }}
      />
    </>
  )
}
