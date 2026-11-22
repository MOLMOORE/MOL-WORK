import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Square,
  SquareCheckBig,
  TriangleAlert,
  X
} from 'lucide-react'
import type { DependencyId, DependencyStatus } from '@shared/types/domain'
import type { DependencyDownloadStatus } from '@shared/types/ipc'
import { DEPENDENCY_META, RECOMMENDED_DEPENDENCIES } from '@shared/constants'
import { Badge, Progress } from '../ui/Feedback'
import { Button, IconButton } from '../ui/Button'
import { api } from '../../lib/ipc'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'

interface DependencyManagerProps {
  dependencies: DependencyStatus[]
  checking: boolean
  onCheck: () => void | Promise<void>
  compact?: boolean
}

const BUSY_PHASES = new Set<DependencyDownloadStatus['phase']>([
  'resolving',
  'downloading',
  'verifying',
  'installing'
])

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatSpeed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return `${formatBytes(value)}/s`
}

export function DependencyManager({
  dependencies,
  checking,
  onCheck,
  compact = false
}: DependencyManagerProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [downloads, setDownloads] = useState<Record<string, DependencyDownloadStatus>>({})
  const [selected, setSelected] = useState<Set<DependencyId>>(
    () => new Set(RECOMMENDED_DEPENDENCIES)
  )

  useEffect(() => {
    let active = true
    void api.app
      .getDependencyDownloads()
      .then((items) => {
        if (!active) return
        setDownloads(Object.fromEntries(items.map((item) => [item.id, item])))
      })
      .catch(() => undefined)
    const off = api.onDependencyDownload((status) => {
      if (!active) return
      setDownloads((current) => ({ ...current, [status.id]: status }))
    })
    return () => {
      active = false
      off()
    }
  }, [])

  const missing = dependencies.filter((item) => !item.available)
  const busy = Object.values(downloads).some((item) => BUSY_PHASES.has(item.phase))
  const selectedMissing = missing.filter(
    (item) =>
      selected.has(item.id) && DEPENDENCY_META[item.id].installMode === 'auto'
  )

  const toggleSelected = (id: DependencyId): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runOne = async (id: DependencyId): Promise<boolean> => {
    const meta = DEPENDENCY_META[id]
    if (meta.installMode === 'guide') {
      if (meta.guideUrl) await api.app.openExternal(meta.guideUrl)
      return false
    }
    try {
      const result = await api.app.downloadDependency(id)
      setDownloads((current) => ({ ...current, [id]: result }))
      if (result.phase === 'done') {
        await onCheck()
        pushToast({
          title: `${meta.label} 已下载`,
          description:
            meta.installMode === 'installer'
              ? '请运行下载的安装包，完成后重新检测'
              : '依赖已配置，可以返回工具页使用',
          tone: 'success'
        })
        return true
      }
      if (result.phase === 'cancelled') {
        pushToast({ title: `${meta.label} 下载已取消`, tone: 'info' })
      } else if (result.phase === 'error') {
        pushToast({
          title: `${meta.label} 下载失败`,
          description: result.message,
          tone: 'danger'
        })
      }
    } catch (error) {
      pushToast({
        title: `${meta.label} 下载失败`,
        description: error instanceof Error ? error.message : String(error),
        tone: 'danger'
      })
    }
    return false
  }

  const runSelected = async (): Promise<void> => {
    for (const dependency of selectedMissing) {
      await runOne(dependency.id)
    }
  }

  const autoDependencies = useMemo(
    () => dependencies.filter((item) => DEPENDENCY_META[item.id].installMode === 'auto'),
    [dependencies]
  )

  return (
    <div className={cn('flex flex-col', compact ? 'gap-1' : 'gap-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('font-medium text-foreground', compact ? 'text-[11px]' : 'text-xs')}>
            可下载依赖
          </p>
          {!compact ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              勾选需要的便携工具，下载后自动放入软件目录并重新检测
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="primary"
            icon={<Download className="h-3 w-3" />}
            disabled={busy || selectedMissing.length === 0}
            onClick={() => void runSelected()}
          >
            下载已选 {selectedMissing.length > 0 ? `(${selectedMissing.length})` : ''}
          </Button>
          <IconButton label="重新检测依赖" disabled={checking || busy} onClick={() => void onCheck()}>
            <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {dependencies.map((dependency) => {
          const meta = DEPENDENCY_META[dependency.id]
          const progress = downloads[dependency.id]
          const active = progress ? BUSY_PHASES.has(progress.phase) : false
          const checked = selected.has(dependency.id)
          return (
            <div
              key={dependency.id}
              className={cn(
                'rounded-xl border border-border bg-muted/25',
                compact ? 'px-2 py-1.5' : 'p-3'
              )}
            >
              <div className="flex items-start gap-2">
                {meta.installMode === 'auto' && !dependency.available ? (
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={checked ? `取消选择 ${meta.label}` : `选择 ${meta.label}`}
                    onClick={() => toggleSelected(dependency.id)}
                  >
                    {checked ? (
                      <SquareCheckBig className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                ) : dependency.available ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{meta.label}</span>
                    <Badge tone={dependency.available ? 'success' : active ? 'primary' : 'warning'} dot={!active}>
                      {dependency.available
                        ? '可用'
                        : active
                          ? progress?.phase === 'downloading'
                            ? `${Math.round(progress.percent)}%`
                            : '配置中'
                          : progress?.phase === 'error'
                            ? '下载失败'
                            : '未安装'}
                    </Badge>
                  </div>

                  <p className={cn('mt-0.5 truncate text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>
                    {dependency.available
                      ? dependency.version ?? dependency.resolvedPath ?? '已检测到'
                      : progress?.message || `${meta.sizeHint} · ${meta.installHint}`}
                  </p>

                  {active ? (
                    <div className="mt-1.5">
                      <Progress value={progress?.percent ?? 0} tone="primary" />
                      {progress?.bytesPerSecond ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatBytes(progress.transferred)} / {formatBytes(progress.total)} ·{' '}
                          {formatSpeed(progress.bytesPerSecond)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {!dependency.available && meta.installMode !== 'guide' ? (
                      active ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          icon={<X className="h-3 w-3" />}
                          onClick={() => void api.app.cancelDependencyDownload(dependency.id)}
                        >
                          取消
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          icon={<Download className="h-3 w-3" />}
                          disabled={busy}
                          onClick={() => void runOne(dependency.id)}
                        >
                          {meta.actionLabel}
                        </Button>
                      )
                    ) : null}

                    {!dependency.available && meta.installMode === 'guide' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<ExternalLink className="h-3 w-3" />}
                        onClick={() => void runOne(dependency.id)}
                      >
                        {meta.actionLabel}
                      </Button>
                    ) : null}

                    {progress?.resultPath ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<FolderOpen className="h-3 w-3" />}
                        onClick={() =>
                          void (meta.installMode === 'installer'
                            ? api.app.openPath(progress.resultPath as string)
                            : api.app.showItemInFolder(progress.resultPath as string))
                        }
                      >
                        {meta.installMode === 'installer' ? '打开安装包' : '查看文件'}
                      </Button>
                    ) : dependency.resolvedPath ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={<FolderOpen className="h-3 w-3" />}
                        onClick={() => void api.app.showItemInFolder(dependency.resolvedPath as string)}
                      >
                        打开位置
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!compact && autoDependencies.some((item) => !item.available) ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            推荐先下载 FFmpeg、yt-dlp、Pandoc 和 Playwright Chromium
          </p>
          <button
            type="button"
            className="shrink-0 text-[10px] font-medium text-tint-primary hover:underline"
            onClick={() => setSelected(new Set(RECOMMENDED_DEPENDENCIES))}
          >
            全选推荐
          </button>
        </div>
      ) : null}
    </div>
  )
}
