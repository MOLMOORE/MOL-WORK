import { useEffect, useState } from 'react'
import { Database, Download, FolderOpen, RefreshCw, Sparkles, Terminal, Timer } from 'lucide-react'
import type { AppSettings } from '@shared/types/domain'
import { FONT_SIZE_META } from '@shared/constants'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, Spinner } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Switch } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { todayKey } from '../lib/utils'

export function SettingsPage(): JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const dependencies = useAppStore((state) => state.dependencies)
  const refreshDependencies = useAppStore((state) => state.refreshDependencies)
  const pushToast = useAppStore((state) => state.pushToast)
  const seedDemo = useAppStore((state) => state.seedDemo)

  const [dataDir, setDataDir] = useState('')
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [draft, setDraft] = useState<AppSettings | null>(settings)

  useEffect(() => {
    void api.app.getDataDir().then(setDataDir)
  }, [])

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const patch = async (partial: Partial<AppSettings>): Promise<void> => {
    setDraft((current) => (current ? { ...current, ...partial } : current))
    await updateSettings(partial)
  }

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    await refreshDependencies(true)
    setChecking(false)
    pushToast({ title: '依赖检测完成', description: '检测结果已刷新', tone: 'success' })
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    const dateKey = todayKey()
    const result = await api.app.exportReport(dateKey)
    setExporting(false)
    await api.app.showItemInFolder(result.path)
    pushToast({ title: '日报已导出', description: result.path, tone: 'success' })
  }

  if (!draft) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        <span className="text-sm">加载设置…</span>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SectionHeader title="偏好设置" description="影响提醒、复习算法与专注计时行为" />
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="称呼">
                <Input value={draft.userName} onChange={(event) => void patch({ userName: event.target.value })} />
              </Field>
              <Field label="主题" hint="跟随系统会随操作系统实时切换深浅色">
                <Select value={draft.theme} onChange={(event) => void patch({ theme: event.target.value as AppSettings['theme'] })}>
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                  <option value="system">跟随系统</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/25 p-3">
              <p className="text-xs font-medium text-muted-foreground">字体大小</p>
              <Tabs
                size="sm"
                value={draft.fontSize}
                onChange={(key) => void patch({ fontSize: key as AppSettings['fontSize'] })}
                items={Object.entries(FONT_SIZE_META).map(([key, meta]) => ({ key, label: meta.label }))}
              />
              <p className="text-[11px] text-muted-foreground/80">
                当前字号 {FONT_SIZE_META[draft.fontSize]?.label ?? '标准'}（根字号 {FONT_SIZE_META[draft.fontSize]?.root ?? '16px'}），界面会立即缩放。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="复习算法" hint="SM-2 会随评分动态调整难度系数">
                <Select
                  value={draft.reviewAlgorithm}
                  onChange={(event) => void patch({ reviewAlgorithm: event.target.value as AppSettings['reviewAlgorithm'] })}
                >
                  <option value="sm2">SM-2 自适应（推荐）</option>
                  <option value="ebbinghaus">艾宾浩斯固定间隔</option>
                </Select>
              </Field>
              <Field label="每日复习上限" hint="自动排程时单日最多安排的复习条数">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.dailyReviewLimit}
                  onChange={(event) => void patch({ dailyReviewLimit: Number(event.target.value) })}
                />
              </Field>
            </div>

            <Field label="提醒提前量（分钟）" hint="日程到点前多久推送系统通知">
              <Input
                type="number"
                min={0}
                max={120}
                value={draft.notifyLeadMinutes}
                onChange={(event) => void patch({ notifyLeadMinutes: Number(event.target.value) })}
              />
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <Field label="工作时段开始">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.workStartHour}
                  onChange={(event) => void patch({ workStartHour: Number(event.target.value) })}
                />
              </Field>
              <Field label="工作时段结束">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={draft.workEndHour}
                  onChange={(event) => void patch({ workEndHour: Number(event.target.value) })}
                />
              </Field>
              <Field label="自动排程时刻" hint="每天该时刻后把到期复习排入次日">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.autoScheduleHour}
                  onChange={(event) => void patch({ autoScheduleHour: Number(event.target.value) })}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <Switch
                checked={draft.autoScheduleNextDay}
                onChange={(checked) => void patch({ autoScheduleNextDay: checked })}
                label="每日自动把到期复习内容排入次日日程"
              />
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader
              title="番茄钟默认参数"
              description="作为番茄钟页面的初始值，可随时在番茄钟页微调"
              action={
                <Badge tone="primary">
                  <Timer className="mr-1 h-3 w-3" />
                  专注节奏
                </Badge>
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="专注时长（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.defaultFocusMinutes}
                  onChange={(event) => void patch({ defaultFocusMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="短休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.pomodoroShortMinutes}
                  onChange={(event) => void patch({ pomodoroShortMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="长休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={draft.pomodoroLongMinutes}
                  onChange={(event) => void patch({ pomodoroLongMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="长休息间隔（个）">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.pomodoroRoundsPerLong}
                  onChange={(event) => void patch({ pomodoroRoundsPerLong: Number(event.target.value) })}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/25 p-3">
              <Switch
                checked={draft.pomodoroAutoStartNext}
                onChange={(checked) => void patch({ pomodoroAutoStartNext: checked })}
                label="阶段结束后自动进入下一阶段"
              />
              <Switch
                checked={draft.pomodoroSound}
                onChange={(checked) => void patch({ pomodoroSound: checked })}
                label="阶段结束时播放提示音"
              />
            </div>
          </Card>

          <Card>
            <SectionHeader
              title="外部工具依赖"
              description="阶段二将使用这些程序执行真实工具任务"
              action={
                <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={checking} onClick={handleCheck}>
                  重新检测
                </Button>
              }
            />
            <div className="flex flex-col gap-2">
              {dependencies.map((dependency) => (
                <div key={dependency.id} className="rounded-xl border border-border/70 bg-muted/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      {dependency.label}
                    </span>
                    <Badge tone={dependency.available ? 'success' : 'warning'} dot>
                      {dependency.available ? '可用' : '未安装'}
                    </Badge>
                  </div>
                  {dependency.version ? (
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{dependency.version}</p>
                  ) : (
                    <code className="mt-1.5 block overflow-x-auto rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                      {dependency.installHint}
                    </code>
                  )}
                  {dependency.resolvedPath ? (
                    <button
                      type="button"
                      className="mt-1 block max-w-full truncate text-left text-[10px] text-muted-foreground/80 hover:text-foreground"
                      title="在文件夹中显示"
                      onClick={() => void api.app.showItemInFolder(dependency.resolvedPath as string)}
                    >
                      {dependency.resolvedPath}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader title="数据与维护" description="local-first，所有数据存放在本机" />
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Database className="h-3 w-3" />
                  数据目录
                </p>
                <p className="mt-1 break-all text-[11px] text-foreground">{dataDir || '—'}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => void api.app.openPath(dataDir)}
                >
                  打开数据目录
                </Button>
                <Button size="sm" variant="secondary" loading={exporting} icon={<Download className="h-3.5 w-3.5" />} onClick={handleExport}>
                  导出今日日报
                </Button>
                <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void seedDemo()}>
                  写入示例数据
                </Button>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                示例数据仅在任务表为空时写入，用于快速体验任务 → 笔记 → 复习计划 → 日程提醒的完整闭环。
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
