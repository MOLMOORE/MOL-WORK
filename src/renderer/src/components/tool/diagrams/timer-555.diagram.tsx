// timer-555 配图：555 无稳态 / 单稳标准接法示意，随表单 payload.mode 切换。
// 位号与 555-timer.runner.ts 字段一致：无稳态 RA/RB/C、单稳 R/C（表单有值时位号后带值，留空只显位号）。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary）。

import type { DiagramProps } from './types'

const W = 340
const H = 234

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

function gnd(x: number, y: number): JSX.Element {
  return (
    <g>
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x - 4.5} y1={y + 3.5} x2={x + 4.5} y2={y + 3.5} />
      <line x1={x - 2} y1={y + 7} x2={x + 2} y2={y + 7} />
    </g>
  )
}

/** 555 本体：左列自上而下 4/3/2/1，右列自上而下 8/7/6/5，含引脚短线与脚号 */
function chip(): JSX.Element {
  return (
    <g>
      <path d="M 140 52 A 8 8 0 0 0 156 52" />
      <rect x={118} y={52} width={60} height={120} rx={3} />
      <path d="M 118 67 H 106" />
      <path d="M 118 100 H 106" />
      <path d="M 118 133 H 106" />
      <path d="M 118 166 H 106" />
      <path d="M 178 67 H 190" />
      <path d="M 178 100 H 190" />
      <path d="M 178 133 H 190" />
      <path d="M 178 166 H 190" />
      <T x={123} y={70} anchor="start" size={6}>RST 4</T>
      <T x={123} y={103} anchor="start" size={6}>OUT 3</T>
      <T x={123} y={136} anchor="start" size={6}>TRI 2</T>
      <T x={123} y={169} anchor="start" size={6}>GND 1</T>
      <T x={173} y={70} anchor="end" size={6}>VCC 8</T>
      <T x={173} y={103} anchor="end" size={6}>DIS 7</T>
      <T x={173} y={136} anchor="end" size={6}>THR 6</T>
      <T x={173} y={169} anchor="end" size={6}>CTRL 5</T>
      <T x={148} y={122} size={8} weight={700}>NE555</T>
    </g>
  )
}

