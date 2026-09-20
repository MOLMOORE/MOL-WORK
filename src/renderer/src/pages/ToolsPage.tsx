import { useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  Clock4,
  FolderOpen,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import type { ToolCategory, ToolManifest } from '@shared/types/domain'
import { TOOL_CATEGORY_META } from '@shared/constants'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge, EmptyState, Spinner } from '../components/ui/Feedback'
import { Button, IconButton } from '../components/ui/Button'
import { Input, Switch } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { ConfirmDialog, Modal } from '../components/ui/Overlay'
import { PageGrid } from '../components/layout/PageGrid'
import type { GridEntry } from '../components/layout/GridBoard'
import { ToolIcon } from '../components/tool/ToolIcon'
import { ToolDetailDrawer } from '../components/tool/ToolDetailDrawer'
import { useToolStore } from '../stores/toolStore'
import { useAppStore } from '../stores/appStore'
import { formatDateTime, formatDurationMs, formatMinutes, todayKey } from '../lib/utils'
import { api } from '../lib/ipc'

const CATEGORY_ORDER: ToolCategory[] = ['image', 'audio', 'video', 'doc', 'download', 'extract', 'calc', 'flashcard']

export function ToolsPage(): JSX.Element {
  const tools = useToolStore((state) => state.tools)
  const history = useToolStore((state) => state.history)
  const dependencies = useToolStore((state) => state.dependencies)
  const loading = useToolStore((state) => state.loading)
  const checking = useToolStore((state) => state.checking)
  const running = useToolStore((state) => state.running)
  const selectedId = useToolStore((state) => state.selectedId)
  const select = useToolStore((state) => state.select)
  const load = useToolStore((state) => state.load)
  const refreshDependencies = useToolStore((state) => state.refreshDependencies)
  const toggle = useToolStore((state) => state.toggle)
  const remove = useToolStore((state) => state.remove)
  const restore = useToolStore((state) => state.restore)
  const pushToast = useAppStore((state) => state.pushToast)

  const [category, setCategory] = useState<'all' | ToolCategory>('all')
  const [keyword, setKeyword] = useState('')
  const [outputsPath, setOutputsPath] = useState('')
  const [pendingRemove, setPendingRemove] = useState<ToolManifest | null>(null)
  /** 顶部四个指标卡点击后弹出的明细类型 */
  const [statDetail, setStatDetail] = useState<'tools' | 'deps' | 'today' | 'cost' | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void api.app.getDataDir().then((dir) => setOutputsPath(`${dir}/outputs`))
  }, [])

  const missingDependencies = dependencies.filter((item) => !item.available)

  const today = todayKey()
  const todayRuns = history.filter((item) => item.createdAt.slice(0, 10) === today)
  const totalToolMinutes = Math.round(history.reduce((sum, item) => sum + item.durationMs, 0) / 60000)

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    return tools.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false
      if (text === '') return true
      return (
        tool.name.toLowerCase().includes(text) ||
        tool.description.toLowerCase().includes(text) ||
        tool.id.toLowerCase().includes(text)
      )
    })
  }, [tools, category, keyword])

  const tabItems = [
    { key: 'all', label: '全部', count: tools.length },
    ...CATEGORY_ORDER.filter((key) => tools.some((tool) => tool.category === key)).map((key) => ({
      key,
      label: TOOL_CATEGORY_META[key].label,
      count: tools.filter((tool) => tool.category === key).length
    }))
  ]

  const selected = tools.find((tool) => tool.id === selectedId) ?? null

  const handleRefresh = async (): Promise<void> => {
    await refreshDependencies(true)
    pushToast({ title: '依赖检测完成', description: '已重新探测本机可执行文件', tone: 'success' })
  }

  const handleRemove = async (): Promise<void> => {
    if (!pendingRemove) return
    await remove(pendingRemove.id)
    pushToast({ title: '工具已移除', description: '可通过「恢复内置工具」重新启用', tone: 'info' })
    setPendingRemove(null)
  }

  /** 顶部四个指标卡的点击明细 */
  const renderStatDetail = (): JSX.Element => {
    if (statDetail === 'tools') {
      return (
        <div className="flex max-h-[58vh] flex-col gap-2 overflow-y-auto pr-1">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                setStatDetail(null)
                select(tool.id)
              }}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <ToolIcon name={tool.icon} size="sm" color={TOOL_CATEGORY_META[tool.category]?.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">{tool.name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{tool.description}</span>
              </span>
              <Badge tone={tool.enabled ? 'success' : 'default'}>{tool.enabled ? '已启用' : '已停用'}</Badge>
            </button>
          ))}
        </div>
      )
    }
    if (statDetail === 'deps') {
      return (
        <div className="flex max-h-[58vh] flex-col gap-2 overflow-y-auto pr-1">
          {dependencies.map((dependency) => (
            <div key={dependency.id} className="rounded-xl border border-border bg-muted/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{dependency.label}</span>
                <Badge tone={dependency.available ? 'success' : 'warning'} dot>
                  {dependency.available ? '可用' : '未安装'}
                </Badge>
              </div>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">{dependency.version ?? dependency.installHint}</p>
              {dependency.resolvedPath ? (
                <button
                  type="button"
                  className="mt-1 block max-w-full truncate text-left text-[10px] text-muted-foreground/80 hover:text-foreground"
                  onClick={() => void api.app.showItemInFolder(dependency.resolvedPath as string)}
                >
                  {dependency.resolvedPath}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )
    }
    const list = statDetail === 'today' ? todayRuns : history
    if (list.length === 0) {
      return <EmptyState icon={<Clock4 className="h-5 w-5" />} title="暂无记录" description="执行任意工具后，这里会列出每次调用的耗时与结果" />
    }
    return (
      <div className="flex max-h-[58vh] flex-col gap-2 overflow-y-auto pr-1">
        {list.slice(0, 40).map((run) => (
          <div key={run.id} className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                  {run.toolName}
                  <Badge tone={run.status === 'success' ? 'success' : 'danger'}>
                    {run.status === 'success' ? '成功' : '失败'}
                  </Badge>
                </p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {run.resultSummary ?? run.error ?? run.inputSummary}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                  {formatDateTime(run.createdAt)} · 耗时 {formatDurationMs(run.durationMs)}
                </p>
              </div>
              {run.resultPath ? (
                <Button size="xs" variant="secondary" onClick={() => void api.app.openPath(run.resultPath as string)}>
                  打开
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const headerNode = (
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">可插拔工具集</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={checking}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void handleRefresh()}
            >
              重新检测依赖
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              onClick={() => void restore().then(() => pushToast({ title: '内置工具已恢复', tone: 'success' }))}
            >
              恢复内置工具
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={() => void api.app.openPath(outputsPath)}
            >
              打开输出目录
            </Button>
          </div>
        </div>
      </Card>
  )

  const entries: GridEntry[] = [
    { id: 'header', title: '工具集说明', x: 0, y: 3, w: 12, h: 2, minW: 6, minH: 2, node: headerNode },
    {
      id: 'metric-tools',
      title: '已注册工具',
      x: 0,
      y: 5,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="已注册工具"
          value={`${tools.length} 个`}
          hint={`启用 ${tools.filter((t) => t.enabled).length} 个`}
          icon={<Boxes className="h-4 w-4" />}
          onClick={() => setStatDetail('tools')}
        />
      )
    },
    {
      id: 'metric-deps',
      title: '外部依赖',
      x: 3,
      y: 5,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="外部依赖"
          value={`${dependencies.length - missingDependencies.length} / ${dependencies.length}`}
          hint={missingDependencies.length === 0 ? '全部就绪' : `缺失 ${missingDependencies.length} 项`}
          tone={missingDependencies.length === 0 ? 'success' : 'warning'}
          icon={<Terminal className="h-4 w-4" />}
          onClick={() => setStatDetail('deps')}
        />
      )
    },
    {
      id: 'metric-today',
      title: '今日调用',
      x: 6,
      y: 5,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard label="今日调用" value={`${todayRuns.length} 次`} hint={`累计记录 ${history.length} 条`} tone="info" icon={<Play className="h-4 w-4" />} onClick={() => setStatDetail('today')} />
      )
    },
    {
      id: 'metric-cost',
      title: '累计工具耗时',
      x: 9,
      y: 5,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: <StatCard label="累计工具耗时" value={formatMinutes(totalToolMinutes)} tone="primary" icon={<Clock4 className="h-4 w-4" />} onClick={() => setStatDetail('cost')} />
    },
    {
      id: 'deps',
      group: 'runtime',
      title: '外部依赖状态',
      x: 0,
      y: 19,
      w: 6,
      h: 7,
      minW: 4,
      minH: 4,
      node: (
        <Card className="flex h-full flex-col overflow-y-auto">
        <SectionHeader
          title="外部依赖状态"
          description="按托管目录 → 系统 PATH → winget → pip 的顺序自动解析可执行文件"
          action={
            missingDependencies.length === 0 ? (
              <Badge tone="success" dot>
                全部可用
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                {missingDependencies.length} 项缺失
              </Badge>
            )
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dependencies.map((dependency) => (
            <div key={dependency.id} className="rounded-xl border border-border bg-muted/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  {dependency.available ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5 text-warning" />
                  )}
                  {dependency.label}
                </span>
                {dependency.resolvedPath ? (
                  <IconButton
                    label="在文件夹中显示"
                    onClick={() => void api.app.showItemInFolder(dependency.resolvedPath as string)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </IconButton>
                ) : null}
              </div>
              {dependency.version ? (
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={dependency.version}>
                  {dependency.version}
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">未检测到</p>
              )}
              {dependency.resolvedPath ? (
                <p className="mt-1 break-all text-[10px] leading-relaxed text-muted-foreground/80">
                  {dependency.resolvedPath}
                </p>
              ) : (
                <code className="mt-1.5 block overflow-x-auto rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                  {dependency.installHint}
                </code>
              )}
            </div>
          ))}
        </div>
          </Card>
        )
      },
      {
        id: 'market',
        title: '工具集市',
        x: 0,
        y: 7,
        w: 12,
        h: 12,
        minW: 5,
        minH: 6,
        node: (
          <Card className="flex h-full flex-col overflow-y-auto">
        <SectionHeader
          title="工具集市"
          description="按 manifest 自动渲染表单，点击工具卡片或「执行」开始使用"
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={keyword}
                  placeholder="搜索工具"
                  className="w-44 pl-8"
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
            </div>
          }
        />

        <div className="mb-4">
          <Tabs items={tabItems} value={category} onChange={(key) => setCategory(key as 'all' | ToolCategory)} size="sm" />
        </div>

        {loading && tools.length === 0 ? (
          <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
            <Spinner />
            <span className="text-sm">加载工具清单…</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Wrench className="h-5 w-5" />}
            title="没有匹配的工具"
            description="调整分类或搜索关键词；已移除的工具可通过「恢复内置工具」找回来。"
            action={
              <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void restore()}>
                恢复内置工具
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((tool) => {
              const meta = TOOL_CATEGORY_META[tool.category]
              const deps = tool.dependencyStatus ?? []
              const missing = deps.filter((item) => !item.available)
              const isRunning = running === tool.id
              return (
                <div
                  key={tool.id}
                  className="glass-card-hover flex flex-col p-4"
                  role="button"
                  tabIndex={0}
                  onClick={() => select(tool.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') select(tool.id)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ToolIcon name={tool.icon} color={meta.color} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{tool.name}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{meta.label}</p>
                      </div>
                    </div>
                    <span onClick={(event) => event.stopPropagation()}>
                      <Switch checked={tool.enabled} onChange={(checked) => void toggle(tool.id, checked)} />
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{tool.description}</p>

                  {deps.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {deps.map((dependency) => (
                        <Badge key={dependency.id} tone={dependency.available ? 'success' : 'warning'}>
                          {dependency.label}
                          {dependency.available ? '' : ' 缺失'}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2.5">
                      <Badge tone="info">内置纯计算</Badge>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="primary"
                        icon={<Play className="h-3 w-3" />}
                        loading={isRunning}
                        disabled={!tool.enabled || missing.length > 0}
                        onClick={(event) => {
                          event.stopPropagation()
                          select(tool.id)
                        }}
                      >
                        {missing.length > 0 ? '依赖缺失' : '执行'}
                      </Button>
                      <IconButton
                        label="移除工具"
                        tone="danger"
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingRemove(tool)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                    <span className="text-[10px] text-muted-foreground">#{tool.id}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
          </Card>
        )
      },
      {
        id: 'runs',
        group: 'runtime',
        title: '运行记录',
        x: 6,
        y: 19,
        w: 6,
        h: 7,
        minW: 6,
        minH: 5,
        node: (
          <Card className="flex h-full flex-col overflow-y-auto">
        <SectionHeader
          title="运行记录"
          description="工具执行的输入摘要、耗时、状态与结果路径，可直接打开产出文件"
          action={<Badge tone="primary">{history.length} 条</Badge>}
        />
        {history.length === 0 ? (
          <EmptyState icon={<Clock4 className="h-5 w-5" />} title="暂无运行记录" description="执行任意工具后，这里会记录每次调用的耗时与结果" />
        ) : (
          <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
            {history.slice(0, 40).map((run) => (
              <div key={run.id} className="rounded-xl border border-border bg-muted/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <ToolIcon name="Wrench" size="sm" color={TOOL_CATEGORY_META[run.category]?.color} />
                      {run.toolName}
                      <Badge tone={run.status === 'success' ? 'success' : 'danger'}>
                        {run.status === 'success' ? '成功' : '失败'}
                      </Badge>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {run.resultSummary ?? run.error ?? run.inputSummary}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
                      {formatDateTime(run.createdAt)} · 耗时 {formatDurationMs(run.durationMs)}
                    </p>
                  </div>
                  {run.resultPath ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="xs" variant="secondary" onClick={() => void api.app.openPath(run.resultPath as string)}>
                        打开
                      </Button>
                      <IconButton
                        label="在文件夹中显示"
                        onClick={() => void api.app.showItemInFolder(run.resultPath as string)}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => select(run.toolId)}
                    >
                      详情
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
          </Card>
        )
      }
  ]

  return (
    <div className="grid gap-5">
      <PageGrid pageKey="tools" entries={entries} storageKey="workstation.grid.tools.v4" />

      <ToolDetailDrawer manifest={selected} open={selected !== null} onClose={() => select(null)} />

      <Modal
        open={statDetail !== null}
        onClose={() => setStatDetail(null)}
        title={
          statDetail === 'tools'
            ? '已注册工具'
            : statDetail === 'deps'
              ? '外部依赖'
              : statDetail === 'today'
                ? '今日调用'
                : '累计工具耗时'
        }
        description={
          statDetail === 'tools'
            ? `共 ${tools.length} 个工具，其中 ${tools.filter((tool) => tool.enabled).length} 个已启用`
            : statDetail === 'deps'
              ? `${dependencies.length - missingDependencies.length} / ${dependencies.length} 项可用`
              : statDetail === 'today'
                ? `今日执行 ${todayRuns.length} 次 · 累计记录 ${history.length} 条`
                : `累计 ${formatMinutes(totalToolMinutes)} · 共 ${history.length} 条记录`
        }
        width="max-w-2xl"
      >
        {renderStatDetail()}
      </Modal>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="移除该工具？"
        description={`「${pendingRemove?.name ?? ''}」将从工具集市隐藏，历史运行记录会保留。可随时通过「恢复内置工具」找回。`}
        confirmText="移除"
        onConfirm={() => void handleRemove()}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
