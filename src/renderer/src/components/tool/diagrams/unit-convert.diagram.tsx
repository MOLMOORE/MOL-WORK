import type { DiagramProps } from './types'

// 单位类别示意图

interface SvgTextProps {
  x: number
  y: number
  children: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'normal' | 'muted' | 'primary'
  weight?: number
}

interface UnitGroup {
  name: string
  units: string[]
}

const UNIT_GROUPS: UnitGroup[] = [
  { name: '长度', units: ['m', 'km', 'cm', 'mm', 'um', 'nm', 'mi', 'yd', 'ft', 'inch', 'nmi', 'li'] },
  { name: '质量', units: ['kg', 'g', 'mg', 't', 'lb', 'oz', 'jin'] },
  { name: '面积', units: ['m2', 'km2', 'cm2', 'ha', 'mu', 'acre', 'ft2'] },
  { name: '体积', units: ['L', 'mL', 'm3', 'gal', 'qt', 'floz'] },
  { name: '速度', units: ['mps', 'kmph', 'mph', 'kn'] },
  { name: '数据量', units: ['B', 'KB', 'MB', 'GB', 'TB', 'bit'] },
  { name: '时间', units: ['ms', 's', 'min', 'h', 'day', 'week'] },
  { name: '压强', units: ['Pa', 'kPa', 'MPa', 'bar', 'atm', 'mmHg', 'psi'] },
  { name: '能量', units: ['J', 'kJ', 'cal', 'kcal', 'Wh', 'kWh'] },
  { name: '频率', units: ['Hz', 'kHz', 'MHz', 'GHz'] },
  { name: '角度', units: ['deg', 'rad', 'grad'] },
  { name: '温度', units: ['C', 'F', 'K'] }
]

function SvgText({ x, y, children, size = 9, anchor = 'middle', tone = 'normal', weight }: SvgTextProps): JSX.Element {
  let className = 'text-foreground'
  if (tone === 'muted') className = 'text-muted-foreground'
  if (tone === 'primary') className = 'text-primary'
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill="currentColor" stroke="none" className={className}>{children}</text>
}

function Dot({ x, y }: { x: number; y: number }): JSX.Element {
  return <circle cx={x} cy={y} r={2.3} fill="currentColor" stroke="none" />
}

function ArrowDefinitions(): JSX.Element {
  return (
    <defs>
      <marker
        id="unit-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path
          d="M 1 1 L 8 5 L 1 9"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </marker>
    </defs>
  )
}

function makeWavePath(): string {
  const points: string[] = []
  const start = -58
  const end = 58
  const steps = 48

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps
    const x = start + (end - start) * ratio
    const y = 8 - 18 * Math.sin(ratio * Math.PI * 4)
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
  }

  return `M ${points.join(' L ')}`
}

