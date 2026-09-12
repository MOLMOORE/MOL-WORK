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
import { GridBoard, type GridEntry } from '../components/layout/GridBoard'
import { ClockTile } from '../components/layout/ClockTile'
import { usePomodoroStore, PHASE_META } from '../stores/pomodoroStore'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { api } from '../lib/ipc'
import { addDays, formatDay, formatMinutes, todayKey } from '../lib/utils'

type StatsChart = 'phase' | 'tomato' | 'today' | 'duration' | null

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** 番茄造型计时器：饱满果形（专注红/休息绿）+ 五瓣萼叶 + 外圈进度环 + 端点圆点 */
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
  const safeProgress = Math.min(1, Math.max(0, progress))
  const radius = 128
  const circumference = 2 * Math.PI * radius
  const angle = safeProgress * 360
  const knob = {
    x: 150 + radius * Math.sin((angle * Math.PI) / 180),
    y: 192 - radius * Math.cos((angle * Math.PI) / 180)
  }
  // 萼叶角度与大小（参考真实番茄的放射状萼片，交替大小更自然）
  const leaves: { deg: number; scale: number }[] = [
    { deg: -78, scale: 0.82 },
    { deg: -40, scale: 1 },
    { deg: -4, scale: 0.72 },
    { deg: 32, scale: 1 },
    { deg: 70, scale: 0.82 }
  ]

  return (
    <svg viewBox="0 0 300 340" className="h-[330px] w-[292px]">
      <defs>
        <radialGradient id="tomatoBody" cx="36%" cy="26%" r="88%">
          <stop offset="0%" stopColor={isFocus ? '#FF9B8F' : '#A7F3D0'} />
          <stop offset="38%" stopColor={isFocus ? '#F2544B' : '#4ADE80'} />
          <stop offset="72%" stopColor={isFocus ? '#DC2626' : '#22C55E'} />
          <stop offset="100%" stopColor={isFocus ? '#8F1212' : '#166534'} />
        </radialGradient>
        <linearGradient id="tomatoLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#86EFAC" />
          <stop offset="55%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <filter id="tomatoGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor={isFocus ? '#B91C1C' : '#166534'} floodOpacity="0.45" />
        </filter>
        <filter id="tomatoTextShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* 外圈进度轨道 */}
      <circle cx="150" cy="192" r={radius} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="9" />
      {/* 外圈进度 */}
      <circle
        cx="150"
        cy="192"
        r={radius}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.92"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0.002, safeProgress))}
        transform="rotate(-90 150 192)"
        style={{ transition: 'stroke-dashoffset 0.6s linear' }}
      />
      {/* 进度端点圆点 */}
      <circle cx={knob.x} cy={knob.y} r="6" fill="#FFFFFF" stroke={isFocus ? '#DC2626' : '#22C55E'} strokeWidth="2.5" />

      {/* 番茄果体（贝塞尔果形，顶部带肩、底部饱满） */}
      <path
        d="M150 82
           C 98 74, 48 108, 40 160
           C 34 204, 54 254, 100 276
           C 122 286, 178 286, 200 276
           C 246 254, 266 204, 260 160
           C 252 108, 202 74, 150 82 Z"
        fill="url(#tomatoBody)"
        filter="url(#tomatoGlow)"
      />
      {/* 左上大弧高光 */}
      <path
        d="M88 128 C 100 100, 126 86, 150 84 C 130 94, 110 112, 100 140 C 94 154, 92 166, 94 176 C 84 162, 82 144, 88 128 Z"
        fill="#FFFFFF"
        opacity="0.32"
      />
      {/* 右上小反光 */}
      <ellipse cx="198" cy="122" rx="15" ry="9" fill="#FFFFFF" opacity="0.22" transform="rotate(26 198 122)" />
      {/* 底部暗部 */}
      <path d="M100 276 C 122 286, 178 286, 200 276 C 176 266, 124 266, 100 276 Z" fill="#000000" opacity="0.12" />

      {/* 果茎与五瓣萼叶 */}
      <g transform="translate(150, 84)">
        <path d="M0 -4 C -2 -18, 5 -28, 15 -33" stroke="#15803D" strokeWidth="6" fill="none" strokeLinecap="round" />
        {leaves.map((leaf) => (
          <g key={leaf.deg} transform={`rotate(${leaf.deg}) scale(${leaf.scale})`}>
            <path d="M0 0 C 9 -20, 32 -28, 48 -15 C 35 5, 12 11, 0 0 Z" fill="url(#tomatoLeaf)" />
            <path d="M3 -2 Q 24 -16 45 -14" stroke="#166534" strokeWidth="1.2" fill="none" opacity="0.75" strokeLinecap="round" />
          </g>
        ))}
        <circle r="5.5" fill="#166534" />
        <circle r="2.5" cx="-1.5" cy="-1.5" fill="#4ADE80" opacity="0.8" />
      </g>

      {/* 中央时间与阶段 */}
      <text
        x="150"
        y="190"
        textAnchor="middle"
        fontSize="52"
        fontWeight="700"
        fill="#FFFFFF"
        filter="url(#tomatoTextShadow)"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}
      >
        {formatClock(secondsLeft)}
      </text>
      <text x="150" y="222" textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.9)" filter="url(#tomatoTextShadow)">
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

  const entries: GridEntry[] = [
    { id: 'clock', title: '时间显示', x: 0, y: 0, w: 12, h: 3, minW: 4, minH: 2, node: <ClockTile /> },
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
      h: 11,
      minW: 5,
      minH: 7,
      node: (
        <Card className="flex h-full flex-col items-center justify-center gap-5">
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
      )
    },
    {
      id: 'help',
      title: '使用说明',
      x: 7,
      y: 13,
      w: 5,
      h: 4,
      minW: 4,
      minH: 3,
      node: (
          <Card className="flex h-full flex-col overflow-y-auto">
            <SectionHeader title="使用说明" description="番茄钟完成的专注会写入专注记录并计入统计" />
            <ul className="flex flex-col gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <li>· 选择关联任务后，每个完成的专注会自动累计到该任务的投入时长。</li>
              <li>· 专注与休息阶段结束会弹出提示，可在设置中关闭声音。</li>
              <li>· 计时器在页面切换时仍会继续运行，顶栏会显示剩余时间。</li>
              <li>· 四个专注后进入长休息，帮助你保持节奏与专注度。</li>
              <li>· 点击上方任意统计卡片，可弹出对应的图表统计。</li>
            </ul>
          </Card>
      )
    }
  ]

  return (
    <div className="grid gap-5">
      <GridBoard entries={entries} storageKey="workstation.grid.pomodoro.v2" />
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
