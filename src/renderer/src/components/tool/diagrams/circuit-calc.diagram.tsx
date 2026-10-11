// circuit-calc 配图：8 种计算模式各画一张与公式对应的电路原理图，随表单 payload.mode 联动。
// 位号与 circuit-calc.runner.ts 的字段标签一致：R、R2、C、L、电源 U/Vs、LED 正向压降 Vf。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary），符号遵循常规 schematic 画法。

import type { DiagramProps } from './types'

const W = 320
const H = 185

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

function dot(x: number, y: number): JSX.Element {
  return <circle cx={x} cy={y} r={2.2} fill="currentColor" stroke="none" />
}

/** 水平电阻：两端引线 + 中段锯齿 */
function resistorH(x1: number, x2: number, y: number): JSX.Element {
  const bodyW = Math.min(46, (x2 - x1) * 0.72)
  const left = (x1 + x2) / 2 - bodyW / 2
  const seg = bodyW / 6
  let d = 'M ' + x1 + ' ' + y + ' L ' + left.toFixed(1) + ' ' + y
  for (let i = 0; i < 6; i += 1) {
    d += ' L ' + (left + seg * (i + 0.5)).toFixed(1) + ' ' + (y + (i % 2 === 0 ? -6 : 6))
  }
  d += ' L ' + (left + bodyW).toFixed(1) + ' ' + y + ' L ' + x2 + ' ' + y
  return <path d={d} />
}

/** 垂直电阻 */
function resistorV(x: number, y1: number, y2: number): JSX.Element {
  const bodyH = Math.min(42, (y2 - y1) * 0.72)
  const top = (y1 + y2) / 2 - bodyH / 2
  const seg = bodyH / 6
  let d = 'M ' + x + ' ' + y1 + ' L ' + x + ' ' + top.toFixed(1)
  for (let i = 0; i < 6; i += 1) {
    d += ' L ' + (x + (i % 2 === 0 ? -6 : 6)) + ' ' + (top + seg * (i + 0.5)).toFixed(1)
  }
  d += ' L ' + x + ' ' + (top + bodyH).toFixed(1) + ' L ' + x + ' ' + y2
  return <path d={d} />
}

/** 电感：水平排布的半圆凸起 */
function inductorH(x1: number, x2: number, y: number): JSX.Element {
  const n = 4
  const r = (x2 - x1) / (n * 2)
  let d = 'M ' + x1 + ' ' + y
  for (let i = 0; i < n; i += 1) {
    d += ' A ' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (x1 + 2 * r * (i + 1)).toFixed(1) + ' ' + y
  }
  return <path d={d} />
}

/** 电容：水平导线断口处的两块平行极板 */
function capH(xc: number, y: number): JSX.Element {
  return (
    <g>
      <line x1={xc - 4} y1={y - 9} x2={xc - 4} y2={y + 9} />
      <line x1={xc + 4} y1={y - 9} x2={xc + 4} y2={y + 9} />
    </g>
  )
}

/** 直流电源（电池符号）：长横线为正极、短粗线为负极，断在垂直导线 yc 处 */
function sourceV(x: number, yTop: number, yBot: number, label: string): JSX.Element {
  const yc = (yTop + yBot) / 2
  return (
    <g>
      <path d={'M ' + x + ' ' + yTop + ' V ' + (yc - 4)} />
      <path d={'M ' + x + ' ' + (yc + 3) + ' V ' + yBot} />
      <line x1={x - 10} y1={yc - 4} x2={x + 10} y2={yc - 4} strokeWidth={1.5} />
      <line x1={x - 5} y1={yc + 3} x2={x + 5} y2={yc + 3} strokeWidth={2.8} />
      <T x={x - 14} y={yc + 3} anchor="end">{label}</T>
    </g>
  )
}

