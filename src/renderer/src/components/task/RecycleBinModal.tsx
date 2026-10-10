import { useEffect, useState } from 'react'
import { Clock3, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, EmptyState, Spinner } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { ConfirmDialog, Modal } from '../ui/Overlay'
import { useAppStore } from '../../stores/appStore'
import { useTaskStore } from '../../stores/taskStore'
import { cn, formatDateTime, relativeDay } from '../../lib/utils'

const RETENTION_LABEL: Record<number, string> = {
  1: '一天',
  7: '一周',
  30: '一个月'
}

/** 计算回收站剩余保留时间文案 */
function remainingText(deletedAt: string, retentionDays: number): string {
  const deadline = new Date(deletedAt.replace(' ', 'T')).getTime() + retentionDays * 86400000
  const rest = deadline - Date.now()
  if (rest <= 0) return '即将清理'
  const hours = Math.floor(rest / 3600000)
  if (hours < 24) return `剩余 ${hours} 小时`
  return `剩余 ${Math.floor(hours / 24)} 天`
}

export function RecycleBinModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const deleted = useTaskStore((state) => state.deleted)
  const loadDeleted = useTaskStore((state) => state.loadDeleted)
  const restoreTask = useTaskStore((state) => state.restoreTask)
  const purgeTask = useTaskStore((state) => state.purgeTask)
  const pushToast = useAppStore((state) => state.pushToast)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const [loading, setLoading] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<number | null>(null)
  const [clearAsk, setClearAsk] = useState(false)

  const retentionDays = settings?.recycleBinDays ?? 7

  /** 回收站内直接切换保留时长（一天 / 一周 / 一个月） */
  const changeRetention = async (days: number): Promise<void> => {
    if (days === retentionDays) return
    await updateSettings({ recycleBinDays: days })
    pushToast({ title: '保留时长已更新', description: `删除的任务将保留 ${RETENTION_LABEL[days] ?? `${days} 天`}`, tone: 'success' })
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void loadDeleted().finally(() => setLoading(false))
  }, [open, loadDeleted])

  const handleRestore = async (id: number, title: string): Promise<void> => {
    await restoreTask(id)
    pushToast({ title: '任务已恢复', description: title, tone: 'success' })
  }

  const handlePurge = async (): Promise<void> => {
    if (purgeTarget === null) return
    await purgeTask(purgeTarget)
    setPurgeTarget(null)
    pushToast({ title: '已彻底删除', tone: 'success' })
  }

  const handleClearAll = async (): Promise<void> => {
    for (const task of deleted) {
      await purgeTask(task.id)
    }
    setClearAsk(false)
    pushToast({ title: '回收站已清空', tone: 'success' })
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="回收站"
        description={`删除的任务默认保留 ${RETENTION_LABEL[retentionDays] ?? `${retentionDays} 天`}，到期后自动彻底删除`}
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={deleted.length === 0} onClick={() => setClearAsk(true)}>
              清空回收站
            </Button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/25 p-3">
          <span className="text-[11px] font-medium text-muted-foreground">保留时长</span>
          <div className="flex items-center gap-1">
            {[1, 7, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => void changeRetention(days)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all',
                  retentionDays === days
                    ? 'border-primary/60 bg-primary/15 text-tint-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                )}
              >
                {RETENTION_LABEL[days]}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground/80">到期后自动彻底删除，也可在此手动清理</span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span className="text-sm">加载回收站…</span>
          </div>
        ) : deleted.length === 0 ? (
          <EmptyState
            icon={<Trash2 className="h-5 w-5" />}
            title="回收站是空的"
            description="删除的任务先进这里，保留期内可恢复"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {deleted.map((task) => (
              <div
                key={task.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-3',
                  task.isPriority && 'border-l-2 border-l-danger'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
                    {task.isPriority ? <Badge tone="danger">优先</Badge> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>截止 {relativeDay(task.dueAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      删除于 {formatDateTime(task.deletedAt ?? null)}
                    </span>
                    <span className="text-warning">{remainingText(task.deletedAt ?? '', retentionDays)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    onClick={() => void handleRestore(task.id, task.title)}
                  >
                    恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger hover:bg-danger/15"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setPurgeTarget(task.id)}
                  >
                    彻底删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={purgeTarget !== null}
        title="彻底删除任务"
        description="任务的日程、笔记与复习计划一并清除，无法恢复"
        confirmText="彻底删除"
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => void handlePurge()}
      />

      <ConfirmDialog
        open={clearAsk}
        title="清空回收站"
        description={`将彻底删除回收站中的 ${deleted.length} 个任务，无法恢复。确定继续吗？`}
        confirmText="全部彻底删除"
        onCancel={() => setClearAsk(false)}
        onConfirm={() => void handleClearAll()}
      />
    </>
  )
}
