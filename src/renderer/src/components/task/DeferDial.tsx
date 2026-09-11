import { useRef, useState } from 'react'
import { cn } from '../../lib/utils'

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

/** 钟表样式转盘：拖动指针选择数值，外圈刻度 + 进度弧 + 指针 */
export function ClockDial({ value, max, label, majorLabels = [], onChange, size = 108 }: ClockDialProps): JSX.Element {
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
    if (next !== value) onChange(next)
  }

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
        {/* 表盘底圈 */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={7} />
        {/* 进度弧 */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#clockDialGradient)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.01, ratio) * circumference} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <defs>
          <linearGradient id="clockDialGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
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
              opacity={isMajor ? 0.7 : 0.3}
            />
          )
        })}
        {/* 主刻度数字标注 */}
        {majorLabels.map((major) => {
          const rad = ((major.at / max) * 360 * Math.PI) / 180
          const lx = center + (radius - 15) * Math.sin(rad)
          const ly = center - (radius - 15) * Math.cos(rad)
          return (
            <text key={major.at} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={8}>
              {major.text}
            </text>
          )
        })}
        {/* 指针 */}
        <line
          x1={center}
          y1={center}
          x2={knob.x}
          y2={knob.y}
          stroke="#6366F1"
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.85}
        />
        <circle cx={knob.x} cy={knob.y} r={6.5} fill="#6366F1" stroke="white" strokeWidth={2} />
        <circle cx={center} cy={center} r={2} fill="hsl(var(--muted-foreground))" opacity={0.6} />
        {/* 中心数值 */}
        <text x={center} y={center + 13} textAnchor="middle" className="fill-foreground" fontSize={17} fontWeight={700}>
          {value}
        </text>
      </svg>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
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
