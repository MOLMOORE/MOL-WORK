import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Minus, Plus, Volume2, Zap } from 'lucide-react'
import type { HourlyBucket, PomodoroPhase } from '@shared/types/domain'
import { api } from '../../lib/ipc'
import { cn, formatMinutes, todayKey } from '../../lib/utils'
import { PHASE_VISUALS } from './PomoStage'

/**
 * 番茄钟参数面板与今日节奏（v1.2.6）：
 * 参数从「四个输入框」改成步进器 + 常用预设，并画出一条「一个循环长什么样」的节奏带；
 * 今日节奏是一条 24 格的专注热力带，让人一眼看出专注都落在哪些小时。
 */

/** 整套节奏预设：市面番茄钟（Pomofocus / Focus To-Do）都有的一键档位，省得四个参数挨个点 */
export interface RhythmPreset {
  key: string
  label: string
  hint: string
  focus: number
  short: number
  long: number
  rounds: number
}

export const RHYTHM_PRESETS: RhythmPreset[] = [
  { key: 'classic', label: '标准番茄', hint: '25 / 5 / 15 · 4 个', focus: 25, short: 5, long: 15, rounds: 4 },
  { key: 'deep', label: '深度工作', hint: '50 / 10 / 20 · 2 个', focus: 50, short: 10, long: 20, rounds: 2 },
  { key: 'light', label: '轻松节奏', hint: '15 / 3 / 10 · 4 个', focus: 15, short: 3, long: 10, rounds: 4 }
]

const PRESETS: Record<'focus' | 'short' | 'long', number[]> = {
  focus: [15, 25, 45, 50],
  short: [3, 5, 10],
  long: [15, 20, 30]
}

interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  unit: string
  presets?: number[]
  onChange: (value: number) => void
}

