// wave-rms 配图：按所选波形画两个周期，配 +Vpk（实线）、Vrms（虚线）、整流平均 Vavg（点线）三条水平标注线，
// 零线下方画一个周期的双向箭头 T（填了频率则一并显示），图底一行给出当前波形的 kf/kpk（与 runner 公式一致）。
// 注意：下方 SHAPE 系数与 src/main/tools/runners/wave-rms.runner.ts 的换算表保持一致，改动需两处同步。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary），不写死 hex。

import type { DiagramProps } from './types'

interface ShapeInfo {
  name: string
  rmsDiv: number
  avgDiv: number
}

const SHAPE: Record<string, ShapeInfo> = {
  sine: { name: '正弦波', rmsDiv: Math.SQRT2, avgDiv: Math.PI / 2 },
  square: { name: '方波', rmsDiv: 1, avgDiv: 1 },
  triangle: { name: '三角波', rmsDiv: Math.sqrt(3), avgDiv: 2 },
  sawtooth: { name: '锯齿波', rmsDiv: Math.sqrt(3), avgDiv: 2 }
}

const W = 340
const H = 200
const X0 = 26
const X1 = 292
const YC = 104
const AMP = 64
const CYCLES = 2
const CW = (X1 - X0) / CYCLES

function T(props: {
  x: number
  y: number
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  tone?: 'default' | 'muted' | 'primary'
  weight?: number
  children: string
}): JSX.Element {
  const className =
    props.tone === 'primary' ? 'text-primary' : props.tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'
  return (
    <text x={props.x} y={props.y} fontSize={props.size ?? 9} textAnchor={props.anchor ?? 'middle'} fontWeight={props.weight} fill="currentColor" stroke="none" className={className}>
      {props.children}
    </text>
  )
}

function polyPath(pts: [number, number][]): string {
  return 'M ' + pts.map((pt) => pt[0].toFixed(1) + ' ' + pt[1].toFixed(1)).join(' L ')
}

/** 正弦：每 1/4 周期一段三次贝塞尔，控制点按端点切线（dy/dx = −A·cosθ·斜率）拟合 */
function sinePath(): string {
  const quarters = CYCLES * 4
  const qw = (X1 - X0) / quarters
  const slope = (Math.PI / 2) / qw
  let d = 'M ' + X0.toFixed(1) + ' ' + YC.toFixed(1)
  for (let i = 0; i < quarters; i += 1) {
    const t0 = (i * Math.PI) / 2
    const x0 = X0 + i * qw
    const x1 = x0 + qw
    const y0 = YC - AMP * Math.sin(t0)
    const y1 = YC - AMP * Math.sin(t0 + Math.PI / 2)
    const m0 = -AMP * Math.cos(t0) * slope
    const m1 = -AMP * Math.cos(t0 + Math.PI / 2) * slope
    d +=
      ' C ' +
      (x0 + qw / 3).toFixed(1) + ' ' + (y0 + (m0 * qw) / 3).toFixed(1) + ', ' +
      (x1 - qw / 3).toFixed(1) + ' ' + (y1 - (m1 * qw) / 3).toFixed(1) + ', ' +
      x1.toFixed(1) + ' ' + y1.toFixed(1)
  }
  return d
}

/** 方波：矩形折线，半周期交替 ±Vpk */
function squarePath(): string {
  const pts: [number, number][] = [[X0, YC - AMP]]
  for (let c = 0; c < CYCLES; c += 1) {
    const xs = X0 + c * CW
    pts.push([xs + CW / 2, YC - AMP], [xs + CW / 2, YC + AMP], [xs + CW, YC + AMP], [xs + CW, YC - AMP])
  }
  return polyPath(pts)
}

/** 三角波：折线，1/4 周期到顶、3/4 周期到底 */
function trianglePath(): string {
  const pts: [number, number][] = [[X0, YC]]
  for (let c = 0; c < CYCLES; c += 1) {
    const xs = X0 + c * CW
    pts.push([xs + CW / 4, YC - AMP], [xs + (3 * CW) / 4, YC + AMP], [xs + CW, YC])
  }
  return polyPath(pts)
}

