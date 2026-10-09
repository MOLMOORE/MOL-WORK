import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Area, AreaChart } from 'recharts'
import { Coffee, Flame, Sparkles, Timer } from 'lucide-react'
import type { PomodoroPhase } from '@shared/types/domain'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Field'
import { PomoStage } from '../components/pomodoro/PomoStage'
import { PomoParams, PomoToday } from '../components/pomodoro/PomoPanels'
import { Modal } from '../components/ui/Overlay'
import { PageGrid } from '../components/layout/PageGrid'
import type { GridEntry } from '../components/layout/GridBoard'
import { usePomodoroStore, PHASE_META } from '../stores/pomodoroStore'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { api } from '../lib/ipc'
import { addDays, formatDay, formatMinutes, todayKey } from '../lib/utils'

type StatsChart = 'phase' | 'tomato' | 'today' | 'duration' | null

/** 计时钟面、阶段条与参数面板都在 components/pomodoro 里：页面只负责取数与栅格布局 */
export function PomodoroPage(): JSX.Element {
  const navigate = useNavigate()
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const overview = useAppStore((state) => state.overview)
  const tasks = useTaskStore((state) => state.tasks)
  const loadTasks = useTaskStore((state) => state.load)

  const phase = usePomodoroStore((state) => state.phase)
  const running = usePomodoroStore((state) => state.running)
  const secondsLeft = usePomodoroStore((state) => state.secondsLeft)
  const completedFocus = usePomodoroStore((state) => state.completedFocus)
  const totalFocus = usePomodoroStore((state) => state.totalFocus)
  const taskId = usePomodoroStore((state) => state.taskId)
  const config = usePomodoroStore((state) => state.config)
  const sync = usePomodoroStore((state) => state.sync)
  const setTask = usePomodoroStore((state) => state.setTask)
  const toggle = usePomodoroStore((state) => state.toggle)
  const reset = usePomodoroStore((state) => state.reset)
  const skip = usePomodoroStore((state) => state.skip)
  const switchPhase = usePomodoroStore((state) => state.switchPhase)

  /** 统计弹窗：点击统计卡片后弹出对应图表 */
  const [chart, setChart] = useState<StatsChart>(null)

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (!settings) return
    sync({
      focus: settings.defaultFocusMinutes * 60,
      short: settings.pomodoroShortMinutes * 60,
      long: settings.pomodoroLongMinutes * 60,
      roundsPerLong: settings.pomodoroRoundsPerLong,
      autoStartNext: settings.pomodoroAutoStartNext,
      sound: settings.pomodoroSound
    })
  }, [settings, sync])

  const total = useMemo(() => {
    if (phase === 'focus') return config.focus
    if (phase === 'shortBreak') return config.short
    return config.long
  }, [phase, config])

  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - secondsLeft / total)) : 0
  const meta = PHASE_META[phase]
  const activeTasks = tasks.filter((task) => task.status !== 'done')

  const patch = config.roundsPerLong
  /** 今日番茄数：与统计里「每 25 分钟约 1 个番茄」同一折算口径 */
  const todayMinutes = overview?.todayFocusMinutes ?? 0
  const todayTomatoes = Math.floor(todayMinutes / 25)

  // 快捷键：空格 开始/暂停、R 重置；输入框里、统计弹窗开着时不抢按键
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (chart !== null) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      } else if (event.key === 'r' || event.key === 'R') {
        reset()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chart, toggle, reset])

  const entries: GridEntry[] = [
    {
      id: 'metric-phase',
      title: '当前阶段',
      x: 0,
      y: 3,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="当前阶段"
          value={meta.label}
          hint={running ? '计时进行中' : '已暂停'}
          tone={phase === 'focus' ? 'primary' : 'success'}
          icon={<Timer className="h-4 w-4" />}
          onClick={() => setChart('phase')}
        />
      )
    },
    {
      id: 'metric-tomato',
      title: '本次完成番茄',
      x: 3,
      y: 3,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="本次完成番茄"
          value={`${totalFocus} 个`}
          hint={`连续 ${completedFocus} / ${patch} 个进入长休息`}
          tone="warning"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => setChart('tomato')}
        />
      )
    },
    {
      id: 'metric-today',
      title: '今日专注',
      x: 6,
      y: 3,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="今日专注"
          value={formatMinutes(overview?.todayFocusMinutes ?? 0)}
          hint="含番茄钟与手动专注记录"
          tone="success"
          icon={<Flame className="h-4 w-4" />}
          onClick={() => setChart('today')}
        />
      )
    },
    {
      id: 'metric-duration',
      title: '专注时长',
      x: 9,
      y: 3,
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
      node: (
        <StatCard
          label="专注时长"
          value={`${Math.round(config.focus / 60)} 分钟`}
          hint={`休息 ${Math.round(config.short / 60)} / ${Math.round(config.long / 60)} 分钟`}
          tone="info"
          icon={<Coffee className="h-4 w-4" />}
          onClick={() => setChart('duration')}
        />
      )
    },
    {
      id: 'timer',
      title: '番茄计时器',
      x: 0,
      y: 5,
      w: 7,
      h: 8,
      minW: 5,
      minH: 7,
      node: (
        <Card padded={false} className="h-full overflow-hidden">
          <PomoStage
            phase={phase}
            running={running}
            progress={progress}
            secondsLeft={secondsLeft}
            completedFocus={completedFocus}
            roundsPerLong={patch}
            todayTomatoes={todayTomatoes}
            todayMinutes={todayMinutes}
            focusMinutes={Math.round(config.focus / 60)}
            shortMinutes={Math.round(config.short / 60)}
            onToggle={toggle}
            onReset={reset}
            onSkip={skip}
            onSwitchPhase={switchPhase}
            footer={
              <div className="pomo-task">
                <span className="pomo-task-label">关联任务</span>
                <div className="w-[186px]">
                  <Select
                    value={taskId === null ? '' : String(taskId)}
                    onChange={(event) => setTask(event.target.value === '' ? null : Number(event.target.value))}
                    title="完成后专注时长计入该任务"
                    className="h-7 py-0 text-[11px]"
                  >
                    <option value="">不关联任务</option>
                    {activeTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            }
          />
        </Card>
      )
    },
    {
      id: 'params',
      title: '番茄钟参数',
      x: 7,
      y: 5,
      w: 5,
      h: 8,
      minW: 4,
      minH: 5,
      node: (
          <Card className="flex h-full flex-col overflow-y-auto">
            <SectionHeader
              title="番茄钟参数"
              description="改一下就走：数值即时生效并同步到设置"
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
                  前往设置
                </Button>
              }
            />
            <PomoParams
              phase={phase}
              focusMinutes={Math.round(config.focus / 60)}
              shortMinutes={Math.round(config.short / 60)}
              longMinutes={Math.round(config.long / 60)}
              rounds={config.roundsPerLong}
              autoStart={config.autoStartNext}
              sound={config.sound}
              onMinutes={(key, minutes) => {
                if (key === 'focus') void updateSettings({ defaultFocusMinutes: minutes })
                else if (key === 'short') void updateSettings({ pomodoroShortMinutes: minutes })
                else void updateSettings({ pomodoroLongMinutes: minutes })
              }}
              onRounds={(rounds) => void updateSettings({ pomodoroRoundsPerLong: rounds })}
              onAutoStart={(value) => void updateSettings({ pomodoroAutoStartNext: value })}
              onSound={(value) => void updateSettings({ pomodoroSound: value })}
              onPreset={(values) =>
                void updateSettings({
                  defaultFocusMinutes: values.focus,
                  pomodoroShortMinutes: values.short,
                  pomodoroLongMinutes: values.long,
                  pomodoroRoundsPerLong: values.rounds
                })
              }
            />
          </Card>
      )
    },
    {
      id: 'today',
      title: '今日节奏',
      x: 0,
      y: 13,
      w: 12,
      h: 3,
      minW: 5,
      minH: 2,
      node: (
        <Card className="flex h-full flex-col overflow-hidden">
          <PomoToday refreshKey={todayMinutes} phase={phase} />
        </Card>
      )
    }
  ]

  return (
    <div className="grid gap-5">
      <PageGrid pageKey="pomodoro" entries={entries} storageKey="workstation.grid.pomodoro.v5" />
      <PomodoroStatsDialog chart={chart} config={config} onClose={() => setChart(null)} />
    </div>
  )
}

