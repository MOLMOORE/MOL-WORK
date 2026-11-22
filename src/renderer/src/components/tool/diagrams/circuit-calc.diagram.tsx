import type { DiagramProps } from './types'

// 常用电路示意图

interface SvgTextProps {
  x: number
  y: number
  children: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'normal' | 'muted' | 'primary'
  weight?: number
}

interface SceneInfo {
  title: string
  formula: string
}

const VIEW_WIDTH = 320
const VIEW_HEIGHT = 185

const SCENES: Record<string, SceneInfo> = {
  ohm: { title: '欧姆定律（U/I/R 求其一）', formula: 'U = I · R（电压表并联在 R 两端，电流表串在回路里）' },
  power: { title: '功率计算（P = UI）', formula: 'P = U·I = I²R = U²/R' },
  series: {
    title: '电阻串联',
    formula: 'R总 = R + R2'
  },
  parallel: {
    title: '电阻并联',
    formula: 'R总 = R · R2 / (R + R2)'
  },
  divider: {
    title: '分压电路（求 Vout）',
    formula: 'Vout = Vin · R2 / (R1 + R2)'
  },
  rl: {
    title: 'RL 时间常数',
    formula: 'τ = L / R'
  },
  'cap-energy': {
    title: '电容储能（E = ½CV²）',
    formula: 'E = ½ · C · U²（经开关 S 直接充电至电源电压）'
  },
  led: {
    title: 'LED 限流电阻',
    formula: 'R = (Vs − Vf) / I'
  }
}

function SvgText({ x, y, children, size = 9, anchor = 'middle', tone = 'normal', weight }: SvgTextProps): JSX.Element {
  let className = 'text-foreground'
  if (tone === 'muted') className = 'text-muted-foreground'
  if (tone === 'primary') className = 'text-primary'
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill="currentColor" stroke="none" className={className}>{children}</text>
}

function Dot({ x, y }: { x: number; y: number }): JSX.Element {
  return <circle cx={x} cy={y} r={2.2} fill="currentColor" stroke="none" />
}

