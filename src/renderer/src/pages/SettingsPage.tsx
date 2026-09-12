import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Database,
  Download,
  FolderOpen,
  Info,
  Palette,
  RefreshCw,
  Repeat,
  Sparkles,
  Terminal,
  Timer,
  Trash2
} from 'lucide-react'
import type { AppSettings } from '@shared/types/domain'
import { FONT_SIZE_META } from '@shared/constants'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, Spinner } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Switch } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { cn, todayKey } from '../lib/utils'

/** 设置分区：列表页纵向排列，点击进入详情修改 */
const SECTIONS: { key: string; title: string; description: string; icon: typeof Palette }[] = [
  { key: 'general', title: '外观与通用', description: '称呼（软件名）、主题与字体大小', icon: Palette },
  { key: 'review', title: '复习与计划', description: '复习算法、每日上限、工作时段与自动排程', icon: Repeat },
  { key: 'notify', title: '提醒与通知', description: '提醒提前量与截止提醒提示音', icon: Bell },
  { key: 'pomodoro', title: '番茄钟', description: '专注时长、休息节奏与阶段提示音', icon: Timer },
  { key: 'task', title: '任务与回收站', description: '回收站保留时长与关闭窗口行为', icon: Trash2 },
  { key: 'deps', title: '外部工具依赖', description: 'Pandoc、FFmpeg、yt-dlp、Playwright 检测与排查', icon: Terminal },
  { key: 'data', title: '数据与维护', description: '数据目录、日报导出与示例数据', icon: Database },
  { key: 'about', title: '关于与版本', description: '当前版本与本版较于上一版本的更新内容', icon: Info }
]

/** 版本更新日志（新版本发布时在最上方追加一条） */
const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '1.1.10',
    date: '2026-09-12',
    items: [
      '版本中心升级：任意版本均可查看本版与历史版本的完整更新信息',
      '番茄钟计时器全新设计：更精致的番茄造型（果体渐变、高光、萼叶）与外圈进度环',
      '任务页时钟数字加大；仪表盘「预计专注」卡片可点击跳转番茄钟'
    ]
  },
  {
    version: '1.1.9',
    date: '2026-09-11',
    items: [
      '番茄钟计时器改为番茄造型（专注红番茄 / 休息绿番茄），内圈进度弧显示剩余时间',
      '番茄钟四个统计卡片可点击，弹出环形图、柱状图与趋势面积图',
      '任务页与设置页隐藏全局时钟；未排期任务为 0 时面板自动收起；当日事项卡片加大',
      '侧边栏删去英文副标题；移除工具页与统计页的阶段交付徽标'
    ]
  },
  {
    version: '1.1.8',
    date: '2026-09-11',
    items: [
      '设置页改为分区列表：点击条目进入对应详情修改，并新增「关于与版本」分区',
      '新增版本检查：可查看当前版本以及本版较于上一版本的更新内容',
      '全局时钟从顶栏移至页面内容区顶部（数字加大）；任务页时钟恢复翻页样式（仅时分秒）'
    ]
  },
  {
    version: '1.1.7',
    date: '2026-09-11',
    items: [
      '提示音改为机械门铃「叮咚」声，且仅截止/超时提醒弹窗首次弹出时响',
      '软件名改为「XX的工作站」，称呼可自定义（默认 MOL）',
      '新增顶栏中央全局翻页时钟；延时转盘加大并带指针拨动「咔哒」声'
    ]
  },
  {
    version: '1.1.6',
    date: '2026-09-11',
    items: [
      '软件最小化/后台时改用系统级通知提醒',
      '点击窗口 X 可选择进入后台或真正关闭（可记住选择），新增系统托盘',
      '超时（逾期）事项优先级提升为最高；弹窗出现伴随提示音（可关闭）'
    ]
  },
  {
    version: '1.1.5',
    date: '2026-09-11',
    items: [
      '截止提醒延时转盘扩展为时/分/秒三个钟表转盘，延期精确到秒',
      '「稍后提醒」自动将事项转为超时状态并每 5 分钟重提醒',
      '修复项目弹窗顶部被截断；任务页搜索候选改为全局搜索同款样式'
    ]
  },
  {
    version: '1.1.4',
    date: '2026-09-11',
    items: [
      '回收站内可直接切换保留时长（一天/一周/一个月）',
      '任务详情 tag 点击即可直接修改；提醒页签支持实时新建/修改/删除提醒',
      '修复弹窗内容显示不完全；搜索候选列出全部匹配任务'
    ]
  },
  {
    version: '1.1.3',
    date: '2026-09-11',
    items: [
      '新增任务回收站（软删除/恢复/到期自动清理）',
      '到期提醒支持快捷延后档位与延时转盘；事项可升级为超时状态',
      '新建任务默认不设置截止时间；拖拽打乱时间顺序时弹窗确认改期'
    ]
  },
  {
    version: '1.1.2',
    date: '2026-09-11',
    items: [
      '仪表盘今日任务与任务清单支持拖拽自由排序',
      '日程卡片新增快捷完成/删除按钮；移除设置页实现状态板块'
    ]
  }
]