/** 接地：三横线 */
function gnd(x: number, y: number): JSX.Element {
  return (
    <g>
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x - 4.5} y1={y + 3.5} x2={x + 4.5} y2={y + 3.5} />
      <line x1={x - 2} y1={y + 7} x2={x + 2} y2={y + 7} />
    </g>
  )
}

/** 圆圈表计（电压表 V / 电流表 A） */
function meter(x: number, y: number, label: string): JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r={11} />
      <T x={x} y={y + 3.4} size={9} weight={600}>{label}</T>
    </g>
  )
}

/** 开关：两个触点与一只抬起的闸刀 */
function switchH(x1: number, x2: number, y: number): JSX.Element {
  return (
    <g>
      {dot(x1, y)}
      {dot(x2, y)}
      <line x1={x1} y1={y} x2={x2 - 5} y2={y - 14} />
    </g>
  )
}

function arrowDefs(): JSX.Element {
  return (
    <defs>
      <marker id="cc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

/** 回路右侧支路上的向下电流箭头（常规电流方向：电源正极出发顺时针） */
function currentArrow(x: number, labelY: number, label = 'I'): JSX.Element {
  return (
    <g>
      <line x1={x} y1={labelY - 18} x2={x} y2={labelY - 2} markerEnd="url(#cc-arrow)" />
      <T x={x + 8} y={labelY - 8} anchor="start" size={8.5} tone="primary">{label}</T>
    </g>
  )
}

interface Scene {
  title: string
  formula: string
  render: () => JSX.Element
}

const SCENES: Record<string, Scene> = {
  ohm: {
    title: '欧姆定律（U/I/R 求其一）',
    formula: 'U = I · R（电压表并联在 R 两端，电流表串在回路里）',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'U')}
        <path d="M40 45 H125" />
        {resistorH(125, 195, 45)}
        <T x={160} y={33}>R</T>
        <path d="M195 45 H280" />
        <path d="M280 45 V150" />
        <path d="M280 150 H171" />
        <path d="M149 150 H40" />
        {meter(160, 150, 'A')}
        <path d="M118 45 V24 H149" />
        <path d="M171 24 H202 V45" />
        {meter(160, 24, 'V')}
        {dot(118, 45)}
        {dot(202, 45)}
        {currentArrow(280, 108)}
      </g>
    )
  },
  power: {
    title: '功率计算（P = UI）',
    formula: 'P = U·I = I²R = U²/R',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'U')}
        <path d="M40 45 H120" />
        {resistorH(120, 190, 45)}
        <T x={155} y={33}>R</T>
        <path d="M190 45 H280" />
        <path d="M280 45 V150" />
        <path d="M280 150 H40" />
        {currentArrow(280, 108)}
        <T x={160} y={100} size={13} tone="primary" weight={600}>P = U·I</T>
        <T x={160} y={116} size={9} tone="muted">= I²R = U²/R</T>
      </g>
    )
  },
  series: {
    title: '电阻串联',
    formula: 'R总 = R + R2',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'U')}
        <path d="M40 45 H85" />
        {resistorH(85, 135, 45)}
        <T x={110} y={33}>R</T>
        <path d="M135 45 H185" />
        {resistorH(185, 235, 45)}
        <T x={210} y={33}>R2</T>
        <path d="M235 45 H280" />
        <path d="M280 45 V150" />
        <path d="M280 150 H40" />
        {currentArrow(280, 108)}
      </g>
    )
  },
  parallel: {
    title: '电阻并联',
    formula: 'R总 = R · R2 / (R + R2)',
    render: () => (
      <g>
        {sourceV(40, 50, 155, 'U')}
        <path d="M40 50 H100" />
        <path d="M40 155 H100" />
        <path d="M100 50 V155" />
        <path d="M260 50 V155" />
        <path d="M100 50 H130" />
        {resistorH(130, 185, 50)}
        <path d="M185 50 H260" />
        <T x={157} y={38}>R</T>
        <path d="M100 108 H130" />
        {resistorH(130, 185, 108)}
        <path d="M185 108 H260" />
        <T x={157} y={96}>R2</T>
        {dot(100, 108)}
        {dot(260, 108)}
      </g>
    )
  },
  divider: {
    title: '分压电路（求 Vout）',
    formula: 'Vout = Vin · R2 / (R1 + R2)',
    render: () => (
      <g>
        {sourceV(50, 40, 150, 'Vin')}
        <path d="M50 40 H210" />
        <path d="M210 40 V52" />
        {resistorV(210, 52, 92)}
        <T x={224} y={76} anchor="start">R1</T>
        <path d="M210 92 V102" />
        {resistorV(210, 102, 140)}
        <T x={224} y={126} anchor="start">R2</T>
        <path d="M210 140 V150" />
        <path d="M210 150 H50" />
        {dot(210, 97)}
        <path d="M210 97 H262" />
        <circle cx={268} cy={97} r={3.5} />
        <T x={268} y={112} size={8.5} tone="primary">Vout</T>
        <path d="M130 150 V157" />
        {gnd(130, 157)}
      </g>
    )
  },
  rl: {
    title: 'RL 时间常数',
    formula: 'τ = L / R',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'U')}
        <path d="M40 45 H95" />
        {switchH(95, 135, 45)}
        <T x={115} y={26} size={8} tone="muted">S</T>
        <path d="M135 45 H160" />
        {resistorH(160, 210, 45)}
        <T x={185} y={33}>R</T>
        <path d="M210 45 H235" />
        {inductorH(235, 283, 45)}
        <T x={259} y={31}>L</T>
        <path d="M283 45 V150" />
        <path d="M283 150 H40" />
      </g>
    )
  },
  'cap-energy': {
    title: '电容储能（E = ½CV²）',
    formula: 'E = ½ · C · U²（经开关 S 直接充电至电源电压）',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'U')}
        <path d="M40 45 H110" />
        {switchH(110, 150, 45)}
        <T x={130} y={26} size={8} tone="muted">S</T>
        <path d="M150 45 H204" />
        {capH(208, 45)}
        <path d="M212 45 H280" />
        <T x={208} y={28} size={9}>C</T>
        <T x={196} y={38} size={7} tone="muted">+</T>
        <path d="M280 45 V150" />
        <path d="M280 150 H40" />
      </g>
    )
  },
  led: {
    title: 'LED 限流电阻',
    formula: 'R = (Vs − Vf) / I',
    render: () => (
      <g>
        {sourceV(40, 45, 150, 'Vs')}
        <path d="M40 45 H85" />
        {resistorH(85, 135, 45)}
        <T x={110} y={33}>R</T>
        <path d="M135 45 H190" />
        <path d="M190 36 L190 54 L206 45 Z" />
        <line x1={206} y1={35} x2={206} y2={55} />
        <path d="M206 45 H280" />
        <line x1={198} y1={32} x2={206} y2={22} markerEnd="url(#cc-arrow)" />
        <line x1={207} y1={31} x2={215} y2={21} markerEnd="url(#cc-arrow)" />
        <T x={212} y={68} anchor="start" size={8.5}>Vf</T>
        <path d="M280 45 V150" />
        <path d="M280 150 H40" />
        <line x1={205} y1={150} x2={185} y2={150} markerEnd="url(#cc-arrow)" />
        <T x={196} y={164} size={8.5} tone="primary">I</T>
      </g>
    )
  }
}

export function CircuitCalcDiagram(props: DiagramProps): JSX.Element | null {
  const mode = typeof props.payload.mode === 'string' && props.payload.mode ? props.payload.mode : 'ohm'
  const scene = SCENES[mode]
  if (!scene) return null
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={scene.title + ' 示意图'}>
        {arrowDefs()}
        {scene.render()}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">{scene.title + '：' + scene.formula}</p>
    </div>
  )
}
