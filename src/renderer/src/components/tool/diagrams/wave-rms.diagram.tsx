import type { DiagramProps } from './types'

// 交流波形示意图

interface WaveInfo {
  name: string
  rmsDiv: number
  avgDiv: number
}

interface SvgTextProps {
  x: number
  y: number
  children: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'normal' | 'muted' | 'primary'
  weight?: number
}

interface Point {
  x: number
  y: number
}

const VIEW_WIDTH = 340
const VIEW_HEIGHT = 200

// 波形画布参数
const LEFT = 26
const RIGHT = 292
const MIDDLE_Y = 104
const AMPLITUDE = 64
const CYCLE_COUNT = 2
const CYCLE_WIDTH = (RIGHT - LEFT) / CYCLE_COUNT
const SINE_SAMPLE_COUNT = 80

const WAVE_INFO: Record<string, WaveInfo> = {
  sine: { name: '正弦波', rmsDiv: Math.SQRT2, avgDiv: Math.PI / 2 },
  square: { name: '方波', rmsDiv: 1, avgDiv: 1 },
  triangle: { name: '三角波', rmsDiv: Math.sqrt(3), avgDiv: 2 },
  sawtooth: { name: '锯齿波', rmsDiv: Math.sqrt(3), avgDiv: 2 }
}

function SvgText({ x, y, children, size = 9, anchor = 'middle', tone = 'normal', weight }: SvgTextProps): JSX.Element {
  let className = 'text-foreground'
  if (tone === 'muted') className = 'text-muted-foreground'
  if (tone === 'primary') className = 'text-primary'
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill="currentColor" stroke="none" className={className}>{children}</text>
}

