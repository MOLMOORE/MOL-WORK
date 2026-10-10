import { useEffect, useState } from 'react'
import { Clock3, RotateCcw, Trash2 } from 'lucide-react'
import type { Note } from '@shared/types/domain'
import { Badge, EmptyState, Spinner } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { ConfirmDialog, Modal } from '../ui/Overlay'
import { useAppStore } from '../../stores/appStore'
import { useNoteStore } from '../../stores/noteStore'
import { cn, formatDateTime } from '../../lib/utils'

const RETENTION_LABEL: Record<number, string> = {
  1: '一天',
  7: '一周',
  30: '一个月'
}

const KIND_LABEL: Record<string, string> = { note: '笔记', material: '资料', flashcard: '卡片' }
const KIND_TONE: Record<string, 'warning' | 'info' | 'primary'> = {
  material: 'warning',
  flashcard: 'info',
  note: 'primary'
}

/** 回收站剩余保留时间（与任务回收站同一套算法与文案） */
function remainingText(deletedAt: string, retentionDays: number): string {
  const deadline = new Date(deletedAt.replace(' ', 'T')).getTime() + retentionDays * 86400000
  const rest = deadline - Date.now()
  if (rest <= 0) return '即将清理'
  const hours = Math.floor(rest / 3600000)
  if (hours < 24) return `剩余 ${hours} 小时`
  return `剩余 ${Math.floor(hours / 24)} 天`
}

/** 一句话说明这条资料被删掉后会带走什么 */
function noteHint(note: Note): string {
  const bits: string[] = []
  if (note.pageCount > 0) bits.push(`${note.pageCount} 页`)
  if (note.readingMinutes) bits.push(`已读 ${note.readingMinutes} 分钟`)
  if (note.review) bits.push('复习计划（挂起中）')
  if (note.taskTitle) bits.push(`任务：${note.taskTitle}`)
  else if (note.projectName) bits.push(`课程：${note.projectName}`)
  return bits.join(' · ')
}

export interface NoteRecycleBinModalProps {
  open: boolean
  onClose: () => void
}

/**
 * 资料回收站（v1.2.6）：快速删除模式删掉的东西都先进这里。
 * 保留时长与任务回收站共用同一个设置项，到期由主进程定时清理器彻底删除。
 */
export function NoteRecycleBinModal({ open, onClose }: NoteRecycleBinModalProps): JSX.Element | null {
  const deleted = useNoteStore((state) => state.deleted)
  const loadDeleted = useNoteStore((state) => state.loadDeleted)
  const restoreNote = useNoteStore((state) => state.restoreNote)
  const purgeNote = useNoteStore((state) => state.purgeNote)
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
    pushToast({
      title: '保留时长已更新',
      description: `删除的资料与笔记将保留 ${RETENTION_LABEL[days] ?? `${days} 天`}`,
      tone: 'success'
    })
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void loadDeleted().finally(() => setLoading(false))
  }, [open, loadDeleted])

  const handleRestore = async (id: number, title: string): Promise<void> => {
    await restoreNote(id)
    pushToast({ title: '已恢复', description: title, tone: 'success' })
  }

  const handlePurge = async (): Promise<void> => {
    if (purgeTarget === null) return
    await purgeNote(purgeTarget)
    setPurgeTarget(null)
    pushToast({ title: '已彻底删除', tone: 'success' })
  }

  const handleClearAll = async (): Promise<void> => {
    for (const note of deleted) {
      await purgeNote(note.id)
    }
    setClearAsk(false)
    pushToast({ title: '回收站已清空', tone: 'success' })
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="资料回收站"
        description={`删除的资料 / 笔记 / 卡片默认保留 ${RETENTION_LABEL[retentionDays] ?? `${retentionDays} 天`}，到期后自动彻底删除`}
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
          <span className="text-[10px] text-muted-foreground/80">
            保留期内正文、批注与阅读进度都原样保存，恢复后回到原来的位置
          </span>
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
            description="批量删除的条目先进这里，保留期内可恢复"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {deleted.map((note) => (
              <div key={note.id} className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND_TONE[note.kind] ?? 'default'}>{KIND_LABEL[note.kind] ?? '笔记'}</Badge>
                    <p className="truncate text-xs font-medium text-foreground">{note.title}</p>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{noteHint(note)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      删除于 {formatDateTime(note.deletedAt ?? null)}
                    </span>
                    <span className="text-warning">{remainingText(note.deletedAt ?? '', retentionDays)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    onClick={() => void handleRestore(note.id, note.title)}
                  >
                    恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger hover:bg-danger/15"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setPurgeTarget(note.id)}
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
        title="彻底删除"
        description="正文、批注、复习计划与书库渲染件一并清除，无法恢复"
        confirmText="彻底删除"
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => void handlePurge()}
      />

      <ConfirmDialog
        open={clearAsk}
        title="清空回收站"
        description={`将彻底删除回收站中的 ${deleted.length} 条资料，无法恢复。确定继续吗？`}
        confirmText="全部彻底删除"
        onCancel={() => setClearAsk(false)}
        onConfirm={() => void handleClearAll()}
      />
    </>
  )
}