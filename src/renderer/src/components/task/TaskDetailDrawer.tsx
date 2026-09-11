import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Check, Clock, FileText, Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Task, TaskInput, TaskStatus } from '@shared/types/domain'
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
import { cn, fromDatetimeLocal, formatMinutes, toDatetimeLocal } from '../../lib/utils'

type TabKey = 'schedule' | 'reminder' | 'notes' | 'focus' | 'review'

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']

interface EditableTagRowProps {
  task: Task
  dueReviewCount: number
  onPatch: (payload: Partial<TaskInput>) => Promise<void>
  onJump: (tab: TabKey) => void
}

/** 详情抽屉的 tag 行：状态/类型/预计耗时/标签可直接点击修改，统计 tag 点击跳转对应页签 */
function EditableTagRow({ task, dueReviewCount, onPatch, onJump }: EditableTagRowProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [statusMenu, setStatusMenu] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [addingTag, setAddingTag] = useState(false)

  const saveTags = async (tags: string[]): Promise<void> => {
    const unique = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
    await onPatch({ tags: unique })
    pushToast({ title: '标签已更新', tone: 'success' })
  }

  const commitEstimate = async (): Promise<void> => {
    const minutes = Math.max(0, Math.round(Number(estimateDraft)))
    setEditingEstimate(false)
    if (!Number.isFinite(minutes) || minutes === task.estimateMinutes) return
    await onPatch({ estimateMinutes: minutes })
    pushToast({ title: `预计耗时已更新为 ${formatMinutes(minutes)}`, tone: 'success' })
  }

  const commitTag = async (original: string): Promise<void> => {
    const next = tagDraft.trim()
    setEditingTag(null)
    if (next === original) return
    if (next === '') {
      await saveTags(task.tags.filter((tag) => tag !== original))
      return
    }
    await saveTags(task.tags.map((tag) => (tag === original ? next : tag)))
  }

  const addTag = async (): Promise<void> => {
    const next = tagDraft.trim()
    setAddingTag(false)
    setTagDraft('')
    if (next === '' || task.tags.includes(next)) return
    await saveTags([...task.tags, next])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 状态：点击弹出菜单直接修改 */}
      <span className="relative inline-flex">
        <button
          type="button"
          title="点击修改状态"
          onClick={() => setStatusMenu((value) => !value)}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-medium leading-none text-[#A5B4FC] transition-colors hover:bg-primary/25"
        >
          {TASK_STATUS_META[task.status].label}
          <Pencil className="h-2.5 w-2.5 opacity-70" />
        </button>
        {statusMenu ? (
          <>
            <button type="button" aria-label="关闭" className="fixed inset-0 z-40 cursor-default" onClick={() => setStatusMenu(false)} />
            <span className="absolute left-0 top-7 z-50 flex w-32 flex-col overflow-hidden rounded-xl border border-border/80 bg-surface/95 shadow-2xl backdrop-blur-xl animate-scale-in">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusMenu(false)
                    if (status !== task.status) void onPatch({ status })
                  }}
                  className={cn(
                    'flex items-center justify-between px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/60',
                    status === task.status ? 'text-[#A5B4FC]' : 'text-foreground'
                  )}
                >
                  {TASK_STATUS_META[status].label}
                  {status === task.status ? <Check className="h-3 w-3" /> : null}
                </button>
              ))}
            </span>
          </>
        ) : null}
      </span>

      {/* 事项类型：点击直接切换 优先/普通 */}
      <button
        type="button"
        title="点击切换优先事项"
        onClick={() => void onPatch({ isPriority: !task.isPriority })}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none transition-colors',
          task.isPriority
            ? 'border-danger/40 bg-danger/15 text-[#FCA5A5] hover:bg-danger/25'
            : 'border-border bg-muted text-muted-foreground hover:text-foreground'
        )}
      >
        {task.isPriority ? '优先事项' : '普通事项'}
        <Pencil className="h-2.5 w-2.5 opacity-70" />
      </button>

      {/* 预计耗时：点击内联编辑 */}
      {editingEstimate ? (
        <input
          autoFocus
          type="number"
          min={0}
          step={5}
          value={estimateDraft}
          onChange={(event) => setEstimateDraft(event.target.value)}
          onBlur={() => void commitEstimate()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitEstimate()
            if (event.key === 'Escape') setEditingEstimate(false)
          }}
          className="h-6 w-24 rounded-full border border-info/60 bg-background/70 px-2 text-[11px] text-foreground focus:outline-none"
        />
      ) : (
        <button
          type="button"
          title="点击修改预计耗时"
          onClick={() => {
            setEstimateDraft(String(task.estimateMinutes))
            setEditingEstimate(true)
          }}
          className="inline-flex items-center gap-1 rounded-full border border-info/40 bg-info/15 px-2 py-0.5 text-[11px] font-medium leading-none text-[#67E8F9] transition-colors hover:bg-info/25"
        >
          预计 {formatMinutes(task.estimateMinutes)}
          <Pencil className="h-2.5 w-2.5 opacity-70" />
        </button>
      )}

      {/* 统计 tag：点击跳转对应页签 */}
      <button type="button" onClick={() => onJump('focus')} title="查看专注记录" className="transition-opacity hover:opacity-80">
        <Badge tone="success">已投入 {formatMinutes(task.focusMinutes ?? 0)}</Badge>
      </button>
      <button type="button" onClick={() => onJump('notes')} title="查看笔记资料" className="transition-opacity hover:opacity-80">
        <Badge tone="default">笔记 {task.noteCount ?? 0}</Badge>
      </button>
      <button type="button" onClick={() => onJump('schedule')} title="查看日程" className="transition-opacity hover:opacity-80">
        <Badge tone="default">日程 {task.scheduleCount ?? 0}</Badge>
      </button>
      <button type="button" onClick={() => onJump('review')} title="查看复习" className="transition-opacity hover:opacity-80">
        <Badge tone={dueReviewCount > 0 ? 'danger' : 'default'}>待复习 {dueReviewCount}</Badge>
      </button>

      {/* 标签：点击编辑文本，悬停可删除 */}
      {task.tags.map((tag) =>
        editingTag === tag ? (
          <input
            key={tag}
            autoFocus
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={() => void commitTag(tag)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commitTag(tag)
              if (event.key === 'Escape') setEditingTag(null)
            }}
            className="h-6 w-24 rounded-full border border-warning/60 bg-background/70 px-2 text-[11px] text-foreground focus:outline-none"
          />
        ) : (
          <span key={tag} className="group/tag relative inline-flex items-center">
            <button
              type="button"
              title="点击编辑标签"
              onClick={() => {
                setEditingTag(tag)
                setTagDraft(tag)
              }}
              className="inline-flex items-center rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[11px] font-medium leading-none text-[#FCD34D] transition-colors hover:bg-warning/25"
            >
              #{tag}
            </button>
            <button
              type="button"
              title="删除标签"
              aria-label={`删除标签 ${tag}`}
              onClick={() => void saveTags(task.tags.filter((item) => item !== tag))}
              className="absolute -right-1.5 -top-1.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full border border-danger/50 bg-surface text-danger group-hover/tag:flex"
            >
              <X className="h-2 w-2" />
            </button>
          </span>
        )
      )}

      {addingTag ? (
        <input
          autoFocus
          value={tagDraft}
          placeholder="新标签"
          onChange={(event) => setTagDraft(event.target.value)}
          onBlur={() => void addTag()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void addTag()
            if (event.key === 'Escape') setAddingTag(false)
          }}
          className="h-6 w-24 rounded-full border border-warning/60 bg-background/70 px-2 text-[11px] text-foreground focus:outline-none"
        />
      ) : (
        <button
          type="button"
          title="添加标签"
          onClick={() => {
            setTagDraft('')
            setAddingTag(true)
          }}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-warning/60 hover:text-foreground"
        >
          <Plus className="h-2.5 w-2.5" />
          标签
        </button>
      )}
    </div>
  )
}

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

              <EditableTagRow
                task={task}
                dueReviewCount={dueReviewCount}
                onPatch={patch}
                onJump={(next) => setTab(next)}
              />

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
