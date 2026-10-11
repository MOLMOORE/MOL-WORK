// rect-calc 配图：半波 / 全波中心抽头 / 桥式三种整流拓扑各画整页电路，随表单 payload.mode 切换。
// 位号与 rect-calc.runner.ts 的字段一致：V₂ = vsec、D₁…D₄ = 整流二极管、C = cap、RL 走 iload。
// 画法按教材标准近似（Vr(pp) = I/(f_r·C)，纹波按三角波）；二极管用通用符号（三角 + 短横线）。
// 纯内联 SVG：fill none + stroke currentColor，颜色只走主题令牌（text-foreground / text-muted-foreground / text-primary），零硬编码色值。

import type { DiagramProps } from './types'

const W = 350
const H = 188
const POS_Y = 64
const GND_Y = 150
const CAP_X = 232
const RL_X = 302

interface Labels {
  v2: string
  c: string
  rl: string
  rlNote: string
}

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
    <text x={props.x} y={props.y} fontSize={props.size ?? 8.5} textAnchor={props.anchor ?? 'middle'} fontWeight={props.weight} fill="currentColor" stroke="none" className={className}>
      {props.children}
    </text>
  )
}

function dot(x: number, y: number): JSX.Element {
  return <circle cx={x} cy={y} r={2.1} fill="currentColor" stroke="none" />
}

/** 变压器绕组：从 y1 均分 arcs 段到 y2，向右鼓出 */
function coilPath(x: number, y1: number, y2: number, arcs: number): string {
  const span = (y2 - y1) / arcs
  let d = `M ${x} ${y1}`
  for (let i = 0; i < arcs; i += 1) {
    d += ` A 6 ${(span / 2).toFixed(1)} 0 0 1 ${x} ${(y1 + span * (i + 1)).toFixed(1)}`
  }
  return d
}

/** 二极管：原点居中，阳极在左、阴极在右，引线各长 9 */
function diodeSymbol(): JSX.Element {
  return (
    <g>
      <path d="M -9 0 H -3" />
      <path d="M -3 -5 L 5 0 L -3 5 Z" />
      <path d="M 5 -5 V 5" />
      <path d="M 5 0 H 9" />
    </g>
  )
}

function diodeAt(x: number, y: number, deg: number): JSX.Element {
  return <g transform={`translate(${x} ${y}) rotate(${deg})`}>{diodeSymbol()}</g>
}