function ArrowDefinitions(): JSX.Element {
  return (
    <defs>
      <marker
        id="circuit-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto"
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

function Ground({ x, y }: { x: number; y: number }): JSX.Element {
  // 地线符号
  return (
    <g>
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x - 4.5} y1={y + 3.5} x2={x + 4.5} y2={y + 3.5} />
      <line x1={x - 2} y1={y + 7} x2={x + 2} y2={y + 7} />
    </g>
  )
}

function Battery({
  x,
  top,
  bottom,
  label
}: {
  x: number
  top: number
  bottom: number
  label: string
}): JSX.Element {
  // 直流电源
  const middle = (top + bottom) / 2

  return (
    <g>
      <path d={`M ${x} ${top} V ${middle - 4}`} />
      <path d={`M ${x} ${middle + 3} V ${bottom}`} />
      <line x1={x - 10} y1={middle - 4} x2={x + 10} y2={middle - 4} strokeWidth={1.5} />
      <line x1={x - 5} y1={middle + 3} x2={x + 5} y2={middle + 3} strokeWidth={2.8} />
      <SvgText x={x - 14} y={middle + 3} anchor="end">
        {label}
      </SvgText>
    </g>
  )
}

function ResistorH({
  x1,
  x2,
  y
}: {
  x1: number
  x2: number
  y: number
}): JSX.Element {
  // 水平电阻
  const bodyWidth = Math.min(46, (x2 - x1) * 0.72)
  const left = (x1 + x2) / 2 - bodyWidth / 2
  const segment = bodyWidth / 6
  let path = `M ${x1} ${y} L ${left.toFixed(1)} ${y}`

  for (let index = 0; index < 6; index += 1) {
    const pointX = left + segment * (index + 0.5)
    const pointY = y + (index % 2 === 0 ? -6 : 6)
    path += ` L ${pointX.toFixed(1)} ${pointY}`
  }

  path += ` L ${(left + bodyWidth).toFixed(1)} ${y} L ${x2} ${y}`
  return <path d={path} />
}

function ResistorV({
  x,
  y1,
  y2
}: {
  x: number
  y1: number
  y2: number
}): JSX.Element {
  // 竖直电阻
  const bodyHeight = Math.min(42, (y2 - y1) * 0.72)
  const top = (y1 + y2) / 2 - bodyHeight / 2
  const segment = bodyHeight / 6
  let path = `M ${x} ${y1} L ${x} ${top.toFixed(1)}`

  for (let index = 0; index < 6; index += 1) {
    const pointX = x + (index % 2 === 0 ? -6 : 6)
    const pointY = top + segment * (index + 0.5)
    path += ` L ${pointX} ${pointY.toFixed(1)}`
  }

  path += ` L ${x} ${(top + bodyHeight).toFixed(1)} L ${x} ${y2}`
  return <path d={path} />
}

function Inductor({
  x1,
  x2,
  y
}: {
  x1: number
  x2: number
  y: number
}): JSX.Element {
  // 电感
  const turns = 4
  const radius = (x2 - x1) / (turns * 2)
  let path = `M ${x1} ${y}`

  for (let index = 0; index < turns; index += 1) {
    const endX = x1 + 2 * radius * (index + 1)
    path += ` A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 1 ${endX.toFixed(1)} ${y}`
  }

  return <path d={path} />
}

function Capacitor({
  x,
  y
}: {
  x: number
  y: number
}): JSX.Element {
  // 电容
  return (
    <g>
      <line x1={x - 4} y1={y - 9} x2={x - 4} y2={y + 9} />
      <line x1={x + 4} y1={y - 9} x2={x + 4} y2={y + 9} />
    </g>
  )
}

function Meter({
  x,
  y,
  label
}: {
  x: number
  y: number
  label: string
}): JSX.Element {
  // 电压表/电流表
  return (
    <g>
      <circle cx={x} cy={y} r={11} />
      <SvgText x={x} y={y + 3.4} weight={600}>
        {label}
      </SvgText>
    </g>
  )
}

function Switch({
  x1,
  x2,
  y
}: {
  x1: number
  x2: number
  y: number
}): JSX.Element {
  // 开关
  return (
    <g>
      <Dot x={x1} y={y} />
      <Dot x={x2} y={y} />
      <line x1={x1} y1={y} x2={x2 - 5} y2={y - 14} />
    </g>
  )
}

function CurrentArrow({
  x,
  top,
  label = 'I'
}: {
  x: number
  top: number
  label?: string
}): JSX.Element {
  // 电流方向
  return (
    <g>
      <line
        x1={x}
        y1={top}
        x2={x}
        y2={top + 16}
        markerEnd="url(#circuit-arrow)"
      />
      <SvgText x={x + 8} y={top + 10} anchor="start" size={8.5} tone="primary">
        {label}
      </SvgText>
    </g>
  )
}

function SimpleLoop(): JSX.Element {
  // 基础回路
  return (
    <g>
      <path d="M40 45 H280" />
      <path d="M280 45 V150" />
      <path d="M280 150 H40" />
      <Battery x={40} top={45} bottom={150} label="U" />
    </g>
  )
}

function OhmScene(): JSX.Element {
  // 欧姆定律
  return (
    <g>
      <SimpleLoop />
      <ResistorH x1={125} x2={195} y={45} />
      <SvgText x={160} y={33}>R</SvgText>
      <path d="M149 150 H171" />
      <Meter x={160} y={150} label="A" />
      <path d="M118 45 V24 H149" />
      <path d="M171 24 H202 V45" />
      <Meter x={160} y={24} label="V" />
      <Dot x={118} y={45} />
      <Dot x={202} y={45} />
      <CurrentArrow x={280} top={92} />
    </g>
  )
}

function PowerScene(): JSX.Element {
  // 功率计算
  return (
    <g>
      <SimpleLoop />
      <ResistorH x1={120} x2={190} y={45} />
      <SvgText x={155} y={33}>R</SvgText>
      <CurrentArrow x={280} top={92} />
      <SvgText x={160} y={100} size={13} tone="primary" weight={600}>
        P = U·I
      </SvgText>
      <SvgText x={160} y={116} tone="muted">
        = I²R = U²/R
      </SvgText>
    </g>
  )
}

function SeriesScene(): JSX.Element {
  // 串联电路
  return (
    <g>
      <SimpleLoop />
      <ResistorH x1={85} x2={135} y={45} />
      <SvgText x={110} y={33}>R</SvgText>
      <ResistorH x1={185} x2={235} y={45} />
      <SvgText x={210} y={33}>R2</SvgText>
      <CurrentArrow x={280} top={92} />
    </g>
  )
}

function ParallelScene(): JSX.Element {
  // 并联电路
  return (
    <g>
      <Battery x={40} top={50} bottom={155} label="U" />
      <path d="M40 50 H100 V155 H40" />
      <path d="M100 50 H260 V155 H100" />
      <ResistorH x1={130} x2={185} y={50} />
      <SvgText x={157} y={38}>R</SvgText>
      <ResistorH x1={130} x2={185} y={108} />
      <SvgText x={157} y={96}>R2</SvgText>
      <path d="M100 108 H130" />
      <path d="M185 108 H260" />
      <Dot x={100} y={108} />
      <Dot x={260} y={108} />
    </g>
  )
}

function DividerScene(): JSX.Element {
  // 分压电路
  return (
    <g>
      <Battery x={50} top={40} bottom={150} label="Vin" />
      <path d="M50 40 H210 V52" />
      <ResistorV x={210} y1={52} y2={92} />
      <SvgText x={224} y={76} anchor="start">R1</SvgText>
      <path d="M210 92 V102" />
      <ResistorV x={210} y1={102} y2={140} />
      <SvgText x={224} y={126} anchor="start">R2</SvgText>
      <path d="M210 140 V150 H50" />
      <Dot x={210} y={97} />
      <path d="M210 97 H262" />
      <circle cx={268} cy={97} r={3.5} />
      <SvgText x={268} y={112} size={8.5} tone="primary">Vout</SvgText>
      <path d="M130 150 V157" />
      <Ground x={130} y={157} />
    </g>
  )
}

function RlScene(): JSX.Element {
  // RL 电路
  return (
    <g>
      <Battery x={40} top={45} bottom={150} label="U" />
      <path d="M40 45 H95" />
      <Switch x1={95} x2={135} y={45} />
      <SvgText x={115} y={26} size={8} tone="muted">S</SvgText>
      <path d="M135 45 H160" />
      <ResistorH x1={160} x2={210} y={45} />
      <SvgText x={185} y={33}>R</SvgText>
      <path d="M210 45 H235" />
      <Inductor x1={235} x2={283} y={45} />
      <SvgText x={259} y={31}>L</SvgText>
      <path d="M283 45 V150 H40" />
    </g>
  )
}

function CapEnergyScene(): JSX.Element {
  // 电容充电
  return (
    <g>
      <Battery x={40} top={45} bottom={150} label="U" />
      <path d="M40 45 H110" />
      <Switch x1={110} x2={150} y={45} />
      <SvgText x={130} y={26} size={8} tone="muted">S</SvgText>
      <path d="M150 45 H204" />
      <Capacitor x={208} y={45} />
      <path d="M212 45 H280 V150 H40" />
      <SvgText x={208} y={28}>C</SvgText>
    </g>
  )
}

function LedScene(): JSX.Element {
  // LED 限流
  return (
    <g>
      <Battery x={40} top={45} bottom={150} label="Vs" />
      <path d="M40 45 H85" />
      <ResistorH x1={85} x2={135} y={45} />
      <SvgText x={110} y={33}>R</SvgText>
      <path d="M135 45 H190" />
      <path d="M190 36 L190 54 L206 45 Z" />
      <line x1={206} y1={35} x2={206} y2={55} />
      <path d="M206 45 H280 V150 H40" />
      <line
        x1={198}
        y1={32}
        x2={206}
        y2={22}
        markerEnd="url(#circuit-arrow)"
      />
      <line
        x1={207}
        y1={31}
        x2={215}
        y2={21}
        markerEnd="url(#circuit-arrow)"
      />
      <SvgText x={212} y={68} anchor="start">Vf</SvgText>
      <line
        x1={205}
        y1={150}
        x2={185}
        y2={150}
        markerEnd="url(#circuit-arrow)"
      />
      <SvgText x={196} y={164} size={8.5} tone="primary">I</SvgText>
    </g>
  )
}

function drawScene(mode: string): JSX.Element | null {
  // 选择模式图
  if (mode === 'ohm') return <OhmScene />
  if (mode === 'power') return <PowerScene />
  if (mode === 'series') return <SeriesScene />
  if (mode === 'parallel') return <ParallelScene />
  if (mode === 'divider') return <DividerScene />
  if (mode === 'rl') return <RlScene />
  if (mode === 'cap-energy') return <CapEnergyScene />
  if (mode === 'led') return <LedScene />
  return null
}

export function CircuitCalcDiagram(
  props: DiagramProps
): JSX.Element | null {
  // 读取模式
  const mode =
    typeof props.payload.mode === 'string' && props.payload.mode !== ''
      ? props.payload.mode
      : 'ohm'
  const scene = SCENES[mode]
  const drawing = drawScene(mode)
  if (!scene || !drawing) return null

  return (
    <div className="flex w-full flex-col gap-1">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={`${scene.title} 示意图`}
      >
        <ArrowDefinitions />
        {drawing}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {scene.title}：{scene.formula}
      </p>
    </div>
  )
}
