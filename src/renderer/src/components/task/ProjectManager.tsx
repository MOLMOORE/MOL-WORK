import { useEffect, useState } from 'react'
import { FolderKanban, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Project, ProjectInput, ProjectKind } from '@shared/types/domain'
import { PROJECT_KIND_META } from '@shared/constants'
import { Badge, EmptyState, Spinner } from '../ui/Feedback'
import { Button, IconButton } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { ConfirmDialog, Modal } from '../ui/Overlay'
import { useAppStore } from '../../stores/appStore'
import { useTaskStore } from '../../stores/taskStore'
import { cn } from '../../lib/utils'

const COLOR_PALETTE = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#22C55E', '#06B6D4', '#EF4444', '#94A3B8']

interface DraftProject {
  id?: number
  name: string
  kind: ProjectKind
  color: string
  description: string
}

const EMPTY_DRAFT: DraftProject = { name: '', kind: 'course', color: COLOR_PALETTE[0], description: '' }

/** 项目 / 课程管理：顶栏「N 个项目」入口，可新增、编辑、删除 */
export function ProjectManager({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const projects = useTaskStore((state) => state.projects)
  const loadProjects = useTaskStore((state) => state.loadProjects)
  const saveProject = useTaskStore((state) => state.saveProject)
  const removeProject = useTaskStore((state) => state.removeProject)
  const pushToast = useAppStore((state) => state.pushToast)

  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<DraftProject | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void loadProjects().finally(() => setLoading(false))
  }, [open, loadProjects])

  useEffect(() => {
    if (!open) setDraft(null)
  }, [open])

  const startCreate = (): void => setDraft({ ...EMPTY_DRAFT })
  const startEdit = (project: Project): void =>
    setDraft({
      id: project.id,
      name: project.name,
      kind: project.kind,
      color: project.color,
      description: project.description
    })

  const submit = async (): Promise<void> => {
    if (!draft) return
    if (draft.name.trim() === '') {
      pushToast({ title: '请填写名称', tone: 'warning' })
      return
    }
    const input: ProjectInput = {
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind,
      color: draft.color,
      description: draft.description.trim()
    }
    setSubmitting(true)
    await saveProject(input)
    setSubmitting(false)
    pushToast({ title: draft.id ? '已保存修改' : '已创建', description: input.name, tone: 'success' })
    setDraft(null)
  }

  const handleRemove = async (): Promise<void> => {
    if (!removeTarget) return
    await removeProject(removeTarget.id)
    setRemoveTarget(null)
    pushToast({ title: '已删除', description: `${removeTarget.name} 下的任务将变为未归属`, tone: 'success' })
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="项目与课程"
        description="管理任务归属的项目或课程，新建后可在任务表单中选择"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            {draft ? (
              <Button variant="primary" loading={submitting} onClick={() => void submit()}>
                {draft.id ? '保存修改' : '创建'}
              </Button>
            ) : (
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={startCreate}>
                新增项目 / 课程
              </Button>
            )}
          </>
        }
      >
        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span className="text-sm">加载中…</span>
          </div>
        ) : draft ? (
          <div className="grid gap-4">
            <Field label="名称" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="例如：计算机网络、毕业设计"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="类型">
                <Select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as ProjectKind })}>
                  <option value="course">课程</option>
                  <option value="project">项目</option>
                </Select>
              </Field>
              <Field label="颜色标识">
                <div className="flex h-9 flex-wrap items-center gap-1.5">
                  {COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      onClick={() => setDraft({ ...draft, color })}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition-transform',
                        draft.color === color ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </Field>
            </div>
            <Field label="描述" hint="可选，便于后续识别">
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="补充说明、目标或备注"
              />
            </Field>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="还没有项目或课程"
            description="新建一个项目/课程后，任务可以按归属分类统计"
            action={
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={startCreate}>
                新增项目 / 课程
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{project.name}</p>
                    <Badge tone={project.kind === 'course' ? 'primary' : 'info'}>
                      {project.kind === 'course' ? <GraduationCap className="h-2.5 w-2.5" /> : <FolderKanban className="h-2.5 w-2.5" />}
                      {PROJECT_KIND_META[project.kind]}
                    </Badge>
                    {project.archived ? <Badge tone="default">已归档</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {project.taskCount ?? 0} 个任务 · 已完成 {project.doneCount ?? 0}
                    {project.description ? ` · ${project.description}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label="编辑" onClick={() => startEdit(project)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="删除" tone="danger" onClick={() => setRemoveTarget(project)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        title="删除项目 / 课程"
        description={`删除「${removeTarget?.name ?? ''}」后，其下任务不会丢失，将变为未归属。确定删除吗？`}
        confirmText="确认删除"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void handleRemove()}
      />
    </>
  )
}
