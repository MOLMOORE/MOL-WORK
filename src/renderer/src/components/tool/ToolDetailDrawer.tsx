import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderSearch, History, Play, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import type { ToolManifest } from '@shared/types/domain'
import { TOOL_CATEGORY_META } from '@shared/constants'
import { Drawer } from '../ui/Overlay'
import { Badge } from '../ui/Feedback'
import { Button, IconButton } from '../ui/Button'
import { ToolRunnerForm, initialPayload, validatePayload, visibleFields, type ToolPayload } from './ToolRunnerForm'
import { useToolStore } from '../../stores/toolStore'
import { useAppStore } from '../../stores/appStore'
import { formatDateTime, formatDurationMs } from '../../lib/utils'
import { api } from '../../lib/ipc'

export interface ToolDetailDrawerProps {
  manifest: ToolManifest | null
  open: boolean
  onClose: () => void
}

export function ToolDetailDrawer({ manifest, open, onClose }: ToolDetailDrawerProps): JSX.Element | null {
  const running = useToolStore((state) => state.running)
  const results = useToolStore((state) => state.results)
  const history = useToolStore((state) => state.history)
  const run = useToolStore((state) => state.run)
  const clearResult = useToolStore((state) => state.clearResult)
  const pushToast = useAppStore((state) => state.pushToast)

  const [payload, setPayload] = useState<ToolPayload>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fields = manifest?.fields ?? []

  useEffect(() => {
    if (!manifest) return
    setPayload(initialPayload(manifest.fields))
    setErrors({})
  }, [manifest])

  const result = manifest ? results[manifest.id] : undefined
  const toolHistory = useMemo(
    () => (manifest ? history.filter((item) => item.toolId === manifest.id).slice(0, 12) : []),
    [history, manifest]
  )

  if (!manifest) return null

  const meta = TOOL_CATEGORY_META[manifest.category]
  const missing = (manifest.dependencyStatus ?? []).filter((item) => !item.available)
  const isRunning = running === manifest.id

  const handleChange = (name: string, value: unknown): void => {
    setPayload((current) => ({ ...current, [name]: value }))
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const handleRun = async (): Promise<void> => {
    const validation = validatePayload(visibleFields(fields, payload), payload)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      pushToast({ title: '请先补全必填项', tone: 'warning' })
      return
    }
    try {
      const outcome = await run(manifest.id, payload)
      pushToast({
        title: outcome.ok ? '工具执行完成' : '工具执行失败',
        description: outcome.run.resultSummary ?? outcome.run.error ?? undefined,
        tone: outcome.ok ? 'success' : 'danger'
      })
    } catch (error) {
      pushToast({ title: '工具执行失败', description: (error as Error).message, tone: 'danger' })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[600px]"
      title={manifest.name}
      subtitle={`${meta.label} · ${manifest.requires.length > 0 ? `依赖 ${manifest.requires.join(' / ')}` : '内置纯计算'}`}
      footer={
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              disabled={isRunning}
              onClick={() => {
                setPayload(initialPayload(fields))
                setErrors({})
                clearResult(manifest.id)
              }}
            >
              重置
            </Button>
            {manifest.dependencyStatus?.length ? (
              <span className="text-[11px] text-muted-foreground">
                {missing.length === 0 ? '依赖已就绪' : `${missing.length} 项依赖缺失`}
              </span>
            ) : null}
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={isRunning}
            icon={<Play className="h-3.5 w-3.5" />}
            disabled={!manifest.enabled}
            onClick={() => void handleRun()}
          >
            {isRunning ? '执行中…' : '执行工具'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!manifest.enabled ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-tint-warning">
            该工具已被停用，启用后才能执行。
          </div>
        ) : null}

        {missing.length > 0 ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-tint-danger">
              <AlertTriangle className="h-3 w-3" />
              外部依赖缺失，执行将返回安装指引
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {missing.map((item) => (
                <div key={item.id}>
                  <p className="text-[11px] text-foreground">{item.label}</p>
                  <code className="mt-1 block overflow-x-auto rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                    {item.installHint}
                  </code>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">{manifest.description}</p>

        <ToolRunnerForm fields={fields} value={payload} errors={errors} disabled={isRunning} onChange={handleChange} />

        {result ? (
          <div className="rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                {result.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-danger" />
                )}
                最近一次执行结果
              </span>
              <div className="flex items-center gap-2">
                <Badge tone={result.ok ? 'success' : 'danger'}>{result.ok ? '成功' : '失败'}</Badge>
                <span className="text-[10px] text-muted-foreground">{formatDurationMs(result.run.durationMs)}</span>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(result.run.createdAt)}</span>
              </div>
            </div>

            {result.run.error ? (
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-2.5 text-[11px] leading-relaxed text-tint-danger">
                {result.run.error}
              </pre>
            ) : null}

            {result.outputs.length > 0 ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {result.outputs.map((output) => (
                  <div key={output.label} className="flex items-start gap-2 text-[11px]">
                    <span className="w-24 shrink-0 text-muted-foreground">{output.label}</span>
                    <span className="min-w-0 flex-1 break-all text-foreground">{output.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {result.preview ? (
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {result.preview}
              </pre>
            ) : null}

            {result.run.resultPath ? (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={<Sparkles className="h-3 w-3" />}
                  onClick={() => void api.app.openPath(result.run.resultPath as string)}
                >
                  打开文件
                </Button>
                <IconButton
                  label="在文件夹中显示"
                  onClick={() => void api.app.showItemInFolder(result.run.resultPath as string)}
                >
                  <FolderSearch className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            该工具运行记录
          </p>
          {toolHistory.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">暂无记录，执行一次即可生成历史。</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {toolHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-foreground">{item.resultSummary ?? item.inputSummary}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{formatDurationMs(item.durationMs)}</span>
                    <Badge tone={item.status === 'success' ? 'success' : 'danger'}>
                      {item.status === 'success' ? '成功' : '失败'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