function arrowDefs(): JSX.Element {
  return (
    <defs>
      <marker id="t555-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

const frameDash = { stroke: 'currentColor', strokeWidth: 0.9, strokeDasharray: '4 3' } as const

/** 两种模式共用的接法：VCC 汇流条、RST 接 VCC、脚 3 输出走线、6/2 相连回绕、定时 C、CTRL 旁路 10n、脚 1 接地 */
function commonWires(): JSX.Element {
  return (
    <g>
      <path d="M 190 67 H 250" />
      {dot(250, 67)}
      {dot(222, 67)}
      <path d="M 106 67 H 88 V 46 H 250 V 67" />
      <T x={169} y={42} size={6} tone="muted">RST 接 VCC</T>
      <path d="M 106 100 H 84 V 30 H 272 V 36" />
      <path d="M 190 133 H 262" />
      {dot(262, 133)}
      <path d="M 262 133 V 222 H 92 V 133 H 106" />
      {dot(92, 133)}
      {dot(240, 133)}
      <path d="M 240 133 V 148" />
      <path d="M 231 148 H 249" />
      <path d="M 231 154 H 249" />
      <path d="M 240 154 V 170" />
      {gnd(240, 170)}
      <path d="M 190 166 H 206 V 178" />
      <path d="M 197 178 H 215" />
      <path d="M 197 184 H 215" />
      <path d="M 206 184 V 190" />
      {gnd(206, 190)}
      <T x={219} y={176} anchor="start" size={6} tone="muted">10n</T>
      <path d="M 106 166 H 96 V 172" />
      {gnd(96, 172)}
    </g>
  )
}

/** 无稳态：VCC→RA→7(DIS)，7→RB→6(THR)，6/2 经 C 到地；右上输出方波框标 tH/tL 与周期箭头 */
function astableScene(raTag: string, rbTag: string, cTag: string): JSX.Element {
  return (
    <g>
      {resistorV(222, 67, 100)}
      {resistorV(222, 100, 133)}
      <path d="M 190 100 H 222" />
      {dot(222, 100)}
      {dot(222, 133)}
      <T x={232} y={84} anchor="start" size={7}>{raTag}</T>
      <T x={232} y={118} anchor="start" size={7}>{rbTag}</T>
      <T x={231} y={152} anchor="end" size={7}>{cTag}</T>
      <rect x={272} y={36} width={64} height={72} rx={6} className="text-muted-foreground" {...frameDash} />
      <g className="text-primary" stroke="currentColor" strokeWidth={1.5}>
        <path d="M 280 92 V 58 H 304 V 92 H 316 V 58 H 332" />
      </g>
      <line x1={298} y1={44} x2={280} y2={44} markerEnd="url(#t555-arrow)" />
      <line x1={298} y1={44} x2={316} y2={44} markerEnd="url(#t555-arrow)" />
      <T x={297} y={40} size={6.5} tone="primary" weight={600}>T</T>
      <T x={292} y={53} size={6.5} tone="muted">tH</T>
      <T x={310} y={102} size={6.5} tone="muted">tL</T>
    </g>
  )
}

/** 单稳：7 悬空，VCC→R→6/2 节点，C 从节点到地；脚 2 左侧低脉冲触发波形，输出框画宽度为 t 的单脉冲 */
function monoScene(rTag: string, cTag: string): JSX.Element {
  return (
    <g>
      {resistorV(222, 67, 133)}
      {dot(222, 133)}
      <T x={196} y={96} anchor="start" size={6} tone="muted">NC</T>
      <T x={232} y={102} anchor="start" size={7}>{rTag}</T>
      <T x={231} y={152} anchor="end" size={7}>{cTag}</T>
      <path d="M 86 133 H 92" />
      <rect x={12} y={106} width={74} height={54} rx={6} className="text-muted-foreground" {...frameDash} />
      <g className="text-primary" stroke="currentColor" strokeWidth={1.5}>
        <path d="M 18 120 H 32 V 144 H 48 V 120 H 82" />
      </g>
      <T x={58} y={156} size={6} tone="muted">拉低于 1/3 VCC</T>
      <rect x={272} y={36} width={64} height={72} rx={6} className="text-muted-foreground" {...frameDash} />
      <g className="text-primary" stroke="currentColor" strokeWidth={1.5}>
        <path d="M 280 92 H 296 V 58 H 322 V 92 H 332" />
      </g>
      <line x1={309} y1={46} x2={296} y2={46} markerEnd="url(#t555-arrow)" />
      <line x1={309} y1={46} x2={322} y2={46} markerEnd="url(#t555-arrow)" />
      <T x={309} y={42} size={6.5} tone="primary" weight={600}>t</T>
      <T x={306} y={102} size={6.5} tone="muted">t = 1.1RC</T>
    </g>
  )
}

export function Timer555Diagram(props: DiagramProps): JSX.Element {
  const isAstable = String(props.payload.mode ?? '') !== 'mono'
  const tag = (designator: string, key: string): string => {
    const raw = String(props.payload[key] ?? '').trim()
    return raw === '' ? designator : designator + ' ' + raw
  }
  const title = isAstable ? '无稳态多谐振荡器' : '单稳态触发器'
  const formula = isAstable ? 'f = 1.44/((RA+2RB)·C)，D = (RA+RB)/(RA+2RB)' : 't = 1.1·R·C'
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={title + ' 示意图'}>
        {arrowDefs()}
        {chip()}
        {commonWires()}
        {isAstable
          ? astableScene(tag('RA', 'ra'), tag('RB', 'rb'), tag('C', 'c'))
          : monoScene(tag('R', 'r'), tag('C', 'c'))}
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">{title + '：' + formula}</p>
    </div>
  )
}