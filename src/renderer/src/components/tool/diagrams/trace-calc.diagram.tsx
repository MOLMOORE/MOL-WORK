import type { DiagramProps } from './types'

// PCB 走线截面示意图

interface SvgTextProps {
  x: number
  y: number
  children: string
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'normal' | 'muted' | 'primary'
  weight?: number
}

interface CopperInfo {
  text: string
  height: number
}

interface SceneProps {
  copperHeight: number
  copperText: string
  traceWidth: number
}

const VIEW_WIDTH = 320
const VIEW_HEIGHT = 172

// 画布坐标
const BOARD_X = 44, BOARD_WIDTH = 212
const BOARD_TOP = 108, BOARD_HEIGHT = 42
const CENTER_X = 150
const NARROW_TRACE = 36, WIDE_TRACE = 58

function SvgText({ x, y, children, size = 9, anchor = 'middle', tone = 'normal', weight }: SvgTextProps): JSX.Element {
  let className = 'text-foreground'
  if (tone === 'muted') className = 'text-muted-foreground'
  if (tone === 'primary') className = 'text-primary'
  return <text x={x} y={y} fontSize={size} textAnchor={anchor} fontWeight={weight} fill="currentColor" stroke="none" className={className}>{children}</text>
}

function ArrowDefinitions(): JSX.Element {
  return (
    <defs>
      <marker
        id="trace-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
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
      <marker
        id="trace-arrow-start"
        viewBox="0 0 10 10"
        refX="2"
        refY="5"
        markerWidth="6.5"
        markerHeight="6.5"
        orient="auto"
      >
        <path
          d="M 9 1 L 2 5 L 9 9"
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

function WidthArrow({
  left,
  right,
  y
}: {
  left: number
  right: number
  y: number
}): JSX.Element {
  return (
    <line
      x1={left}
      y1={y}
      x2={right}
      y2={y}
      markerStart="url(#trace-arrow-start)"
      markerEnd="url(#trace-arrow)"
    />
  )
}

function ThicknessArrow({
  x,
  top,
  bottom
}: {
  x: number
  top: number
  bottom: number
}): JSX.Element {
  return (
    <line
      x1={x}
      y1={top}
      x2={x}
      y2={bottom}
      markerStart="url(#trace-arrow-start)"
      markerEnd="url(#trace-arrow)"
    />
  )
}

function CurrentArrow({
  x,
  y,
  width
}: {
  x: number
  y: number
  width: number
}): JSX.Element {
  return (
    <g>
      <line
        x1={x - 42}
        y1={y}
        x2={x + width - 7}
        y2={y}
        markerEnd="url(#trace-arrow)"
      />
      <SvgText x={x - 24} y={y - 6} size={9.5} tone="primary" weight={600}>
        I
      </SvgText>
    </g>
  )
}

function CopperRect({
  x,
  y,
  width,
  height
}: {
  x: number
  y: number
  width: number
  height: number
}): JSX.Element {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      className="text-primary"
      fill="currentColor"
      fillOpacity={0.28}
      stroke="currentColor"
    />
  )
}

function OuterLayerScene({
  copperHeight,
  copperText,
  traceWidth
}: SceneProps): JSX.Element {
  // 外层走线位置
  const traceX = CENTER_X - traceWidth / 2
  const traceY = BOARD_TOP - copperHeight
  const traceRight = traceX + traceWidth

  return (
    <g>
      <rect
        x={BOARD_X}
        y={BOARD_TOP}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        fill="currentColor"
        fillOpacity={0.05}
      />

      {/* 板材纹理 */}
      <path d="M 54 144 L 68 130" strokeOpacity={0.3} />
      <path d="M 68 144 L 82 130" strokeOpacity={0.3} />
      <path d="M 82 144 L 96 130" strokeOpacity={0.3} />
      <SvgText x={184} y={133} size={9.5} tone="muted">
        FR-4 芯板
      </SvgText>

      <CopperRect
        x={traceX}
        y={traceY}
        width={traceWidth}
        height={copperHeight}
      />

      {/* 尺寸标注 */}
      <WidthArrow left={traceX} right={traceRight} y={traceY - 14} />
      <line x1={traceX} y1={traceY - 11} x2={traceX} y2={traceY - 2} strokeOpacity={0.5} />
      <line
        x1={traceRight}
        y1={traceY - 11}
        x2={traceRight}
        y2={traceY - 2}
        strokeOpacity={0.5}
      />
      <SvgText x={CENTER_X} y={traceY - 19} size={9.5} tone="primary" weight={600}>
        w
      </SvgText>

      <ThicknessArrow
        x={traceRight + 10}
        top={traceY}
        bottom={BOARD_TOP}
      />
      <line
        x1={traceRight + 3}
        y1={traceY}
        x2={traceRight + 14}
        y2={traceY}
        strokeOpacity={0.5}
      />
      <SvgText
        x={traceRight + 16}
        y={traceY - 3}
        size={8.5}
        anchor="start"
        tone="muted"
      >
        {copperText}
      </SvgText>

      <CurrentArrow
        x={traceX}
        y={traceY + copperHeight / 2}
        width={traceWidth}
      />
    </g>
  )
}

function InnerLayerScene({
  copperHeight,
  copperText,
  traceWidth
}: SceneProps): JSX.Element {
  // 内层走线位置
  const traceX = CENTER_X - traceWidth / 2
  const traceY = 92 - copperHeight / 2
  const traceRight = traceX + traceWidth
  const upperTop = 42
  const lowerTop = traceY + copperHeight + 10

  return (
    <g>
      <rect
        x={BOARD_X}
        y={upperTop}
        width={BOARD_WIDTH}
        height={34}
        fill="currentColor"
        fillOpacity={0.05}
      />

      {/* 上下介质 */}
      <SvgText x={CENTER_X} y={upperTop + 21} size={9} tone="muted">
        半固化片 / 介质
      </SvgText>
      <rect
        x={BOARD_X}
        y={lowerTop}
        width={BOARD_WIDTH}
        height={34}
        fill="currentColor"
        fillOpacity={0.05}
      />
      <SvgText x={CENTER_X} y={lowerTop + 21} size={9} tone="muted">
        半固化片 / 介质
      </SvgText>

      <CopperRect
        x={traceX}
        y={traceY}
        width={traceWidth}
        height={copperHeight}
      />
      <WidthArrow left={traceX} right={traceRight} y={upperTop - 10} />
      <line x1={traceX} y1={upperTop - 7} x2={traceX} y2={traceY - 2} strokeOpacity={0.4} />
      <line
        x1={traceRight}
        y1={upperTop - 7}
        x2={traceRight}
        y2={traceY - 2}
        strokeOpacity={0.4}
      />
      <SvgText x={CENTER_X} y={upperTop - 15} size={9.5} tone="primary" weight={600}>
        w
      </SvgText>

      <ThicknessArrow
        x={traceRight + 10}
        top={traceY}
        bottom={traceY + copperHeight}
      />
      <line
        x1={traceRight + 3}
        y1={traceY}
        x2={traceRight + 14}
        y2={traceY}
        strokeOpacity={0.5}
      />
      <line
        x1={traceRight + 3}
        y1={traceY + copperHeight}
        x2={traceRight + 14}
        y2={traceY + copperHeight}
        strokeOpacity={0.5}
      />
      <SvgText
        x={traceRight + 16}
        y={95.5}
        size={8.5}
        anchor="start"
        tone="muted"
      >
        {copperText}
      </SvgText>

      <CurrentArrow x={traceX} y={92} width={traceWidth} />
    </g>
  )
}

function getCopperInfo(value: string): CopperInfo {
  // 铜厚显示参数
  if (value === '0.5') return { text: 't = 17.5 µm', height: 4 }
  if (value === '2') return { text: 't = 70 µm', height: 14 }
  if (value === '3') return { text: 't = 105 µm', height: 20 }
  return { text: 't = 35 µm', height: 8 }
}

function readCurrent(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) ? number : Number.NaN
  }

  return Number.NaN
}

