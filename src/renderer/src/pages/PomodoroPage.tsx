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
import { Coffee, Flame, Pause, Play, RotateCcw, SkipForward, Sparkles, Timer } from 'lucide-react'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Switch } from '../components/ui/Field'
import { Modal } from '../components/ui/Overlay'
import { usePomodoroStore, PHASE_META } from '../stores/pomodoroStore'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { api } from '../lib/ipc'
import { addDays, formatDay, formatMinutes, todayKey } from '../lib/utils'

const TOMATO_RADIUS = 88
const TOMATO_CIRCUMFERENCE = 2 * Math.PI * TOMATO_RADIUS

type StatsChart = 'phase' | 'tomato' | 'today' | 'duration' | null

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** 番茄造型计时器：番茄主体（专注红/休息绿）+ 蒂叶 + 内圈进度弧 */
function TomatoTimer({
  progress,
  secondsLeft,
  phaseLabel,
  isFocus
}: {
  progress: number
  secondsLeft: number
  phaseLabel: string
  isFocus: boolean
}): JSX.Element {
  const body = isFocus
    ? { light: '#F87171', mid: '#EF4444', dark: '#991B1B', leaf: '#16A34A', leafDark: '#166534' }
    : { light: '#4ADE80', mid: '#22C55E', dark: '#15803D', leaf: '#0D9488', leafDark: '#115E59' }
  const dash = TOMATO_CIRCUMFERENCE * Math.min(1, Math.max(0, progress))

  return (
    <svg viewBox="0 0 260 288" className="h-[300px] w-[276px]">
      <defs>
        <radialGradient id="tomatoBody" cx="38%" cy="30%" r="82%">
          <stop offset="0%" stopColor={body.light} />
          <stop offset="55%" stopColor={body.mid} />
          <stop offset="100%" stopColor={body.dark} />
        </radialGradient>
      </defs>

      {/* 茎与萼叶 */}
      <g transform="translate(130,74)">
        <path d="M0,-14 C-2,-24 3,-30 8,-34" stroke={body.leafDark} strokeWidth="5.5" fill="none" strokeLinecap="round" />
        {[-70, -35, 0, 35, 70].map((deg) => (
          <path
            key={deg}
            d="M0,0 C13,-7 23,-5 30,1 C21,10 8,10 0,0 Z"
            fill={body.leaf}
            stroke={body.leafDark}
            strokeWidth="1"
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="4.5" fill={body.leafDark} />
      </g>

      {/* 番茄主体 */}
      <ellipse cx="130" cy="168" rx="106" ry="98" fill="url(#tomatoBody)" />
      <ellipse cx="90" cy="122" rx="30" ry="17" fill="white" opacity="0.28" transform="rotate(-22 90 122)" />
      <ellipse cx="176" cy="232" rx="22" ry="12" fill="black" opacity="0.12" transform="rotate(-18 176 232)" />

      {/* 内圈进度弧 */}
      <circle cx="130" cy="168" r={TOMATO_RADIUS} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="10" />
      <circle
        cx="130"
        cy="168"
        r={TOMATO_RADIUS}
        fill="none"
        stroke="white"
        strokeOpacity="0.9"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={TOMATO_CIRCUMFERENCE}
        strokeDashoffset={TOMATO_CIRCUMFERENCE * (1 - Math.max(0.001, progress))}
        transform="rotate(-90 130 168)"
        style={{ transition: 'stroke-dashoffset 0.6s linear' }}
      />

      {/* 中央时间 */}
      <text x="130" y="162" textAnchor="middle" fontSize="46" fontWeight="700" fill="white" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatClock(secondsLeft)}
      </text>
      <text x="130" y="192" textAnchor="middle" fontSize="13" fill="rgba(255,255,255,0.88)">
        {phaseLabel}中
      </text>
    </svg>
  )
}

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

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="当前阶段"
          value={meta.label}
          hint={running ? '计时进行中' : '已暂停'}
          tone={phase === 'focus' ? 'primary' : 'success'}
          icon={<Timer className="h-4 w-4" />}
          onClick={() => setChart('phase')}
        />
        <StatCard
          label="本次完成番茄"
          value={`${totalFocus} 个`}
          hint={`连续 ${completedFocus} / ${patch} 个进入长休息`}
          tone="warning"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => setChart('tomato')}
        />
        <StatCard
          label="今日专注"
          value={formatMinutes(overview?.todayFocusMinutes ?? 0)}
          hint="含番茄钟与手动专注记录"
          tone="success"
          icon={<Flame className="h-4 w-4" />}
          onClick={() => setChart('today')}
        />
        <StatCard
          label="专注时长"
          value={`${Math.round(config.focus / 60)} 分钟`}
          hint={`休息 ${Math.round(config.short / 60)} / ${Math.round(config.long / 60)} 分钟`}
          tone="info"
          icon={<Coffee className="h-4 w-4" />}
          onClick={() => setChart('duration')}
        />
      </div>

      <PomodoroStatsDialog chart={chart} config={config} onClose={() => setChart(null)} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card className="flex flex-col items-center gap-5">
          <div className="flex w-full items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">番茄工作法</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">专注 25 分钟，休息 5 分钟，循环推进</p>
            </div>
            <Badge tone={phase === 'focus' ? 'primary' : 'success'} dot>
              {meta.label}
            </Badge>
          </div>

          <TomatoTimer progress={progress} secondsLeft={secondsLeft} phaseLabel={meta.label} isFocus={phase === 'focus'} />

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              icon={running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              onClick={toggle}
            >
              {running ? '暂停' : '开始'}
            </Button>
            <Button variant="secondary" size="md" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={reset}>
              重置
            </Button>
            <Button variant="ghost" size="md" icon={<SkipForward className="h-3.5 w-3.5" />} onClick={skip}>
              跳过
            </Button>
          </div>

          <Field label="关联任务（完成后计入该任务专注时长）" className="w-full max-w-md">
            <Select
              value={taskId === null ? '' : String(taskId)}
              onChange={(event) => setTask(event.target.value === '' ? null : Number(event.target.value))}
            >
              <option value="">不关联任务</option>
              {activeTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader
              title="番茄钟参数"
              description="修改后立即生效，并同步保存到设置"
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
                  前往设置
                </Button>
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="专注时长（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={Math.round(config.focus / 60)}
                  onChange={(event) =>
                    void updateSettings({ defaultFocusMinutes: Math.max(1, Number(event.target.value) || 25) })
                  }
                />
              </Field>
              <Field label="短休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={Math.round(config.short / 60)}
                  onChange={(event) =>
                    void updateSettings({ pomodoroShortMinutes: Math.max(1, Number(event.target.value) || 5) })
                  }
                />
              </Field>
              <Field label="长休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={Math.round(config.long / 60)}
                  onChange={(event) =>
                    void updateSettings({ pomodoroLongMinutes: Math.max(1, Number(event.target.value) || 15) })
                  }
                />
              </Field>
              <Field label="长休息间隔（个）">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.roundsPerLong}
                  onChange={(event) =>
                    void updateSettings({ pomodoroRoundsPerLong: Math.max(1, Number(event.target.value) || 4) })
                  }
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/25 p-3">
              <Switch
                checked={config.autoStartNext}
                onChange={(checked) => void updateSettings({ pomodoroAutoStartNext: checked })}
                label="阶段结束后自动进入下一阶段"
              />
              <Switch
                checked={config.sound}
                onChange={(checked) => void updateSettings({ pomodoroSound: checked })}
                label="阶段结束时播放提示音"
              />
            </div>
          </Card>

          <Card>
            <SectionHeader title="使用说明" description="番茄钟完成的专注会写入专注记录并计入统计" />
            <ul className="flex flex-col gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <li>· 选择关联任务后，每个完成的专注会自动累计到该任务的投入时长。</li>
              <li>· 专注与休息阶段结束会弹出提示，可在设置中关闭声音。</li>
              <li>· 计时器在页面切换时仍会继续运行，顶栏会显示剩余时间。</li>
              <li>· 四个专注后进入长休息，帮助你保持节奏与专注度。</li>
              <li>· 点击上方任意统计卡片，可弹出对应的图表统计。</li>
            </ul>
          </Card>
        </div>
      </div>
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
              <Bar dataKey="tomatoes" name="番茄数" fill="#F59E0B" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : chart === 'today' ? (
            <BarChart data={hourlyData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip formatter={(value: number) => `${value} 分钟`} />
              <Bar dataKey="minutes" name="专注分钟" fill="#22C55E" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={trendData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="focusArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip formatter={(value: number) => `${value} 分钟`} />
              <Area type="monotone" dataKey="focusMinutes" name="专注分钟" stroke="#6366F1" strokeWidth={2} fill="url(#focusArea)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">数据来自本地专注记录与统计聚合</p>
    </Modal>
  )
}