export function SettingsPage(): JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const dependencies = useAppStore((state) => state.dependencies)
  const refreshDependencies = useAppStore((state) => state.refreshDependencies)
  const pushToast = useAppStore((state) => state.pushToast)
  const seedDemo = useAppStore((state) => state.seedDemo)

  const [active, setActive] = useState<string | null>(null)
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
    const dateKeyValue = todayKey()
    const result = await api.app.exportReport(dateKeyValue)
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

  const activeSection = SECTIONS.find((section) => section.key === active) ?? null

  /** 各分区详情内容 */
  const renderSectionContent = (): JSX.Element | null => {
    switch (active) {
      case 'general':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="称呼" hint="作为软件名前缀，窗口与侧边栏将显示为「XX的工作站」">
                <Input value={draft.userName} onChange={(event) => void patch({ userName: event.target.value })} placeholder="例如：MOL" />
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
          </div>
        )
      case 'review':
        return (
          <div className="grid gap-4">
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
        )
      case 'notify':
        return (
          <div className="grid gap-4">
            <Field label="提醒提前量（分钟）" hint="日程到点前多久推送系统通知">
              <Input
                type="number"
                min={0}
                max={120}
                value={draft.notifyLeadMinutes}
                onChange={(event) => void patch({ notifyLeadMinutes: Number(event.target.value) })}
              />
            </Field>
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <Switch
                checked={draft.dialogSound}
                onChange={(checked) => void patch({ dialogSound: checked })}
                label="截止提醒弹窗提示音"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                仅截止时间与超时事项的提醒弹窗在首次弹出时播放「叮咚」声，其他弹窗静默。
              </p>
            </div>
          </div>
        )
      case 'pomodoro':
        return (
          <div className="grid gap-4">
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
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/25 p-3">
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
          </div>
        )
      case 'task':
        return (
          <div className="grid gap-4">
            <Field label="回收站保留时长" hint="删除的任务在回收站保留的时间，到期自动彻底删除">
              <Select
                value={String(draft.recycleBinDays ?? 7)}
                onChange={(event) => void patch({ recycleBinDays: Number(event.target.value) })}
              >
                <option value="1">一天</option>
                <option value="7">一周</option>
                <option value="30">一个月</option>
              </Select>
            </Field>
            <Field label="关闭窗口行为" hint="点击右上角 X 后的动作">
              <Select
                value={draft.closeAction ?? 'ask'}
                onChange={(event) => void patch({ closeAction: event.target.value as AppSettings['closeAction'] })}
              >
                <option value="ask">每次询问（进入后台或退出）</option>
                <option value="background">直接进入后台（托盘运行）</option>
                <option value="exit">直接退出软件</option>
              </Select>
            </Field>
          </div>
        )
      case 'deps':
        return (
          <div className="grid gap-3">
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={checking} onClick={handleCheck}>
                重新检测
              </Button>
            </div>
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
          </div>
        )
      case 'data':
        return (
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
        )
      case 'about':
        return <AboutSection />
      default:
        return null
    }
  }

  /** 分区列表页 */
  if (active === null || !activeSection) {
    return (
      <div className="grid gap-5">
        <Card padded={false} className="overflow-hidden">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActive(section.key)}
                className="flex w-full items-center gap-4 border-b border-border/50 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-[#A5B4FC]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{section.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{section.description}</span>
                </span>
                {section.key === 'about' ? <AboutBadge /> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </Card>
        <p className="text-center text-[11px] text-muted-foreground">点击任意分区进入详情修改，所有改动即时保存</p>
      </div>
    )
  }

  /** 分区详情页 */
  return (
    <div className="grid gap-5">
      <Card>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回设置
        </button>
        <SectionHeader title={activeSection.title} description={activeSection.description} />
        {renderSectionContent()}
      </Card>
    </div>
  )
}

