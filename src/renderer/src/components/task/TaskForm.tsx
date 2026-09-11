import { useEffect, useState } from 'react'
import type { Priority, Task, TaskInput, TaskStatus } from '@shared/types/domain'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Modal } from '../ui/Overlay'
import { useTaskStore } from '../../stores/taskStore'
import { useAppStore } from '../../stores/appStore'
import { fromDatetimeLocal, toDatetimeLocal } from '../../lib/utils'

export interface TaskFormProps {
  open: boolean
  onClose: () => void
  initial?: Task | null
  defaultProjectId?: number | null
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: '待开始' },
  { value: 'doing', label: '进行中' },
  { value: 'blocked', label: '受阻' },
  { value: 'done', label: '已完成' }
]

export function TaskForm({ open, onClose, initial, defaultProjectId }: TaskFormProps): JSX.Element | null {
  const projects = useTaskStore((state) => state.projects)
  const createTask = useTaskStore((state) => state.createTask)
  const updateTask = useTaskStore((state) => state.updateTask)
  const pushToast = useAppStore((state) => state.pushToast)

  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<Priority>(2)
  const [dueAt, setDueAt] = useState('')
  const [estimate, setEstimate] = useState(60)
  const [progress, setProgress] = useState(0)
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setTitle(initial.title)
      setDetail(initial.detail)
      setProjectId(initial.projectId === null ? '' : String(initial.projectId))
      setStatus(initial.status)
      setPriority(initial.priority)
      setDueAt(toDatetimeLocal(initial.dueAt))
      setEstimate(initial.estimateMinutes)
      setProgress(initial.progress)
      setTags(initial.tags.join(','))
    } else {
      setTitle('')
      setDetail('')
      setProjectId(defaultProjectId == null ? '' : String(defaultProjectId))
      setStatus('todo')
      setPriority(2)
      setDueAt('')
      setEstimate(60)
      setProgress(0)
      setTags('')
    }
  }, [open, initial, defaultProjectId])

  const submit = async (): Promise<void> => {
    if (title.trim() === '') {
      pushToast({ title: '请填写任务标题', tone: 'warning' })
      return
    }
    const payload: TaskInput = {
      title: title.trim(),
      detail,
      projectId: projectId === '' ? null : Number(projectId),
      status,
      priority,
      dueAt: fromDatetimeLocal(dueAt),
      estimateMinutes: estimate,
      progress,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    }

    setSubmitting(true)
    if (initial) {
      await updateTask(initial.id, payload)
      pushToast({ title: '任务已更新', description: payload.title, tone: 'success' })
    } else {
      await createTask(payload)
      pushToast({ title: '任务已创建', description: payload.title, tone: 'success' })
    }
    setSubmitting(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '编辑任务' : '新建任务'}
      description="任务会自动关联日程、提醒、笔记与专注记录"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {initial ? '保存修改' : '创建任务'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="任务标题" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成 TCP 拥塞控制章节习题" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="所属项目 / 课程">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">未归属</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="优先级">
            <Select value={String(priority)} onChange={(event) => setPriority(Number(event.target.value) as Priority)}>
              <option value="1">高</option>
              <option value="2">中</option>
              <option value="3">低</option>
            </Select>
          </Field>
          <Field label="截止时间">
            <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
          <Field label="预计耗时（分钟）">
            <Input
              type="number"
              min={0}
              step={5}
              value={estimate}
              onChange={(event) => setEstimate(Number(event.target.value))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={`当前进度：${progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(event) => setProgress(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#6366F1]"
            />
          </Field>
          <Field label="标签" hint="多个标签用英文逗号分隔">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="TCP,习题" />
          </Field>
        </div>

        <Field label="任务说明">
          <Textarea
            rows={4}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="补充完成标准、参考资料或拆解步骤，便于后续复盘"
          />
        </Field>
      </div>
    </Modal>
  )
}