interface PomodoroStatsDialogProps {
  chart: StatsChart
  config: { focus: number; short: number; long: number }
  onClose: () => void
}

const CHART_TITLES: Record<Exclude<StatsChart, null>, { title: string; description: string }> = {
  phase: { title: '阶段结构占比', description: '当前番茄钟配置中各阶段时长占比' },
  tomato: { title: '近 7 日番茄产出', description: '每日完成的专注时段数（每 25 分钟约 1 个番茄）' },
  today: { title: '今日专注分布', description: '按小时统计的今日专注时长（分钟）' },
  duration: { title: '近 7 日专注时长', description: '每日累计专注分钟数趋势' }
}

/** 番茄钟统计弹窗：点击统计卡片后展示对应图表 */
function PomodoroStatsDialog({ chart, config, onClose }: PomodoroStatsDialogProps): JSX.Element | null {
  const [trendData, setTrendData] = useState<{ date: string; label: string; focusMinutes: number; completed: number }[]>([])
  const [hourlyData, setHourlyData] = useState<{ hour: string; minutes: number }[]>([])

  useEffect(() => {
    if (chart === null) return
    let active = true
    if (chart === 'tomato' || chart === 'duration') {
      void api.stats
        .trend(formatDay(addDays(new Date(), -6).toISOString()), todayKey())
        .then((points) => {
          if (!active) return
          setTrendData(
            points.map((point) => ({
              ...point,
              label: point.date.slice(5),
              tomatoes: Math.round(point.focusMinutes / 25)
            }))
          )
        })
        .catch(() => undefined)
    }
    if (chart === 'today' || chart === 'phase') {
      void api.stats
        .daily(todayKey())
        .then((stats) => {
          if (!active) return
          setHourlyData(stats.hourly.map((bucket) => ({ hour: `${bucket.hour}时`, minutes: bucket.focusMinutes })))
        })
        .catch(() => undefined)
    }
    return () => {
      active = false
    }
  }, [chart])

  if (chart === null) return null
  const meta = CHART_TITLES[chart]

  const phasePie = [
    { name: '专注', value: Math.round(config.focus / 60), fill: '#EF4444' },
    { name: '短休息', value: Math.round(config.short / 60), fill: '#22C55E' },
    { name: '长休息', value: Math.round(config.long / 60), fill: '#06B6D4' }
  ]

  return (
    <Modal open onClose={onClose} title={meta.title} description={meta.description} width="max-w-2xl">
      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart === 'phase' ? (
            <PieChart>
              <Pie data={phasePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={64} outerRadius={100} paddingAngle={3}>
                {phasePie.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} 分钟`} />
              <Legend />
            </PieChart>
          ) : chart === 'tomato' ? (
            <BarChart data={trendData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip formatter={(value: number) => `${value} 个`} />
              <Bar dataKey="tomatoes" name="番茄数" fill="hsl(var(--warning))" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : chart === 'today' ? (
            <BarChart data={hourlyData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip formatter={(value: number) => `${value} 分钟`} />
              <Bar dataKey="minutes" name="专注分钟" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={trendData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="focusArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip formatter={(value: number) => `${value} 分钟`} />
              <Area type="monotone" dataKey="focusMinutes" name="专注分钟" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#focusArea)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">数据来自本地专注记录与统计聚合</p>
    </Modal>
  )
}