/** 设置列表中「关于与版本」的小红点提示：检测到版本变化时显示「新」 */
function AboutBadge(): JSX.Element | null {
  const [isNew, setIsNew] = useState(false)
  useEffect(() => {
    let active = true
    void api.app
      .diagnostics()
      .then((info) => {
        if (!active) return
        const seen = window.localStorage.getItem('workstation.last-seen-version')
        setIsNew(Boolean(seen) && seen !== info.version)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  if (!isNew) return null
  return (
    <Badge tone="primary" dot>
      新
    </Badge>
  )
}

/** 关于与版本：显示当前版本 + 本版较于上一版本的更新内容 + 完整历史日志 */
function AboutSection(): JSX.Element {
  const [version, setVersion] = useState('…')
  const [previousSeen, setPreviousSeen] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(true)

  useEffect(() => {
    let active = true
    void api.app
      .diagnostics()
      .then((info) => {
        if (!active) return
        const current = info.version
        const seen = window.localStorage.getItem('workstation.last-seen-version')
        setVersion(current)
        setPreviousSeen(seen && seen !== current ? seen : null)
        window.localStorage.setItem('workstation.last-seen-version', current)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const matchedIndex = CHANGELOG.findIndex((entry) => entry.version === version)
  const isMatched = matchedIndex >= 0
  // 当前版本缺少独立日志时回退展示最新一条，保证任何版本都有更新信息可看
  const current = isMatched ? CHANGELOG[matchedIndex] : (CHANGELOG[0] ?? null)
  const history = CHANGELOG.filter((entry) => entry.version !== current?.version)

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">当前版本</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">v{version}</p>
        </div>
        {previousSeen ? (
          <Badge tone="primary" dot>
            已从 v{previousSeen} 更新
          </Badge>
        ) : (
          <Badge tone="success" dot>
            已是最新
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
          本版更新内容
          {isMatched ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              v{current?.version}
              {current?.date ? ` · ${current.date}` : ''}
            </span>
          ) : (
            <span className="text-[11px] font-normal text-warning">该版本日志待补充，以下为最新版本 v{current?.version} 的更新内容</span>
          )}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {(current?.items ?? ['暂无更新记录']).map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#A5B4FC]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/25">
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-medium text-foreground">历史版本更新日志 · {history.length} 个版本</span>
          <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showHistory && 'rotate-90')} />
        </button>
        {showHistory ? (
          <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-3">
            {history.map((entry) => (
              <div key={entry.version}>
                <p className="text-[11px] font-semibold text-foreground">
                  v{entry.version} <span className="ml-1 font-normal text-muted-foreground">{entry.date}</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {entry.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        本地应用无在线更新源；发布新版本后重新安装即可，此页面会自动对比上次使用的版本并展示更新内容。
      </p>
    </div>
  )
}
