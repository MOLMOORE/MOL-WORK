// trace-calc 配图：PCB 走线载流截面示意，随 payload.layer 在外层 / 内层两种视图间切换。
// 标注与 trace-calc.runner.ts 字段一致：宽度 w、厚度 t（按 payload.copper 显 µm 数值）、电流 I、IPC-2221 经验式与对应 k 值。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary），不写死色值。

import type { DiagramProps } from './types'

const W = 320
const H = 172
const CENTER_X = 150
const PANEL_X = 44
const PANEL_W = 212
const CORE_TOP = 108
const CORE_H = 42
const INT_MID = 92
const NARROW_W = 36
const WIDE_W = 58

/** 四档铜厚的截面高度（px）：按 0.5 : 1 : 2 : 3 视觉分档 */
const COPPER: Record<string, { um: string; t: number }> = {
  '0.5': { um: 't = 17.5 µm', t: 4 },
  '1': { um: 't = 35 µm', t: 8 },
  '2': { um: 't = 70 µm', t: 14 },
  '3': { um: 't = 105 µm', t: 20 }
}

function currentAmps(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN
  if (typeof raw === 'string' && raw.trim() !== '') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : Number.NaN
  }
  return Number.NaN
}

/** SVG 内文字：fill=currentColor、不参与描边，tone 选择主题令牌 */
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

function arrowDefs(): JSX.Element {
  return (
    <defs>
      <marker id="tc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
      <marker id="tc-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
        <path d="M 9 1 L 2 5 L 9 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

/** 水平双向尺寸线（标注宽度 w） */
function dimH(x1: number, x2: number, y: number): JSX.Element {
  return <line x1={x1} y1={y} x2={x2} y2={y} markerStart="url(#tc-arrow-start)" markerEnd="url(#tc-arrow)" />
}

/** 垂直双向尺寸线（标注铜厚 t） */
function dimV(x: number, y1: number, y2: number): JSX.Element {
  return <line x1={x} y1={y1} x2={x} y2={y2} markerStart="url(#tc-arrow-start)" markerEnd="url(#tc-arrow)" />
}

/** 走线截面矩形：主题色淡填充，宽度随电流分两档、高度随铜厚分四档 */
function traceRect(x: number, y: number, w: number, t: number): JSX.Element {
  return <rect x={x} y={y} width={w} height={t} className="text-primary" fill="currentColor" fillOpacity={0.28} stroke="currentColor" />
}

/** 电流方向箭头：从左侧进入走线、指出右端，旁标 I */
function currentFlow(x: number, midY: number, w: number): JSX.Element {
  return (
    <g>
      <line x1={x - 42} y1={midY} x2={x + w - 7} y2={midY} markerEnd="url(#tc-arrow)" />
      <T x={x - 24} y={midY - 6} size={9.5} tone="primary" weight={600}>I</T>
    </g>
  )
}

/** 外层视图：走线贴在 FR-4 芯板表面 */
function extScene(t: number, w: number, tLabel: string): JSX.Element {
  const x = CENTER_X - w / 2
  const top = CORE_TOP - t
  const right = x + w
  return (
    <g>
      <rect x={PANEL_X} y={CORE_TOP} width={PANEL_W} height={CORE_H} fill="currentColor" fillOpacity={0.05} />
      <path d={'M ' + (PANEL_X + 10) + ' ' + (CORE_TOP + CORE_H - 6) + ' l 14 -14'} strokeOpacity={0.3} />
      <path d={'M ' + (PANEL_X + 24) + ' ' + (CORE_TOP + CORE_H - 6) + ' l 14 -14'} strokeOpacity={0.3} />
      <path d={'M ' + (PANEL_X + 38) + ' ' + (CORE_TOP + CORE_H - 6) + ' l 14 -14'} strokeOpacity={0.3} />
      <T x={CENTER_X + 34} y={CORE_TOP + CORE_H / 2 + 4} size={9.5} tone="muted">FR-4 芯板</T>
      {traceRect(x, top, w, t)}
      {dimH(x, right, top - 14)}
      <line x1={x} y1={top - 11} x2={x} y2={top - 2} strokeOpacity={0.5} />
      <line x1={right} y1={top - 11} x2={right} y2={top - 2} strokeOpacity={0.5} />
      <T x={CENTER_X} y={top - 19} size={9.5} tone="primary" weight={600}>w</T>
      {dimV(right + 10, top, CORE_TOP)}
      <line x1={right + 3} y1={top} x2={right + 14} y2={top} strokeOpacity={0.5} />
      <T x={right + 16} y={top - 3} size={8.5} anchor="start" tone="muted">{tLabel}</T>
      {currentFlow(x, top + t / 2, w)}
    </g>
  )
}

/** 内层视图：走线截面嵌在两层介质之间 */
function intScene(t: number, w: number, tLabel: string): JSX.Element {
  const x = CENTER_X - w / 2
  const top = INT_MID - t / 2
  const right = x + w
  const upperY = top - 40
  const lowerY = top + t + 6
  return (
    <g>
      <rect x={PANEL_X} y={upperY} width={PANEL_W} height={34} fill="currentColor" fillOpacity={0.05} />
      <T x={CENTER_X} y={upperY + 21} size={9} tone="muted">半固化片 / 介质</T>
      <rect x={PANEL_X} y={lowerY} width={PANEL_W} height={34} fill="currentColor" fillOpacity={0.05} />
      <T x={CENTER_X} y={lowerY + 21} size={9} tone="muted">半固化片 / 介质</T>
      {traceRect(x, top, w, t)}
      {dimH(x, right, upperY - 10)}
      <line x1={x} y1={upperY - 7} x2={x} y2={top - 2} strokeOpacity={0.4} />
      <line x1={right} y1={upperY - 7} x2={right} y2={top - 2} strokeOpacity={0.4} />
      <T x={CENTER_X} y={upperY - 15} size={9.5} tone="primary" weight={600}>w</T>
      {dimV(right + 10, top, top + t)}
      <line x1={right + 3} y1={top} x2={right + 14} y2={top} strokeOpacity={0.5} />
      <line x1={right + 3} y1={top + t} x2={right + 14} y2={top + t} strokeOpacity={0.5} />
      <T x={right + 16} y={INT_MID + 3.5} size={8.5} anchor="start" tone="muted">{tLabel}</T>
      {currentFlow(x, INT_MID, w)}
    </g>
  )
}

export function TraceCalcDiagram(props: DiagramProps): JSX.Element {
  const layer = typeof props.payload.layer === 'string' && props.payload.layer === 'int' ? 'int' : 'ext'
  const copperKey = typeof props.payload.copper === 'string' ? props.payload.copper : '1'
  const copper = COPPER[copperKey] ?? COPPER['1']
  const amps = currentAmps(props.payload.current)
  const w = !Number.isNaN(amps) && amps > 2 ? WIDE_W : NARROW_W
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={(layer === 'int' ? '内层' : '外层') + '走线截面示意图'}>
        {arrowDefs()}
        {layer === 'int' ? intScene(copper.t, w, copper.um) : extScene(copper.t, w, copper.um)}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {(layer === 'int' ? '内层 k = 0.024' : '外层 k = 0.048') + '：I = k·ΔT^0.44·A^0.725（IPC-2221）'}
      </p>
    </div>
  )
}