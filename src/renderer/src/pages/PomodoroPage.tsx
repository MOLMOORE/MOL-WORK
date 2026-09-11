import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coffee, Flame, Pause, Play, RotateCcw, SkipForward, Sparkles, Timer } from 'lucide-react'
import { Card, SectionHeader, StatCard } from '../components/ui/Card'
import { Badge } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Switch } from '../components/ui/Field'
import { usePomodoroStore, PHASE_META } from '../stores/pomodoroStore'
import { useAppStore } from '../stores/appStore'
import { useTaskStore } from '../stores/taskStore'
import { formatMinutes } from '../lib/utils'

const RADIUS = 108
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
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
        />
        <StatCard
          label="本次完成番茄"
          value={`${totalFocus} 个`}
          hint={`连续 ${completedFocus} / ${patch} 个进入长休息`}
          tone="warning"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="今日专注"
          value={formatMinutes(overview?.todayFocusMinutes ?? 0)}
          hint="含番茄钟与手动专注记录"
          tone="success"
          icon={<Flame className="h-4 w-4" />}
        />
        <StatCard
          label="专注时长"
          value={`${Math.round(config.focus / 60)} 分钟`}
          hint={`休息 ${Math.round(config.short / 60)} / ${Math.round(config.long / 60)} 分钟`}
          tone="info"
          icon={<Coffee className="h-4 w-4" />}
        />
      </div>

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

          <div className="relative flex h-[260px] w-[260px] items-center justify-center">
            <svg viewBox="0 0 260 260" className="absolute inset-0 -rotate-90">
              <circle cx="130" cy="130" r={RADIUS} fill="none" stroke="hsl(var(--muted))" strokeWidth="14" />
              <circle
                cx="130"
                cy="130"
                r={RADIUS}
                fill="none"
                stroke={meta.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                style={{ transition: 'stroke-dashoffset 0.6s linear' }}
              />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                {formatClock(secondsLeft)}
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground">{meta.label}中</span>
            </div>
          </div>

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
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
