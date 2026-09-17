import { useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { playTick } from '../../lib/sound'

export interface ClockDialProps {
  /** 当前值 */
  value: number
  /** 最大值（时=23，分/秒=59） */
  max: number
  /** 单位标签 */
  label: string
  /** 主刻度标注 */
  majorLabels?: { at: number; text: string }[]
  onChange: (value: number) => void
  size?: number
}

/** 钟表样式转盘：拖动指针选择数值，外圈刻度 + 进度弧 + 指针（拨动时带咔哒声） */
export function ClockDial({ value, max, label, majorLabels = [], onChange, size = 132 }: ClockDialProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)

  const center = size / 2
  const radius = center - 14
  const circumference = 2 * Math.PI * radius
  const ratio = max === 0 ? 0 : Math.min(1, value / max)
  const angle = ratio * 360
  const tickCount = max === 23 ? 24 : 60
  const knob = {
    x: center + radius * Math.sin((angle * Math.PI) / 180),
    y: center - radius * Math.cos((angle * Math.PI) / 180)
  }

  const updateFromPointer = (clientX: number, clientY: number): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (deg < 0) deg += 360
    const next = Math.max(0, Math.min(max, Math.round((deg / 360) * max)))
    if (next !== value) {
      playTick()
      onChange(next)
    }
  }

  const needle = radius - 16
  const needleTail = 10

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn('touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          updateFromPointer(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (dragging) updateFromPointer(event.clientX, event.clientY)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <defs>
          <linearGradient id="clockDialGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
          <radialGradient id="clockFaceGradient" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--background))" />
          </radialGradient>
          <linearGradient id="bezelGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* 表壳 bezel：双环 */}
        <circle cx={center} cy={center} r={radius + 9} fill="none" stroke="url(#bezelGradient)" strokeWidth={3} />
        <circle cx={center} cy={center} r={radius + 5} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
        {/* 表盘底 */}
        <circle cx={center} cy={center} r={radius + 2} fill="url(#clockFaceGradient)" />
        {/* 进度弧 */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#clockDialGradient)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.01, ratio) * circumference} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
          opacity={0.9}
        />
        {/* 外圈细刻度 */}
        {Array.from({ length: tickCount }, (_, index) => {
          const rad = ((index / tickCount) * 360 * Math.PI) / 180
          const isMajor = index % (tickCount / 4) === 0
          const inner = radius - (isMajor ? 7 : 4)
          return (
            <line
              key={index}
              x1={center + inner * Math.sin(rad)}
              y1={center - inner * Math.cos(rad)}
              x2={center + (radius - 1) * Math.sin(rad)}
              y2={center - (radius - 1) * Math.cos(rad)}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={isMajor ? 2 : 1}
              opacity={isMajor ? 0.75 : 0.3}
            />
          )
        })}
        {/* 主刻度数字标注（内移，避免被表壳边缘遮挡） */}
        {majorLabels.map((major) => {
          const rad = ((major.at / max) * 360 * Math.PI) / 180
          const lx = center + (radius - 22) * Math.sin(rad)
          const ly = center - (radius - 22) * Math.cos(rad)
          return (
            <text key={major.at} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" fontSize={9.5} fontWeight={600}>
              {major.text}
            </text>
          )
        })}
        {/* 时钟指针：锥形针身 + 尾部配重，随角度旋转 */}
        <g transform={`rotate(${angle} ${center} ${center})`}>
          <polygon
            points={`${center - 3},${center + needleTail} ${center - 1.4},${center - needle * 0.3} ${center},${center - needle} ${center + 1.4},${center - needle * 0.3} ${center + 3},${center + needleTail}`}
            fill="url(#clockDialGradient)"
          />
        </g>
        {/* 中心金属帽 */}
        <circle cx={center} cy={center} r={6.5} fill="hsl(var(--surface))" stroke="hsl(var(--muted-foreground))" strokeWidth={1.4} />
        <circle cx={center} cy={center} r={2.4} fill="hsl(var(--primary))" />
        {/* 顶部把手（拖动点视觉强化） */}
        <circle cx={knob.x} cy={knob.y} r={4.5} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={1.5} />
      </svg>
      <span className="text-[11px] font-medium text-foreground">
        {label} <span className="tabular-nums text-tint-primary">{value}</span>
      </span>
    </div>
  )
}

export interface DeferDialProps {
  hours: number
  minutes: number
  seconds: number
  onChange: (next: { hours: number; minutes: number; seconds: number }) => void
  className?: string
}

/** 延时转盘：时 / 分 / 秒 三个钟表转盘组合 */
export function DeferDial({ hours, minutes, seconds, onChange, className }: DeferDialProps): JSX.Element {
  return (
    <div className={cn('flex items-start justify-center gap-3 select-none', className)}>
      <ClockDial
        value={hours}
        max={23}
        label="小时"
        majorLabels={[
          { at: 0, text: '0' },
          { at: 6, text: '6' },
          { at: 12, text: '12' },
          { at: 18, text: '18' }
        ]}
        onChange={(hours) => onChange({ hours, minutes, seconds })}
      />
      <ClockDial
        value={minutes}
        max={59}
        label="分钟"
        majorLabels={[
          { at: 0, text: '0' },
          { at: 15, text: '15' },
          { at: 30, text: '30' },
          { at: 45, text: '45' }
        ]}
        onChange={(minutes) => onChange({ hours, minutes, seconds })}
      />
      <ClockDial
        value={seconds}
        max={59}
        label="秒"
        majorLabels={[
          { at: 0, text: '0' },
          { at: 15, text: '15' },
          { at: 30, text: '30' },
          { at: 45, text: '45' }
        ]}
        onChange={(seconds) => onChange({ hours, minutes, seconds })}
      />
    </div>
  )
}

/** 把延后总秒数格式化为可读文本 */
export function formatDeferSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} 秒`)
  return parts.join(' ')
}
