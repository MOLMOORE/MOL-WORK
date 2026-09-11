import { useRef, useState } from 'react'
import { cn } from '../../lib/utils'

export interface DeferDialProps {
  /** 当前选择的延后分钟数 */
  minutes: number
  onChange: (minutes: number) => void
  /** 最大可延后分钟数 */
  max?: number
  className?: string
}

const SIZE = 168
const CENTER = SIZE / 2
const RADIUS = 64
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** 延时时间转盘：拖动指针选择延后分钟数（12 点方向为 0，顺时针增加） */
export function DeferDial({ minutes, onChange, max = 120, className }: DeferDialProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)
  const ratio = Math.min(1, Math.max(0, minutes / max))
  const angle = ratio * 360

  const updateFromPointer = (clientX: number, clientY: number): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (deg < 0) deg += 360
    const value = Math.max(1, Math.min(max, Math.round((deg / 360) * max)))
    if (value !== minutes) onChange(value)
  }

  const ticks = [0, 0.25, 0.5, 0.75].map((r) => ({ r, deg: r * 360, label: String(Math.round(r * max)) }))
  const knob = {
    x: CENTER + RADIUS * Math.sin((angle * Math.PI) / 180),
    y: CENTER - RADIUS * Math.cos((angle * Math.PI) / 180)
  }

  return (
    <div className={cn('flex flex-col items-center gap-1 select-none', className)}>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
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
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="hsl(var(--border))" strokeWidth={10} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="url(#deferGradient)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
        <defs>
          <linearGradient id="deferGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const rad = (tick.deg * Math.PI) / 180
          const x1 = CENTER + (RADIUS - 12) * Math.sin(rad)
          const y1 = CENTER - (RADIUS - 12) * Math.cos(rad)
          const x2 = CENTER + (RADIUS + 8) * Math.sin(rad)
          const y2 = CENTER - (RADIUS + 8) * Math.cos(rad)
          const lx = CENTER + (RADIUS + 18) * Math.sin(rad)
          const ly = CENTER - (RADIUS + 18) * Math.cos(rad)
          return (
            <g key={tick.r}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} opacity={0.6} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={9}>
                {tick.label}
              </text>
            </g>
          )
        })}
        <circle cx={knob.x} cy={knob.y} r={9} fill="#6366F1" stroke="white" strokeWidth={2} />
        <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-foreground" fontSize={26} fontWeight={700}>
          {minutes}
        </text>
        <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          分钟
        </text>
      </svg>
      <p className="text-[10px] text-muted-foreground">拖动转盘选择延后时长（1-{max} 分钟）</p>
    </div>
  )
}