/** 锯齿波：斜坡折线，周期末垂直回落 */
function sawtoothPath(): string {
  const pts: [number, number][] = []
  for (let c = 0; c < CYCLES; c += 1) {
    const xs = X0 + c * CW
    pts.push([xs, YC + AMP], [xs + CW, YC - AMP])
  }
  pts.push([X1, YC + AMP])
  return polyPath(pts)
}

function arrowDefs(): JSX.Element {
  return (
    <defs>
      <marker id="wr-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

export function WaveRmsDiagram(props: DiagramProps): JSX.Element {
  const wave = typeof props.payload.wave === 'string' && props.payload.wave ? props.payload.wave : 'sine'
  const shape = SHAPE[wave] ?? SHAPE.sine
  const rawFreq = props.payload.freq
  const freqText = typeof rawFreq === 'number' ? String(rawFreq) : typeof rawFreq === 'string' ? rawFreq.trim() : ''
  const pkY = YC - AMP
  const rmsY = YC - AMP / shape.rmsDiv
  const avgY = YC - AMP / shape.avgDiv
  const kf = shape.avgDiv / shape.rmsDiv
  const kpk = shape.rmsDiv
  const path = wave === 'square' ? squarePath() : wave === 'triangle' ? trianglePath() : wave === 'sawtooth' ? sawtoothPath() : sinePath()
  const arrowY = YC + AMP + 20
  const markLines = [
    { lineY: pkY, label: '+Vpk', tone: 'muted' as const },
    { lineY: rmsY, label: 'Vrms', tone: 'primary' as const },
    { lineY: avgY, label: 'Vavg', tone: 'default' as const }
  ]
  let lastLabelY = Number.NEGATIVE_INFINITY
  const labelMarks = markLines.map((mark) => {
    const y = Math.max(mark.lineY + 3, lastLabelY + 10)
    lastLabelY = y
    return { label: mark.label, tone: mark.tone, y }
  })
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={shape.name + '有效值换算示意图'}>
        {arrowDefs()}
        <T x={12} y={16} anchor="start" size={10} weight={600}>{shape.name}</T>
        {/* 纵轴与零线 */}
        <line x1={14} y1={YC + AMP + 10} x2={14} y2={pkY - 10} className="text-muted-foreground" strokeWidth={0.9} />
        <line x1={14} y1={YC} x2={X1 + 6} y2={YC} className="text-muted-foreground" strokeWidth={0.9} />
        <T x={10} y={YC + 3} anchor="end" size={8} tone="muted">0</T>
        {/* 三条水平标注线：Vpk 实线、Vrms 虚线（pk/rmsDiv）、整流平均 Vavg 点线（pk/avgDiv） */}
        <line x1={X0 - 10} y1={pkY} x2={X1 + 4} y2={pkY} className="text-muted-foreground" strokeWidth={0.9} />
        <line x1={X0 - 10} y1={rmsY} x2={X1 + 4} y2={rmsY} className="text-primary" strokeWidth={1.1} strokeDasharray="6 3" />
        <line x1={X0 - 10} y1={avgY} x2={X1 + 4} y2={avgY} strokeWidth={1.1} strokeDasharray="1.2 3.2" />
        {labelMarks.map((mark) => (
          <T key={mark.label} x={X1 + 10} y={mark.y} anchor="start" size={8.5} tone={mark.tone}>{mark.label}</T>
        ))}
        {/* 波形 */}
        <path d={path} className="text-primary" strokeWidth={1.8} />
        {/* 一个周期的双向箭头与 T（有频率则标出） */}
        <line x1={X0} y1={YC + AMP + 6} x2={X0} y2={arrowY} className="text-muted-foreground" strokeWidth={0.8} strokeDasharray="2 3" />
        <line x1={X0 + CW} y1={YC + AMP + 6} x2={X0 + CW} y2={arrowY} className="text-muted-foreground" strokeWidth={0.8} strokeDasharray="2 3" />
        <line x1={X0} y1={arrowY} x2={X0 + CW} y2={arrowY} strokeWidth={1} markerStart="url(#wr-arrow)" markerEnd="url(#wr-arrow)" />
        <T x={X0 + CW / 2} y={arrowY - 5} size={8.5} tone="muted">{freqText ? 'T（' + freqText + ' Hz）' : 'T'}</T>
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {shape.name + '：波形因数 kf = ' + kf.toFixed(3) + ' · 峰值因数 kpk = ' + kpk.toFixed(3)}
      </p>
    </div>
  )
}
