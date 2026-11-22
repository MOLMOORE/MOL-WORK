import type { DiagramProps } from './types'

// 整流电路示意图

interface SvgTextProps {
  x: number
  y: number
  children: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'normal' | 'muted' | 'primary'
  weight?: number
}

interface Labels {
  voltage: string
  capacitor: string
  loadNote: string
}

const VIEW_WIDTH = 350, VIEW_HEIGHT = 188
const TOP_Y = 64, GROUND_Y = 150
const CAP_X = 232, LOAD_X = 302

function SvgText({ x, y, children, size = 8.5, anchor = 'middle', tone = 'normal', weight }: SvgTextProps): JSX.Element {
  let className = 'text-foreground'
  if (tone === 'muted') className = 'text-muted-foreground'
  if (tone === 'primary') className = 'text-primary'
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill="currentColor" stroke="none" className={className}>{children}</text>
}

function Dot({ x, y }: { x: number; y: number }): JSX.Element {
  return <circle cx={x} cy={y} r={2.1} fill="currentColor" stroke="none" />
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

function Coil({
  x,
  top,
  bottom,
  turns
}: {
  x: number
  top: number
  bottom: number
  turns: number
}): JSX.Element {
  // 变压器绕组
  const turnHeight = (bottom - top) / turns
  let path = `M ${x} ${top}`

  for (let index = 0; index < turns; index += 1) {
    const endY = top + turnHeight * (index + 1)
    path += ` A 6 ${(turnHeight / 2).toFixed(1)} 0 0 1 ${x} ${endY.toFixed(1)}`
  }

  return <path d={path} />
}

function Diode({
  x,
  y,
  rotation = 0
}: {
  x: number
  y: number
  rotation?: number
}): JSX.Element {
  // 二极管符号
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`}>
      <path d="M-9 0 H-3" />
      <path d="M-3 -5 L5 0 L-3 5 Z" />
      <path d="M5 -5 V5" />
      <path d="M5 0 H9" />
    </g>
  )
}

function Capacitor({ label }: { label: string }): JSX.Element {
  // 电容符号
  return (
    <g>
      <path d={`M ${CAP_X} ${TOP_Y} V 104`} />
      <line x1={CAP_X - 10} y1={104} x2={CAP_X + 10} y2={104} />
      <line x1={CAP_X - 10} y1={112} x2={CAP_X + 10} y2={112} />
      <path d={`M ${CAP_X} 112 V ${GROUND_Y}`} />
      <SvgText x={CAP_X - 14} y={97} anchor="end">
        {label}
      </SvgText>
    </g>
  )
}

function LoadResistor({ note }: { note: string }): JSX.Element {
  // 负载电阻
  const bodyTop = 83
  const bodyHeight = 48
  const segment = bodyHeight / 6
  let path = `M ${LOAD_X} ${TOP_Y} L ${LOAD_X} ${bodyTop}`

  for (let index = 0; index < 6; index += 1) {
    const side = index % 2 === 0 ? -6 : 6
    const y = bodyTop + segment * (index + 0.5)
    path += ` L ${LOAD_X + side} ${y.toFixed(1)}`
  }

  path += ` L ${LOAD_X} ${bodyTop + bodyHeight} L ${LOAD_X} ${GROUND_Y}`

  return (
    <g>
      <path d={path} />
      <SvgText x={LOAD_X - 15} y={96} anchor="end">
        RL
      </SvgText>
      {note ? (
        <SvgText x={LOAD_X - 15} y={106} anchor="end" size={7.5} tone="muted">
          {note}
        </SvgText>
      ) : null}
    </g>
  )
}

function AcSource({
  x,
  y,
  label
}: {
  x: number
  y: number
  label: string
}): JSX.Element {
  const points: string[] = []
  const steps = 20

  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps
    const pointX = x - 8 + ratio * 16
    const pointY = y - 5 * Math.sin(ratio * Math.PI * 2)
    points.push(`${pointX.toFixed(1)} ${pointY.toFixed(1)}`)
  }

  return (
    <g>
      <circle cx={x} cy={y} r={12} />
      <path d={`M ${points.join(' L ')}`} strokeWidth={1.1} />
      <path d={`M ${x} ${y - 12} V 86 H 62`} />
      <path d={`M ${x} ${y + 12} V 134 H 62`} />
      <SvgText x={x} y={78}>
        {label}
      </SvgText>
    </g>
  )
}

function Transformer(): JSX.Element {
  return (
    <g>
      <Coil x={62} top={86} bottom={134} turns={4} />
      <g className="text-muted-foreground" strokeWidth={1} strokeDasharray="3 3">
        <path d="M76 78 V142" />
        <path d="M81 78 V142" />
      </g>
    </g>
  )
}

function OutputBranch({
  positiveX,
  negativeX,
  labels
}: {
  positiveX: number
  negativeX: number
  labels: Labels
}): JSX.Element {
  // 共用输出支路
  return (
    <g>
      <path d={`M ${positiveX} ${TOP_Y} H ${LOAD_X}`} />
      <path d={`M ${negativeX} ${GROUND_Y} H ${LOAD_X}`} />
      <Dot x={CAP_X} y={TOP_Y} />
      <Dot x={CAP_X} y={GROUND_Y} />
      <path d={`M 196 ${GROUND_Y} V ${GROUND_Y + 2}`} />
      <Ground x={196} y={GROUND_Y + 2} />
      <SvgText
        x={positiveX + 12}
        y={TOP_Y - 5}
        size={8}
        tone="primary"
        weight={600}
      >
        +
      </SvgText>
      <Capacitor label={labels.capacitor} />
      <LoadResistor note={labels.loadNote} />
    </g>
  )
}

function HalfWave({ labels }: { labels: Labels }): JSX.Element {
  // 半波整流
  return (
    <g>
      <AcSource x={26} y={110} label={labels.voltage} />
      <Transformer />
      <Coil x={96} top={86} bottom={134} turns={4} />
      <path d={`M 96 86 H 126 V ${TOP_Y} H 161`} />
      <Diode x={170} y={TOP_Y} />
      <SvgText x={170} y={TOP_Y - 12}>D₁</SvgText>
      <path d={`M 96 134 H 120 V ${GROUND_Y}`} />
      <OutputBranch positiveX={179} negativeX={120} labels={labels} />
      <SvgText x={245} y={42} size={7.5} tone="muted">
        仅正半周导通
      </SvgText>
    </g>
  )
}

function CenterTap({ labels }: { labels: Labels }): JSX.Element {
  // 中心抽头整流
  return (
    <g>
      <AcSource x={26} y={110} label={labels.voltage} />
      <Transformer />
      <Coil x={96} top={82} bottom={106} turns={2} />
      <Coil x={96} top={114} bottom={138} turns={2} />
      <path d="M 96 106 V 114" />
      <path d={`M 96 110 H 86 V ${GROUND_Y}`} />
      <Dot x={96} y={110} />

      <path d="M 96 82 H 135" />
      <Diode x={150} y={82} />
      <path d="M 159 82 H 190 V 138" />
      <path d={`M 190 82 V ${TOP_Y}`} />
      <SvgText x={150} y={74}>D₁</SvgText>

      <path d="M 96 138 H 135" />
      <Diode x={150} y={138} />
      <path d="M 159 138 H 190" />
      <SvgText x={150} y={130}>D₂</SvgText>

      <SvgText x={112} y={112} anchor="start" size={7.5} tone="muted">
        中心抽头
      </SvgText>
      <OutputBranch positiveX={190} negativeX={86} labels={labels} />
      <SvgText x={245} y={42} size={7.5} tone="muted">
        两管轮流导通
      </SvgText>
    </g>
  )
}

function BridgeEdge({
  x1,
  y1,
  x2,
  y2
}: {
  x1: number
  y1: number
  x2: number
  y2: number
}): JSX.Element {
  const middleX = (x1 + x2) / 2
  const middleY = (y1 + y2) / 2
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const length = Math.hypot(x2 - x1, y2 - y1)
  const unitX = (x2 - x1) / length
  const unitY = (y2 - y1) / length

  return (
    <g>
      <path
        d={`M ${x1} ${y1} L ${(middleX - unitX * 9).toFixed(1)} ${(middleY - unitY * 9).toFixed(1)}`}
      />
      <Diode x={middleX} y={middleY} rotation={angle} />
      <path
        d={`M ${(middleX + unitX * 9).toFixed(1)} ${(middleY + unitY * 9).toFixed(1)} L ${x2} ${y2}`}
      />
    </g>
  )
}

function Bridge({ labels }: { labels: Labels }): JSX.Element {
  // 桥式整流
  const leftX = 159
  const rightX = 211
  const topX = 185
  const bottomX = 185
  const middleY = 90
  const bottomY = 116

  return (
    <g>
      <AcSource x={26} y={110} label={labels.voltage} />
      <Transformer />
      <Coil x={96} top={86} bottom={134} turns={4} />
      <path d={`M 96 86 H 126 V ${middleY} H ${leftX}`} />
      <path d={`M 96 134 H 179 Q 185 126 191 134 H ${rightX} V ${middleY}`} />

      <BridgeEdge x1={leftX} y1={middleY} x2={topX} y2={TOP_Y} />
      <BridgeEdge x1={rightX} y1={middleY} x2={topX} y2={TOP_Y} />
      <BridgeEdge x1={bottomX} y1={bottomY} x2={leftX} y2={middleY} />
      <BridgeEdge x1={bottomX} y1={bottomY} x2={rightX} y2={middleY} />

      <SvgText x={162} y={68} size={8}>D₁</SvgText>
      <SvgText x={208} y={68} size={8}>D₂</SvgText>
      <SvgText x={162} y={112} size={8}>D₃</SvgText>
      <SvgText x={208} y={112} size={8}>D₄</SvgText>

      <path d={`M ${bottomX} ${bottomY} V ${GROUND_Y}`} />
      <OutputBranch positiveX={topX} negativeX={bottomX} labels={labels} />
      <SvgText x={250} y={42} size={7.5} tone="muted">
        四管两两轮流导通
      </SvgText>
    </g>
  )
}

function getMode(value: unknown): 'half' | 'ct' | 'bridge' {
  if (value === 'half') return 'half'
  if (value === 'ct') return 'ct'
  return 'bridge'
}

function getTopologyName(mode: 'half' | 'ct' | 'bridge'): string {
  if (mode === 'half') return '半波整流'
  if (mode === 'ct') return '全波中心抽头整流'
  return '桥式全波整流'
}

function getFrequency(value: unknown): number {
  // 读取频率
  const text = String(value ?? '').replace(/[^0-9.]/g, '')
  const number = Number(text)
  if (Number.isFinite(number) && number > 0) return number
  return 50
}

function makeLabels(payload: Record<string, unknown>): Labels {
  // 读取图上标签
  const voltage = String(payload.vsec ?? '').trim()
  const capacitor = String(payload.cap ?? '').trim()
  const load = String(payload.iload ?? '').trim()

  let voltageLabel = 'V₂'
  if (voltage !== '') voltageLabel = `V₂ ${voltage} V`

  let capacitorLabel = 'C'
  if (capacitor !== '') capacitorLabel = `C ${capacitor}`

  let loadLabel = ''
  if (load !== '') loadLabel = `I = ${load} A`

  return {
    voltage: voltageLabel,
    capacitor: capacitorLabel,
    loadNote: loadLabel
  }
}

export function RectCalcDiagram(props: DiagramProps): JSX.Element {
  const mode = getMode(props.payload.mode)
  const topology = getTopologyName(mode)
  const labels = makeLabels(props.payload)
  const baseFrequency = getFrequency(props.payload.f)

  // 纹波频率
  let rippleFrequency = baseFrequency * 2
  if (mode === 'half') rippleFrequency = baseFrequency

  let note =
    `全波每周期给电容补电两次，纹波频率取 2f = ${rippleFrequency} Hz` +
    '（50 Hz 电网即 100 Hz）'
  if (mode === 'half') {
    note =
      `半波纹波频率仍是 f = ${baseFrequency} Hz，纹波大、` +
      '变压器有直流磁化，一般不带载用'
  }

  // 选择整流图
  let drawing = <Bridge labels={labels} />
  if (mode === 'half') drawing = <HalfWave labels={labels} />
  if (mode === 'ct') drawing = <CenterTap labels={labels} />

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
        aria-label={`${topology} 电路示意图`}
      >
        {drawing}
        <SvgText
          x={175}
          y={176}
          size={8}
          tone="muted"
        >
          {`${topology} · Vr(pp) = I / (f_r·C) · f_r = ${rippleFrequency} Hz`}
        </SvgText>
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {`${topology}：Vdc ≈ √2·V₂ − 导通压降，Vr(pp) = I / (f_r·C)。${note}。`}
      </p>
    </div>
  )
}
