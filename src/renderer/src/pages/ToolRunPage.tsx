import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  FolderSearch,
  History,
  Play,
  RotateCcw,
  Sparkles,
  XCircle
} from 'lucide-react'
import { TOOL_CATEGORY_META } from '@shared/constants'
import { Card } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { ToolIcon } from '../components/tool/ToolIcon'
import {
  ToolRunnerForm,
  initialPayload,
  validatePayload,
  visibleFields,
  type ToolPayload
} from '../components/tool/ToolRunnerForm'
import { ToolDiagram } from '../components/tool/diagrams'
import { useToolStore } from '../stores/toolStore'
import { useAppStore } from '../stores/appStore'
import { cn, formatDateTime, formatDurationMs } from '../lib/utils'
import { api } from '../lib/ipc'

/** 工具运行页（v1.2.7）：工具集里点开任何工具都进入本页运行，取代原右侧抽屉 */
export function ToolRunPage(): JSX.Element {
  const { toolId = '' } = useParams()
  const navigate = useNavigate()
  const tools = useToolStore((state) => state.tools)
  const loading = useToolStore((state) => state.loading)
  const running = useToolStore((state) => state.running)
  const results = useToolStore((state) => state.results)
  const history = useToolStore((state) => state.history)
  const load = useToolStore((state) => state.load)
  const run = useToolStore((state) => state.run)
  const clearResult = useToolStore((state) => state.clearResult)
  const pushToast = useAppStore((state) => state.pushToast)

  const manifest = tools.find((tool) => tool.id === toolId) ?? null
  const manifestId = manifest?.id
  const fields = manifest?.fields ?? []

  const [payload, setPayload] = useState<ToolPayload>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  /** 批量转换队列（v1.2.7 第十轮）：拖入 / 多选多个文件后逐个用同一组参数执行 */
  const [batch, setBatch] = useState<{ file: string; state: 'pending' | 'running' | 'ok' | 'fail'; error?: string; out?: string }[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [dragIn, setDragIn] = useState(false)

  // 从全局搜索 / 运行记录直接进本页时，工具列表可能还没加载
  useEffect(() => {
    if (tools.length === 0) void load()
  }, [tools.length, load])

  // 切换工具（含列表首次加载后才找到该工具）时重置表单
  useEffect(() => {
    if (!manifest) return
    setPayload(initialPayload(manifest.fields))
    setErrors({})
    setBatch([])
    setBatchRunning(false)
    setDragIn(false)
  }, [manifestId])

  const result = manifest ? results[manifest.id] : undefined
  const toolHistory = useMemo(
    () => (manifest ? history.filter((item) => item.toolId === manifest.id).slice(0, 12) : []),
    [history, manifest]
  )

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
    if (!manifest) return
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

  // 批量源字段 = 第一个文件类 path 字段（四个转换工具均为 sourcePath）
  const batchField = manifest?.supportsBatch
    ? manifest.fields.find((field) => field.type === 'path' && (field.pathKind ?? 'file') === 'file')?.name
    : undefined

  const addBatchFiles = (paths: string[]): void => {
    const fresh = paths.filter((item) => item && !batch.some((row) => row.file === item))
    if (fresh.length > 0) setBatch((cur) => [...cur, ...fresh.map((file) => ({ file, state: 'pending' as const }))])
  }

  const handleFormDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    setDragIn(false)
    if (!batchField || batchRunning) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.nativeFiles?.pathForFile(file) ?? '')
      .filter((item) => item !== '')
    if (paths.length === 0) return
    if (paths.length === 1 && batch.length === 0) {
      handleChange(batchField, paths[0])
      return
    }
    addBatchFiles(paths)
  }

  const startBatch = async (): Promise<void> => {
    if (!manifest || !batchField || batchRunning) return
    const queue = batch.filter((item) => item.state === 'pending' || item.state === 'fail')
    if (queue.length === 0) return
    const validation = validatePayload(visibleFields(fields.filter((field) => field.name !== batchField), payload), payload)
    setErrors(validation)
    if (Object.keys(validation).length > 0) {
      pushToast({ title: '请先补全必填项', tone: 'warning' })
      return
    }
    setBatchRunning(true)
    let okCount = 0
    for (const item of queue) {
      setBatch((cur) => cur.map((row) => (row.file === item.file ? { ...row, state: 'running', error: undefined } : row)))
      try {
        const outcome = await run(manifest.id, { ...payload, [batchField]: item.file })
        if (outcome.ok) {
          okCount += 1
          setBatch((cur) => cur.map((row) => (row.file === item.file ? { ...row, state: 'ok', out: (outcome.run.resultPath as string | undefined) ?? undefined } : row)))
        } else {
          setBatch((cur) => cur.map((row) => (row.file === item.file ? { ...row, state: 'fail', error: outcome.run.error ?? '执行失败' } : row)))
        }
      } catch (error) {
        setBatch((cur) => cur.map((row) => (row.file === item.file ? { ...row, state: 'fail', error: (error as Error).message } : row)))
      }
    }
    setBatchRunning(false)
    pushToast({
      title: `批量转换完成：${okCount} 成功 / ${queue.length - okCount} 失败`,
      tone: okCount === queue.length ? 'success' : 'warning'
    })
  }

  if (!manifest) {
    if (loading || tools.length === 0) {
      return (
        <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
          <Spinner className="h-5 w-5" />
          <span className="text-sm">正在加载工具…</span>
        </div>
      )
    }
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="没找到这个工具"
          description="它可能已被移除，回工具集重新选择"
          action={
            <Button size="sm" variant="secondary" onClick={() => navigate('/tools')}>
              返回工具集
            </Button>
          }
        />
      </div>
    )
  }

  const meta = TOOL_CATEGORY_META[manifest.category]
  const missing = (manifest.dependencyStatus ?? []).filter((item) => !item.available)
  const isRunning = running === manifest.id

  return (
    <div className="mx-auto flex w-full flex-col gap-4 pb-10">
      {/* 页头：返回键、工具信息与状态徽章合并一张卡，宽屏下双栏各取所需 */}
      <Card className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
          onClick={() => navigate('/tools')}
        >
          返回工具集
        </Button>
        <ToolIcon name={manifest.icon} color={meta.color} />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{manifest.name}</span>
            <span className="shrink-0 text-[10px] font-normal tracking-wider text-muted-foreground">#{manifest.id}</span>
          </p>
          <p className="mt-0.5 text-[10px] tracking-wider text-muted-foreground">
            {meta.label} · {manifest.requires.length > 0 ? `依赖 ${manifest.requires.join(' / ')}` : '内置纯计算'}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{manifest.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {missing.length > 0 ? <Badge tone="warning">{missing.length} 项依赖缺失</Badge> : null}
          {!manifest.enabled ? <Badge tone="default">已停用</Badge> : null}
        </div>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!manifest.enabled ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-tint-warning">
              该工具已被停用，启用后才能执行。可在工具集卡片上打开开关。
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

          {/* 拖放区：转换类工具把文件拖进来即可（单个填表单，多个进队列） */}
          <div
            className={cn(
              'flex flex-col gap-4 rounded-2xl outline-dashed outline-2 outline-offset-4 transition-[outline-color]',
              batchField && !batchRunning ? (dragIn ? 'outline-primary/80' : 'outline-transparent') : 'outline-transparent'
            )}
            onDragOver={(event) => {
              if (!batchField || batchRunning) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDragIn(true)
            }}
            onDragLeave={() => setDragIn(false)}
            onDrop={handleFormDrop}
          >
          <Card className="flex flex-col gap-4">
            <ToolRunnerForm
              fields={fields}
              value={payload}
              errors={errors}
              disabled={isRunning || batchRunning}
              onChange={handleChange}
              batchField={batchField}
              onBatchFiles={addBatchFiles}
            />
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
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
              <Button
                variant="primary"
                size="sm"
                loading={isRunning}
                icon={<Play className="h-3.5 w-3.5" />}
                disabled={!manifest.enabled || batchRunning}
                onClick={() => void handleRun()}
              >
                {isRunning ? '执行中…' : '执行工具'}
              </Button>
            </div>
          </Card>
          </div>

          {batchField ? (
            <Card className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  批量转换队列
                  {batch.length > 0 ? ` · ${batch.filter((row) => row.state === 'ok' || row.state === 'fail').length}/${batch.length}` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3 w-3" />} disabled={batchRunning || batch.length === 0} onClick={() => setBatch([])}>
                    清空
                  </Button>
                  <Button
                    size="xs"
                    variant="primary"
                    icon={<Play className="h-3 w-3" />}
                    loading={batchRunning}
                    disabled={batchRunning || !batch.some((row) => row.state === 'pending' || row.state === 'fail')}
                    onClick={() => void startBatch()}
                  >
                    开始批量转换
                  </Button>
                </div>
              </div>
              {batch.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  把多个文件拖到上方表单，或点源文件旁的多选键加入队列；队列按上方参数逐个转换，单张照常点「执行工具」
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {batch.map((item) => (
                    <div key={item.file} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5">
                      {item.state === 'ok' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      ) : item.state === 'fail' ? (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
                      ) : item.state === 'running' ? (
                        <Spinner className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-foreground" title={item.file}>
                          {item.file.split(/[\\/]/).pop()}
                        </p>
                        {item.error ? (
                          <p className="truncate text-[10px] text-tint-danger" title={item.error}>{item.error.split('\n')[0]}</p>
                        ) : null}
                        {item.out ? (
                          <p className="truncate text-[10px] text-muted-foreground" title={item.out}>{item.out}</p>
                        ) : null}
                      </div>
                      {item.state === 'ok' && item.out ? (
                        <IconButton label="打开文件" onClick={() => void api.app.openPath(item.out as string)}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </IconButton>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}

          {result ? (
            <Card>
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
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
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
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ToolDiagram toolId={manifest.id} payload={payload} />
          <Card>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              该工具运行记录
            </p>
            {toolHistory.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">执行一次后生成历史</p>
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
          </Card>
        </div>
      </div>
    </div>
  )
}