function Stepper({ label, value, min, max, unit, presets, onChange }: StepperProps): JSX.Element {
  const clamp = (next: number): number => Math.min(max, Math.max(min, Math.round(next)))
  return (
    <div className="pomo-param">
      <div className="flex items-baseline justify-between gap-2">
        <span className="pomo-section-label">{label}</span>
        <span className="pomo-param-value">
          {value}
          <em>{unit}</em>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <div className="pomo-step">
          <button type="button" aria-label={'减少' + label} onClick={() => onChange(clamp(value - 1))}>
            <Minus className="h-3 w-3" />
          </button>
          <output>{value}</output>
          <button type="button" aria-label={'增加' + label} onClick={() => onChange(clamp(value + 1))}>
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {presets ? (
          <div className="flex flex-wrap items-center gap-1 sm:basis-full">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onChange(clamp(preset))}
                className={cn(
                  'pomo-chip',
                  value === preset && 'is-on'
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 一个完整循环的节奏带：专注与休息按分钟数成比例铺开 */
function RhythmBand({
  focus,
  short,
  long,
  rounds
}: {
  focus: number
  short: number
  long: number
  rounds: number
}): JSX.Element {
  const segments: { key: string; kind: 'focus' | 'shortBreak' | 'longBreak'; minutes: number }[] = []
  for (let index = 0; index < rounds; index += 1) {
    segments.push({ key: 'f' + index, kind: 'focus', minutes: focus })
    if (index === rounds - 1) segments.push({ key: 'l', kind: 'longBreak', minutes: long })
    else segments.push({ key: 's' + index, kind: 'shortBreak', minutes: short })
  }
  const total = segments.reduce((sum, item) => sum + item.minutes, 0)
  return (
    <div>
      <div className="pomo-rhythm" role="img" aria-label={'一个循环共 ' + total + ' 分钟'}>
        {segments.map((segment) => (
          <i
            key={segment.key}
            style={{
              flexGrow: segment.minutes,
              background: 'hsl(' + PHASE_VISUALS[segment.kind].hue + ' 68% 48% / ' + (segment.kind === 'focus' ? 0.92 : 0.5) + ')'
            }}
            title={PHASE_VISUALS[segment.kind].label + ' ' + segment.minutes + ' 分钟'}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        一个循环 {total} 分钟 · 约 {Math.max(1, Math.round(total / 60))} 小时后进入下一轮
      </p>
    </div>
  )
}

export interface PomoParamsProps {
  /** 当前阶段：决定面板上的强调色，与舞台保持同一套色相 */
  phase: PomodoroPhase
  focusMinutes: number
  shortMinutes: number
  longMinutes: number
  rounds: number
  autoStart: boolean
  sound: boolean
  onMinutes: (key: 'focus' | 'short' | 'long', minutes: number) => void
  onRounds: (rounds: number) => void
  onAutoStart: (value: boolean) => void
  onSound: (value: boolean) => void
  /** 一键套用整套节奏 */
  onPreset: (values: { focus: number; short: number; long: number; rounds: number }) => void
}

/** 参数面板：四个步进器 + 两个开关 + 节奏带 */
export function PomoParams({
  phase,
  focusMinutes,
  shortMinutes,
  longMinutes,
  rounds,
  autoStart,
  sound,
  onMinutes,
  onRounds,
  onAutoStart,
  onSound,
  onPreset
}: PomoParamsProps): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4" style={{ '--pomo-h': String(PHASE_VISUALS[phase].hue) } as CSSProperties}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Stepper
          label="专注时长"
          value={focusMinutes}
          min={1}
          max={120}
          unit="分钟"
          presets={PRESETS.focus}
          onChange={(value) => onMinutes('focus', value)}
        />
        <Stepper
          label="短休息"
          value={shortMinutes}
          min={1}
          max={60}
          unit="分钟"
          presets={PRESETS.short}
          onChange={(value) => onMinutes('short', value)}
        />
        <Stepper
          label="长休息"
          value={longMinutes}
          min={1}
          max={90}
          unit="分钟"
          presets={PRESETS.long}
          onChange={(value) => onMinutes('long', value)}
        />
        <Stepper
          label="长休息间隔"
          value={rounds}
          min={1}
          max={10}
          unit="个"
          onChange={(value) => onRounds(value)}
        />
      </div>

      <div>
        <p className="pomo-section-label mb-1.5">节奏预览</p>
        <RhythmBand focus={focusMinutes} short={shortMinutes} long={longMinutes} rounds={rounds} />
      </div>

      <div>
        <p className="pomo-section-label mb-1.5">整套预设</p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {RHYTHM_PRESETS.map((preset) => {
            const on =
              preset.focus === focusMinutes &&
              preset.short === shortMinutes &&
              preset.long === longMinutes &&
              preset.rounds === rounds
            return (
              <button
                key={preset.key}
                type="button"
                data-on={on}
                className="pomo-preset"
                onClick={() =>
                  onPreset({ focus: preset.focus, short: preset.short, long: preset.long, rounds: preset.rounds })
                }
              >
                <b>{preset.label}</b>
                <span>{preset.hint}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 rounded-xl border border-border bg-muted/25 px-3 py-1.5">
        <button type="button" className="pomo-switch" data-on={autoStart} onClick={() => onAutoStart(!autoStart)}>
          <span className="pomo-switch-icon">
            <Zap className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-left">阶段结束后自动继续</span>
          <span className="pomo-switch-track" data-on={autoStart}>
            <span className="pomo-switch-knob" />
          </span>
        </button>
        <button type="button" className="pomo-switch" data-on={sound} onClick={() => onSound(!sound)}>
          <span className="pomo-switch-icon">
            <Volume2 className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 text-left">阶段结束播放提示音</span>
          <span className="pomo-switch-track" data-on={sound}>
            <span className="pomo-switch-knob" />
          </span>
        </button>
      </div>
    </div>
  )
}

/** 今日节奏：24 格专注热力带（数据来自本地专注记录，按小时聚合） */
export function PomoToday({
  refreshKey,
  phase = 'focus'
}: {
  refreshKey: string | number
  phase?: PomodoroPhase
}): JSX.Element {
  const [hourly, setHourly] = useState<HourlyBucket[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let active = true
    void api.stats
      .daily(todayKey())
      .then((stats) => {
        if (!active) return
        setHourly(stats.hourly)
        setTotal(stats.focusMinutes)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [refreshKey])

  const peak = hourly.reduce((max, bucket) => Math.max(max, bucket.focusMinutes), 0)
  const busyHours = hourly.filter((bucket) => bucket.focusMinutes > 0).length

  return (
    <div className="flex h-full flex-col" style={{ '--pomo-h': String(PHASE_VISUALS[phase].hue) } as CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-2">
          <span className="pomo-section-label">今日专注</span>
          <b className="text-xl font-semibold tabular-nums tracking-tight text-foreground">{formatMinutes(total)}</b>
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {busyHours > 0 ? '分布在 ' + busyHours + ' 个小时段 · 峰值 ' + peak + ' 分钟' : '还没有专注记录'}
        </p>
      </div>
      <div className="pomo-bars mt-2.5" aria-label="今日各小时专注时长">
        {hourly.map((bucket) => {
          const ratio = peak > 0 ? bucket.focusMinutes / peak : 0
          return (
            <i
              key={bucket.hour}
              data-empty={bucket.focusMinutes === 0}
              style={{ height: Math.max(4, Math.round(ratio * 100)) + '%' }}
              title={bucket.hour + ' · ' + bucket.focusMinutes + ' 分钟'}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/80">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="pomo-hint mt-1.5 text-right">柱高按峰值缩放 · 点上方数字卡看明细</p>
    </div>
  )
}