/** 全桥的一条边：电流 a → b，中间放二极管、两端补引线 */
function bridgeEdge(ax: number, ay: number, bx: number, by: number): JSX.Element {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  return (
    <g>
      <path d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${(mx - ux * 9).toFixed(1)} ${(my - uy * 9).toFixed(1)}`} />
      <g transform={`translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${deg.toFixed(1)})`}>{diodeSymbol()}</g>
      <path d={`M ${(mx + ux * 9).toFixed(1)} ${(my + uy * 9).toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`} />
    </g>
  )
}

/** 竖直放置的负载电阻（锯齿） */
function resistorV(x: number, y1: number, y2: number): JSX.Element {
  const bodyH = Math.min(48, (y2 - y1) * 0.72)
  const top = (y1 + y2) / 2 - bodyH / 2
  const seg = bodyH / 6
  let d = `M ${x} ${y1} L ${x} ${top.toFixed(1)}`
  for (let i = 0; i < 6; i += 1) {
    d += ` L ${(x + (i % 2 === 0 ? -6 : 6)).toFixed(1)} ${(top + seg * (i + 0.5)).toFixed(1)}`
  }
  d += ` L ${x} ${(top + bodyH).toFixed(1)} L ${x} ${y2}`
  return <path d={d} />
}

/** 地：三横线 */
function gnd(x: number, y: number): JSX.Element {
  return (
    <g>
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x - 4.5} y1={y + 3.5} x2={x + 4.5} y2={y + 3.5} />
      <line x1={x - 2} y1={y + 7} x2={x + 2} y2={y + 7} />
    </g>
  )
}

/** 正弦折线近似（交流源里的符号） */
function sinePath(x0: number, x1: number, yc: number, amp: number, cycles: number): string {
  const steps = Math.max(20, Math.round((x1 - x0) / 2))
  const pts: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = yc - amp * Math.sin((i / steps) * cycles * Math.PI * 2)
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return `M ${pts.join(' L ')}`
}

function sourceBlock(labels: Labels): JSX.Element {
  return (
    <g>
      <circle cx={26} cy={110} r={12} />
      <path d={sinePath(18, 34, 110, 5, 1)} strokeWidth={1.1} />
      <path d="M 26 98 V 86 H 62" />
      <path d="M 26 122 V 134 H 62" />
      <T x={26} y={78} size={8.5}>{labels.v2}</T>
    </g>
  )
}

function primaryWinding(): JSX.Element {
  return <path d={coilPath(62, 86, 134, 4)} />
}

function transformerCore(): JSX.Element {
  return (
    <g className="text-muted-foreground" strokeWidth={1} strokeDasharray="3 3">
      <path d="M 76 78 V 142" />
      <path d="M 81 78 V 142" />
    </g>
  )
}

function capBlock(labels: Labels): JSX.Element {
  return (
    <g>
      <path d={`M ${CAP_X} ${POS_Y} V 104`} />
      <path d={`M ${CAP_X - 10} 104 H ${CAP_X + 10}`} />
      <path d={`M ${CAP_X - 10} 112 H ${CAP_X + 10}`} />
      <path d={`M ${CAP_X} 112 V ${GND_Y}`} />
      <T x={CAP_X - 14} y={97} size={8.5} anchor="end">{labels.c}</T>
    </g>
  )
}

function loadBlock(labels: Labels): JSX.Element {
  return (
    <g>
      {resistorV(RL_X, POS_Y, GND_Y)}
      <T x={RL_X - 15} y={96} size={8.5} anchor="end">{labels.rl}</T>
      {labels.rlNote ? <T x={RL_X - 15} y={106} size={7.5} anchor="end" tone="muted">{labels.rlNote}</T> : null}
    </g>
  )
}

/** 整流输出之后的滤波与负载：正极母线 + 竖放电容与 RL 并联 + 地 */
function outputStage(posFromX: number, gndFromX: number, labels: Labels): JSX.Element {
  return (
    <g>
      <path d={`M ${posFromX} ${POS_Y} H ${RL_X}`} />
      <path d={`M ${gndFromX} ${GND_Y} H ${RL_X}`} />
      {dot(CAP_X, POS_Y)}
      {dot(CAP_X, GND_Y)}
      <path d={`M 196 ${GND_Y} V ${GND_Y + 2}`} />
      {gnd(196, GND_Y + 2)}
      <T x={posFromX + 12} y={POS_Y - 5} size={8} tone="primary" weight={600}>+</T>
      {capBlock(labels)}
      {loadBlock(labels)}
    </g>
  )
}

/** 半波：次级上端串一只二极管，负半周全靠电容放电 */
function sceneHalf(labels: Labels): JSX.Element {
  return (
    <g>
      {sourceBlock(labels)}
      {primaryWinding()}
      {transformerCore()}
      <path d={coilPath(96, 86, 134, 4)} />
      <path d={`M 96 86 H 126 V ${POS_Y} H 161`} />
      {diodeAt(170, POS_Y, 0)}
      <T x={170} y={POS_Y - 12} size={8.5}>D₁</T>
      <path d={`M 96 134 H 120 V ${GND_Y}`} />
      {outputStage(179, 120, labels)}
      <T x={245} y={42} size={7.5} tone="muted">仅正半周导通</T>
    </g>
  )
}

/** 全波中心抽头：绕组中点接地，上下两只二极管轮流导通 */
function sceneCt(labels: Labels): JSX.Element {
  return (
    <g>
      {sourceBlock(labels)}
      {primaryWinding()}
      {transformerCore()}
      <path d={coilPath(96, 82, 106, 2)} />
      <path d={coilPath(96, 114, 138, 2)} />
      <path d="M 96 106 V 114" />
      <path d={`M 96 110 H 86 V ${GND_Y}`} />
      {dot(96, 110)}
      <path d="M 96 82 H 135" />
      {diodeAt(150, 82, 0)}
      <path d="M 159 82 H 190" />
      <path d="M 96 138 H 135" />
      {diodeAt(150, 138, 0)}
      <path d="M 159 138 H 190" />
      <path d="M 190 82 V 138" />
      <path d={`M 190 82 V ${POS_Y}`} />
      <T x={150} y={74} size={8.5}>D₁</T>
      <T x={150} y={130} size={8.5}>D₂</T>
      <T x={112} y={112} size={7.5} anchor="start" tone="muted">中心抽头</T>
      {outputStage(190, 86, labels)}
      <T x={245} y={42} size={7.5} tone="muted">两管轮流导通</T>
    </g>
  )
}

/** 桥式全波：四只二极管组成菱形全桥，交流进左右顶点、直流出上下顶点 */
function sceneBridge(labels: Labels): JSX.Element {
  const cx = 185
  const topX = cx
  const topY = POS_Y
  const bottomX = cx
  const bottomY = 116
  const leftX = 159
  const midY = 90
  const rightX = 211
  return (
    <g>
      {sourceBlock(labels)}
      {primaryWinding()}
      {transformerCore()}
      <path d={coilPath(96, 86, 134, 4)} />
      <path d={`M 96 86 H 126 V ${midY} H ${leftX}`} />
      <path d={`M 96 134 H 179 Q ${cx} 126 191 134 H ${rightX} V ${midY}`} />
      {bridgeEdge(leftX, midY, topX, topY)}
      {bridgeEdge(rightX, midY, topX, topY)}
      {bridgeEdge(bottomX, bottomY, leftX, midY)}
      {bridgeEdge(bottomX, bottomY, rightX, midY)}
      <T x={162} y={68} size={8}>D₁</T>
      <T x={208} y={68} size={8}>D₂</T>
      <T x={162} y={112} size={8}>D₃</T>
      <T x={208} y={112} size={8}>D₄</T>
      <path d={`M ${bottomX} ${bottomY} V ${GND_Y}`} />
      {outputStage(topX, bottomX, labels)}
      <T x={250} y={42} size={7.5} tone="muted">四管两两轮流导通</T>
    </g>
  )
}

const TOPOLOGIES: Record<string, string> = {
  half: '半波整流',
  ct: '全波中心抽头整流',
  bridge: '桥式全波整流'
}

export function RectCalcDiagram(props: DiagramProps): JSX.Element {
  const { payload } = props
  const mode = String(payload.mode ?? '')
  const key = TOPOLOGIES[mode] ? mode : 'bridge'
  const vsec = String(payload.vsec ?? '').trim()
  const capText = String(payload.cap ?? '').trim()
  const loadText = String(payload.iload ?? '').trim()
  const fDigits = String(payload.f ?? '').replace(/[^0-9.]/g, '')
  const fNum = Number(fDigits)
  const fBase = Number.isFinite(fNum) && fNum > 0 ? fNum : 50
  const fr = key === 'half' ? fBase : fBase * 2
  const topology = TOPOLOGIES[key]
  const labels: Labels = {
    v2: vsec ? `V₂ ${vsec} V` : 'V₂',
    c: capText ? `C ${capText}` : 'C',
    rl: 'RL',
    rlNote: loadText ? `I = ${loadText} A` : ''
  }
  const note =
    key === 'half'
      ? `半波纹波频率仍是 f = ${fBase} Hz，纹波大、变压器有直流磁化，一般不带载用`
      : `全波每周期给电容补电两次，纹波频率取 2f = ${fr} Hz（50 Hz 电网即 100 Hz）`
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={`${topology} 电路示意图`}>
        {key === 'half' ? sceneHalf(labels) : key === 'ct' ? sceneCt(labels) : sceneBridge(labels)}
        <T x={175} y={176} size={8} tone="muted">{`${topology} · Vr(pp) = I / (f_r·C) · f_r = ${fr} Hz`}</T>
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">{`${topology}：Vdc ≈ √2·V₂ − 导通压降，Vr(pp) = I / (f_r·C)。${note}。`}</p>
    </div>
  )
}