function getTraceWidth(value: unknown): number {
  const current = readCurrent(value)
  if (!Number.isNaN(current) && current > 2) return WIDE_TRACE
  return NARROW_TRACE
}

export function TraceCalcDiagram(props: DiagramProps): JSX.Element {
  const layer =
    typeof props.payload.layer === 'string' ? props.payload.layer : 'ext'
  const copperValue =
    typeof props.payload.copper === 'string' ? props.payload.copper : '1'
  const copper = getCopperInfo(copperValue)
  const traceWidth = getTraceWidth(props.payload.current)
  const isInner = layer === 'int'
  let layerName = '外层'
  if (isInner) layerName = '内层'

  // 绘制对应层位
  let drawing = (
    <OuterLayerScene
      copperHeight={copper.height}
      copperText={copper.text}
      traceWidth={traceWidth}
    />
  )
  if (isInner) {
    drawing = (
      <InnerLayerScene
        copperHeight={copper.height}
        copperText={copper.text}
        traceWidth={traceWidth}
      />
    )
  }

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
        aria-label={`${layerName}走线截面示意图`}
      >
        <ArrowDefinitions />
        {drawing}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {isInner ? '内层 k = 0.024' : '外层 k = 0.048'}：
        I = k·ΔT^0.44·A^0.725（IPC-2221）
      </p>
    </div>
  )
}