function CategoryDrawing({
  category
}: {
  category: string
}): JSX.Element {
  if (category === '长度') {
    return (
      <g>
        <rect x={-72} y={-14} width={144} height={28} rx={2} />
        <path d="M-60 -14 V-2 M-45 -14 V-6 M-30 -14 V-2 M-15 -14 V-6 M0 -14 V-2 M15 -14 V-6 M30 -14 V-2 M45 -14 V-6 M60 -14 V-2" />
        <line
          x1={-72}
          y1={26}
          x2={72}
          y2={26}
          markerStart="url(#unit-arrow)"
          markerEnd="url(#unit-arrow)"
        />
      </g>
    )
  }

  if (category === '质量') {
    return (
      <g>
        <path d="M-26 40 H26" />
        <path d="M0 40 V-16" />
        <path d="M-48 -16 H48" />
        <path d="M-48 -16 V-4 M48 -16 V-4" />
        <path d="M-60 -4 Q-48 10 -36 -4" />
        <path d="M36 -4 Q48 10 60 -4" />
        <Dot x={0} y={-16} />
        <circle cx={-48} cy={0} r={4} fill="currentColor" stroke="none" />
        <rect x={42} y={-8} width={12} height={8} />
      </g>
    )
  }

  if (category === '面积') {
    return (
      <g>
        <rect x={-52} y={-30} width={104} height={60} rx={2} />
        <path
          d="M-26 -30 V30 M0 -30 V30 M26 -30 V30 M-52 -10 H52 M-52 10 H52"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <line
          x1={-52}
          y1={-42}
          x2={52}
          y2={-42}
          markerStart="url(#unit-arrow)"
          markerEnd="url(#unit-arrow)"
        />
      </g>
    )
  }

  if (category === '体积') {
    return (
      <g>
        <path d="M-28 -32 V24 Q-28 34 -18 34 H18 Q28 34 28 24 V-32" />
        <path d="M28 -32 L40 -26" />
        <path
          d="M-27 8 Q-13.5 2 0 8 T27 8"
          className="text-primary"
          stroke="currentColor"
        />
        <path
          d="M-28 -18 H-19 M-28 -5 H-19 M-28 20 H-19"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
      </g>
    )
  }

  if (category === '速度') {
    return (
      <g>
        <path d="M-46 12 A46 46 0 0 1 46 12" />
        <path
          d="M-46 12 H46"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <path
          d="M0 -34 V-27 M-32.5 -20.5 L-26.9 -14.9 M32.5 -20.5 L26.9 -14.9"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <line
          x1={0}
          y1={12}
          x2={22}
          y2={-16}
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1.6}
          markerEnd="url(#unit-arrow)"
        />
        <Dot x={0} y={12} />
      </g>
    )
  }

  if (category === '数据量') {
    return (
      <g>
        <rect x={-30} y={-30} width={26} height={26} rx={2} />
        <rect x={2} y={-30} width={26} height={26} rx={2} />
        <rect x={-30} y={2} width={26} height={26} rx={2} />
        <rect x={2} y={2} width={26} height={26} rx={2} />
        <SvgText x={-17} y={-13}>1</SvgText>
        <SvgText x={15} y={-13}>0</SvgText>
        <SvgText x={-17} y={21}>0</SvgText>
        <SvgText x={15} y={21}>1</SvgText>
      </g>
    )
  }

  if (category === '时间') {
    return (
      <g>
        <circle cx={0} cy={0} r={34} />
        <path
          d="M0 -34 V-28 M34 0 H28 M0 34 V28 M-34 0 H-28"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <path d="M0 0 V-22" strokeWidth={1.8} />
        <path d="M0 0 H15" strokeWidth={1.8} />
        <Dot x={0} y={0} />
      </g>
    )
  }

  if (category === '压强') {
    return (
      <g>
        <circle cx={0} cy={-12} r={24} />
        <Dot x={0} y={-12} />
        <line
          x1={0}
          y1={-12}
          x2={13}
          y2={-25}
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1.6}
          markerEnd="url(#unit-arrow)"
        />
        <path
          d="M0 -36 V-31 M-17 -29 L-13.5 -25.5 M17 -29 L13.5 -25.5"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <path d="M0 12 V30" />
        <path d="M-22 30 H22" strokeWidth={2} />
        <line x1={-13} y1={16} x2={-13} y2={26} markerEnd="url(#unit-arrow)" />
        <line x1={13} y1={16} x2={13} y2={26} markerEnd="url(#unit-arrow)" />
      </g>
    )
  }

  if (category === '能量') {
    return (
      <g>
        <rect x={-58} y={-15} width={62} height={30} rx={3} />
        <rect x={6} y={-6} width={6} height={12} rx={1.5} />
        <path
          d="M-46 -6 V6 M-34 -6 V6 M-22 -6 V6"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
        />
        <path
          d="M44 -28 L28 0 L37 0 L23 28 L48 -4 L37 -4 Z"
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1.2}
        />
      </g>
    )
  }

  if (category === '频率') {
    return (
      <g>
        <path d={makeWavePath()} />
        <path
          d="M-43.5 -12 V-24 M14.5 -12 V-24"
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1.4}
        />
        <circle cx={-43.5} cy={-28} r={2} className="text-primary" fill="currentColor" stroke="none" />
        <circle cx={14.5} cy={-28} r={2} className="text-primary" fill="currentColor" stroke="none" />
        <line
          x1={-58}
          y1={32}
          x2={58}
          y2={32}
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={0.9}
          markerEnd="url(#unit-arrow)"
        />
      </g>
    )
  }

  if (category === '角度') {
    return (
      <g>
        <path d="M-46 20 A46 46 0 0 1 46 20 Z" />
        <line
          x1={0}
          y1={20}
          x2={31}
          y2={-17}
          className="text-primary"
          stroke="currentColor"
          strokeWidth={1.6}
          markerEnd="url(#unit-arrow)"
        />
        <path
          d="M20 20 A20 20 0 0 0 12.9 4.7"
          className="text-muted-foreground"
          stroke="currentColor"
          strokeWidth={1}
        />
        <SvgText x={30} y={14} tone="primary">θ</SvgText>
        <Dot x={0} y={20} />
      </g>
    )
  }

  // 默认温度计
  return (
    <g>
      <path d="M-5 14 V-32 A5 5 0 0 1 5 -32 V14" />
      <circle cx={0} cy={24} r={12} />
      <path d="M0 24 V-16" strokeWidth={3} className="text-primary" stroke="currentColor" />
      <path
        d="M6 -26 H13 M6 -15 H13 M6 -4 H13 M6 7 H13"
        className="text-muted-foreground"
        stroke="currentColor"
        strokeWidth={0.9}
      />
    </g>
  )
}

function findCategory(unit: string): string {
  // 查找单位类别
  for (const group of UNIT_GROUPS) {
    if (group.units.includes(unit)) return group.name
  }
  return ''
}

export function UnitConvertDiagram(
  props: DiagramProps
): JSX.Element | null {
  // 读取单位输入
  const fromUnit =
    typeof props.payload.fromUnit === 'string' ? props.payload.fromUnit : ''
  const toUnit =
    typeof props.payload.toUnit === 'string' ? props.payload.toUnit : ''
  const category = findCategory(fromUnit)

  if (category === '') return null

  const label = `${category}：${fromUnit} → ${toUnit}`

  return (
    <div className="flex w-full flex-col gap-1">
      <svg
        viewBox="0 0 320 165"
        className="h-auto w-full text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={`${label} 概念示意`}
      >
        <ArrowDefinitions />
        <g transform="translate(160, 66)">
          <CategoryDrawing category={category} />
        </g>
        <SvgText x={160} y={152} size={12} weight={600} tone="primary">
          {label}
        </SvgText>
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        单位换算：按「{category}」类单位绘制概念示意，换算方向见上图标注
      </p>
    </div>
  )
}