function getWaveInfo(wave: string): WaveInfo {
  if (wave === 'square') return WAVE_INFO.square
  if (wave === 'triangle') return WAVE_INFO.triangle
  if (wave === 'sawtooth') return WAVE_INFO.sawtooth
  return WAVE_INFO.sine
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  let path = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    path += ` L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  }

  return path
}

function makeSinePoints(): Point[] {
  // 正弦波采样点
  const points: Point[] = []
  const fullWidth = RIGHT - LEFT

  for (let index = 0; index <= SINE_SAMPLE_COUNT; index += 1) {
    const ratio = index / SINE_SAMPLE_COUNT
    const x = LEFT + fullWidth * ratio
    const angle = ratio * Math.PI * 2 * CYCLE_COUNT
    const y = MIDDLE_Y - AMPLITUDE * Math.sin(angle)
    points.push({ x, y })
  }

  return points
}

function makeSquarePoints(): Point[] {
  // 方波采样点
  const points: Point[] = [{ x: LEFT, y: MIDDLE_Y - AMPLITUDE }]

  for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
    const start = LEFT + cycle * CYCLE_WIDTH
    const middle = start + CYCLE_WIDTH / 2
    const end = start + CYCLE_WIDTH

    points.push({ x: middle, y: MIDDLE_Y - AMPLITUDE })
    points.push({ x: middle, y: MIDDLE_Y + AMPLITUDE })
    points.push({ x: end, y: MIDDLE_Y + AMPLITUDE })
    points.push({ x: end, y: MIDDLE_Y - AMPLITUDE })
  }

  return points
}

function makeTrianglePoints(): Point[] {
  // 三角波采样点
  const points: Point[] = [{ x: LEFT, y: MIDDLE_Y }]

  for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
    const start = LEFT + cycle * CYCLE_WIDTH
    const quarter = start + CYCLE_WIDTH / 4
    const threeQuarter = start + (CYCLE_WIDTH * 3) / 4
    const end = start + CYCLE_WIDTH

    points.push({ x: quarter, y: MIDDLE_Y - AMPLITUDE })
    points.push({ x: threeQuarter, y: MIDDLE_Y + AMPLITUDE })
    points.push({ x: end, y: MIDDLE_Y })
  }

  return points
}

function makeSawtoothPoints(): Point[] {
  // 锯齿波采样点
  const points: Point[] = []

  for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
    const start = LEFT + cycle * CYCLE_WIDTH
    const end = start + CYCLE_WIDTH
    points.push({ x: start, y: MIDDLE_Y + AMPLITUDE })
    points.push({ x: end, y: MIDDLE_Y - AMPLITUDE })
  }

  points.push({ x: RIGHT, y: MIDDLE_Y + AMPLITUDE })
  return points
}

function makeWavePoints(wave: string): Point[] {
  if (wave === 'square') return makeSquarePoints()
  if (wave === 'triangle') return makeTrianglePoints()
  if (wave === 'sawtooth') return makeSawtoothPoints()
  return makeSinePoints()
}

function ArrowDefinitions(): JSX.Element {
  return (
    <defs>
      <marker
        id="wave-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
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

function readFrequencyText(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

function getLabelPositions(
  peakY: number,
  rmsY: number,
  averageY: number
): { label: string; tone: 'normal' | 'muted' | 'primary'; y: number }[] {
  // 调整标签间距
  const marks = [
    { label: '+Vpk', tone: 'muted' as const, y: peakY + 3 },
    { label: 'Vrms', tone: 'primary' as const, y: rmsY + 3 },
    { label: 'Vavg', tone: 'normal' as const, y: averageY + 3 }
  ]

  let lastY = Number.NEGATIVE_INFINITY
  for (const mark of marks) {
    mark.y = Math.max(mark.y, lastY + 10)
    lastY = mark.y
  }

  return marks
}

export function WaveRmsDiagram(props: DiagramProps): JSX.Element {
  // 读取波形类型
  let wave = 'sine'
  if (typeof props.payload.wave === 'string' && props.payload.wave !== '') {
    wave = props.payload.wave
  }

  const info = getWaveInfo(wave)
  const points = makeWavePoints(wave)
  const path = pointsToPath(points)
  const peakY = MIDDLE_Y - AMPLITUDE
  const rmsY = MIDDLE_Y - AMPLITUDE / info.rmsDiv
  const averageY = MIDDLE_Y - AMPLITUDE / info.avgDiv
  const formFactor = info.avgDiv / info.rmsDiv
  const crestFactor = info.rmsDiv
  const labelPositions = getLabelPositions(peakY, rmsY, averageY)
  const frequency = readFrequencyText(props.payload.freq)
  const arrowY = MIDDLE_Y + AMPLITUDE + 20
  let periodText = 'T'
  if (frequency !== '') periodText = `T（${frequency} Hz）`

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
        aria-label={`${info.name}有效值换算示意图`}
      >
        <ArrowDefinitions />
        <SvgText x={12} y={16} anchor="start" size={10} weight={600}>
          {info.name}
        </SvgText>

        <line
          x1={14}
          y1={MIDDLE_Y + AMPLITUDE + 10}
          x2={14}
          y2={peakY - 10}
          className="text-muted-foreground"
          strokeWidth={0.9}
        />
        <line
          x1={14}
          y1={MIDDLE_Y}
          x2={RIGHT + 6}
          y2={MIDDLE_Y}
          className="text-muted-foreground"
          strokeWidth={0.9}
        />
        <SvgText x={10} y={MIDDLE_Y + 3} anchor="end" size={8} tone="muted">
          0
        </SvgText>

        <line
          x1={LEFT - 10}
          y1={peakY}
          x2={RIGHT + 4}
          y2={peakY}
          className="text-muted-foreground"
          strokeWidth={0.9}
        />
        <line
          x1={LEFT - 10}
          y1={rmsY}
          x2={RIGHT + 4}
          y2={rmsY}
          className="text-primary"
          strokeWidth={1.1}
          strokeDasharray="6 3"
        />
        <line
          x1={LEFT - 10}
          y1={averageY}
          x2={RIGHT + 4}
          y2={averageY}
          strokeWidth={1.1}
          strokeDasharray="1.2 3.2"
        />

        {labelPositions.map((mark) => (
          <SvgText
            key={mark.label}
            x={RIGHT + 10}
            y={mark.y}
            anchor="start"
            size={8.5}
            tone={mark.tone}
          >
            {mark.label}
          </SvgText>
        ))}

        <path d={path} className="text-primary" strokeWidth={1.8} />

        <line
          x1={LEFT}
          y1={MIDDLE_Y + AMPLITUDE + 6}
          x2={LEFT}
          y2={arrowY}
          className="text-muted-foreground"
          strokeWidth={0.8}
          strokeDasharray="2 3"
        />
        <line
          x1={LEFT + CYCLE_WIDTH}
          y1={MIDDLE_Y + AMPLITUDE + 6}
          x2={LEFT + CYCLE_WIDTH}
          y2={arrowY}
          className="text-muted-foreground"
          strokeWidth={0.8}
          strokeDasharray="2 3"
        />
        <line
          x1={LEFT}
          y1={arrowY}
          x2={LEFT + CYCLE_WIDTH}
          y2={arrowY}
          strokeWidth={1}
          markerStart="url(#wave-arrow)"
          markerEnd="url(#wave-arrow)"
        />
        <SvgText
          x={LEFT + CYCLE_WIDTH / 2}
          y={arrowY - 5}
          size={8.5}
          tone="muted"
        >
          {periodText}
        </SvgText>
      </svg>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {info.name}：波形因数 kf = {formFactor.toFixed(3)} · 峰值因数 kpk ={' '}
        {crestFactor.toFixed(3)}
      </p>
    </div>
  )
}
