// 滤波电路仿真（filter-sim）电路示意图：随表单 topology / sections 联动。
// 元件连接与 filter-sim.runner.ts 的 buildNetlist 严格一致（含级联顺序、半臂值、可选 Rs/RL）。
// 契约见 types.ts：payload 是当前表单值，select 以字符串存放（topology、sections）。
// 与并行任务的写入集隔离约定：本文件自带全套绘图辅助函数，不抽共享 primitives。
import type { ReactNode } from 'react'
import type { DiagramProps } from './types'

const SW = 1.4

/** 一段导线/元件轮廓；dashed 用于"可选元件"（Rs、RL） */
function W({ d, dashed = false }: { d: string; dashed?: boolean }): JSX.Element {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? '5 4' : undefined}
    />
  )
}

function Lbl({ x, y, text, size = 12, anchor = 'middle' }: { x: number; y: number; text: string; size?: number; anchor?: 'middle' | 'start' | 'end' }): JSX.Element {
  return (
    <text x={x} y={y} fontSize={size} fill="currentColor" textAnchor={anchor}>
      {text}
    </text>
  )
}

function Dot({ x, y }: { x: number; y: number }): JSX.Element {
  return <circle cx={x} cy={y} r={2.6} fill="currentColor" />
}

function Gnd({ x, y }: { x: number; y: number }): JSX.Element {
  return <W d={'M' + (x - 11) + ' ' + y + ' H' + (x + 11) + ' M' + (x - 7) + ' ' + (y + 5) + ' H' + (x + 7) + ' M' + (x - 3.5) + ' ' + (y + 10) + ' H' + (x + 3.5)} />
}

interface HSlot { x1: number; x2: number; y: number; label: string; dashed?: boolean }
interface VSlot { x: number; y1: number; y2: number; label: string; dashed?: boolean }

function HRes({ x1, x2, y, label, dashed }: HSlot): JSX.Element {
  const xm = Math.round((x1 + x2) / 2)
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x1 + ' ' + y + ' H' + (xm - 20) + ' l4 -8 l8 16 l8 -16 l8 16 l8 -16 l4 8 H' + x2} dashed={dashed} />
      <Lbl x={xm} y={y - 14} text={label} size={11} />
    </g>
  )
}

function HInd({ x1, x2, y, label, dashed }: HSlot): JSX.Element {
  const xm = Math.round((x1 + x2) / 2)
  const bump = ' a6.5 6.5 0 0 1 13 0'
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x1 + ' ' + y + ' H' + (xm - 26) + bump + bump + bump + bump + ' H' + x2} dashed={dashed} />
      <Lbl x={xm} y={y - 18} text={label} size={11} />
    </g>
  )
}

function HCap({ x1, x2, y, label, dashed }: HSlot): JSX.Element {
  const xm = Math.round((x1 + x2) / 2)
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x1 + ' ' + y + ' H' + (xm - 3.5) + ' M' + (xm + 3.5) + ' ' + y + ' H' + x2 + ' M' + (xm - 3.5) + ' ' + (y - 11) + ' V' + (y + 11) + ' M' + (xm + 3.5) + ' ' + (y - 11) + ' V' + (y + 11)} dashed={dashed} />
      <Lbl x={xm} y={y - 17} text={label} size={11} />
    </g>
  )
}

function VRes({ x, y1, y2, label, dashed }: VSlot): JSX.Element {
  const ym = Math.round((y1 + y2) / 2)
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x + ' ' + y1 + ' V' + (ym - 20) + ' l-8 5 l16 8 l-16 8 l16 8 l-8 5 V' + y2} dashed={dashed} />
      <Lbl x={x + 14} y={ym + 4} text={label} size={11} anchor="start" />
    </g>
  )
}

function VCap({ x, y1, y2, label, dashed }: VSlot): JSX.Element {
  const ym = Math.round((y1 + y2) / 2)
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x + ' ' + y1 + ' V' + (ym - 3.5) + ' M' + x + ' ' + (ym + 3.5) + ' V' + y2 + ' M' + (x - 12) + ' ' + (ym - 3.5) + ' H' + (x + 12) + ' M' + (x - 12) + ' ' + (ym + 3.5) + ' H' + (x + 12)} dashed={dashed} />
      <Lbl x={x + 16} y={ym + 4} text={label} size={11} anchor="start" />
    </g>
  )
}

/** 信号源：圆圈 + 正弦，底端落地，右端引出 33px 导线 */
function Src({ x, y, gy, label = 'Vin' }: { x: number; y: number; gy: number; label?: string }): JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r={13} fill="none" stroke="currentColor" strokeWidth={SW} />
      <W d={'M' + (x - 7) + ' ' + y + ' q3.5 -7 7 0 t7 0'} />
      <W d={'M' + (x + 13) + ' ' + y + ' H' + (x + 33)} />
      <W d={'M' + x + ' ' + (y + 13) + ' V' + gy} />
      <Gnd x={x} y={gy} />
      <Lbl x={x} y={y - 20} text={label} size={11} />
    </g>
  )
}

function Out({ x, y, label = 'Vout' }: { x: number; y: number; label?: string }): JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r={3} fill="currentColor" />
      <Lbl x={x} y={y - 11} text={label} size={11} />
    </g>
  )
}

/** 单位增益缓冲级（梯形网络里的隔离运放），输出顶点在 x+30 */
function Buf({ x, y, label }: { x: number; y: number; label?: string }): JSX.Element {
  return (
    <g>
      <path d={'M' + x + ' ' + (y - 16) + ' L' + x + ' ' + (y + 16) + ' L' + (x + 30) + ' ' + y + ' Z'} fill="none" stroke="currentColor" strokeWidth={SW} strokeLinejoin="round" />
      <Lbl x={x + 11} y={y + 4} text="+" size={10} />
      {label ? <Lbl x={x + 15} y={y + 32} text={label} size={10} /> : null}
    </g>
  )
}

function Figure({ viewBox, caption, children }: { viewBox: string; caption: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex w-full flex-col items-center">
      <svg viewBox={viewBox} className="h-auto max-h-[220px] w-full" role="img" aria-label={caption}>
        {children}
      </svg>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{caption}</p>
    </div>
  )
}

/** rc-lowpass / rc-highpass：单级 + 末端可选 RL（与网表一致，RL 与输出臂并联） */
function RcSimFigure({ lp }: { lp: boolean }): JSX.Element {
  const y = 44
  const node = 198
  return (
    <Figure
      viewBox="0 0 470 140"
      caption={lp
        ? 'RC 一阶低通：串 R 并 C，输出取 C 两端；fc = 1/(2π·R·C)；虚线 RL 为可选负载，并入输出端会改变实际截止'
        : 'RC 一阶高通：串 C 并 R，输出取 R 两端；fc = 1/(2π·R·C)；虚线 RL 为可选负载，与 R 并联后一起决定实际截止'}
    >
      <Src x={24} y={y} gy={108} />
      {lp ? <HRes x1={57} x2={149} y={y} label="R" /> : <HCap x1={57} x2={149} y={y} label="C" />}
      <W d={'M149 ' + y + ' H' + node} />
      <W d={'M' + node + ' ' + y + ' V62'} />
      <Dot x={node} y={y} />
      {lp ? <VCap x={node} y1={62} y2={96} label="C" /> : <VRes x={node} y1={62} y2={96} label="R" />}
      <W d={'M' + node + ' 96 V100'} />
      <Gnd x={node} y={100} />
      <W d={'M' + node + ' ' + y + ' H330'} />
      <W d={'M330 ' + y + ' V62'} dashed />
      <VRes x={330} y1={62} y2={96} label="RL（可选）" dashed />
      <W d="M330 96 V100" dashed />
      <Gnd x={330} y={100} />
      <W d={'M330 ' + y + ' H404'} />
      <Out x={407} y={y} />
    </Figure>
  )
}

/** rc-bandpass：HP(C·R) 直接级联 LP(R2·C2)，与网表节点顺序一致 */
function RcBandpassFigure(): JSX.Element {
  const y = 44
  return (
    <Figure viewBox="0 0 470 140" caption="RC 带通 = 高通(C·R) 直接级联 低通(R2·C2)：fH = 1/(2π·R·C)、fL = 1/(2π·R2·C2)；无缓冲级联存在级间加载，通带以仿真结果为准">
      <Src x={20} y={y} gy={108} />
      <HCap x1={53} x2={133} y={y} label="C" />
      <W d={'M133 ' + y + ' H170'} />
      <W d={'M170 ' + y + ' V62'} />
      <Dot x={170} y={y} />
      <VRes x={170} y1={62} y2={96} label="R" />
      <W d="M170 96 V100" />
      <Gnd x={170} y={100} />
      <W d={'M170 ' + y + ' H200'} />
      <HRes x1={200} x2={280} y={y} label="R2" />
      <W d={'M280 ' + y + ' H320'} />
      <W d={'M320 ' + y + ' V62'} />
      <Dot x={320} y={y} />
      <VCap x={320} y1={62} y2={96} label="C2" />
      <W d="M320 96 V100" />
      <Gnd x={320} y={100} />
      <W d={'M320 ' + y + ' H392'} />
      <Out x={395} y={y} />
    </Figure>
  )
}

/** rc-ladder：N 级「串 R 并 C + 缓冲」，中间用省略号 */
function RcLadderFigure({ n }: { n: number }): JSX.Element {
  const y = 56
  return (
    <Figure viewBox="0 0 470 150" caption={'N 级「串 R 并 C + 单位增益缓冲」低通，级间互不加载：每级 fc = 1/(2π·R·C)。当前级数 = ' + n + '（中间节省略）'}>
      <Src x={18} y={y} gy={120} />
      <HRes x1={51} x2={121} y={y} label="R" />
      <W d={'M121 ' + y + ' H150'} />
      <W d={'M150 ' + y + ' V70'} />
      <Dot x={150} y={y} />
      <VCap x={150} y1={70} y2={100} label="C" />
      <W d="M150 100 V106" />
      <Gnd x={150} y={106} />
      <W d={'M150 ' + y + ' H166'} />
      <Buf x={166} y={y} label="缓冲" />
      <W d="M196 56 H212" />
      <Lbl x={232} y={61} text="⋯" size={18} />
      <W d="M252 56 H268" />
      <HRes x1={268} x2={338} y={y} label="R" />
      <W d={'M338 ' + y + ' H366'} />
      <W d={'M366 ' + y + ' V70'} />
      <Dot x={366} y={y} />
      <VCap x={366} y1={70} y2={100} label="C" />
      <W d="M366 100 V106" />
      <Gnd x={366} y={106} />
      <W d={'M366 ' + y + ' H382'} />
      <Buf x={382} y={y} />
      <W d="M412 56 H430" />
      <Out x={433} y={y} />
    </Figure>
  )
}

/** lc-ladder：N 节「串 L 并 C」无源梯形 + 可选 Rs/RL */
function LcLadderFigure({ n }: { n: number }): JSX.Element {
  const y = 52
  return (
    <Figure viewBox="0 0 500 140" caption={'无源 LC 低通：每节串 L 并 C，共 ' + n + ' 节（中间节省略）；常数 k 估算 fc = 1/(π·√(L·C))；虚线 Rs/RL 为可选源内阻与负载，会明显改变实际响应'}>
      <Src x={16} y={y} gy={116} />
      <HRes x1={49} x2={119} y={y} label="Rs（可选）" dashed />
      <W d={'M119 ' + y + ' H140'} />
      <HInd x1={140} x2={200} y={y} label="L" />
      <W d={'M200 ' + y + ' H230'} />
      <W d={'M230 ' + y + ' V68'} />
      <Dot x={230} y={y} />
      <VCap x={230} y1={68} y2={102} label="C" />
      <W d="M230 102 V108" />
      <Gnd x={230} y={108} />
      <Lbl x={262} y={57} text="⋯" size={18} />
      <W d="M284 52 H304" />
      <HInd x1={304} x2={364} y={y} label="L" />
      <W d={'M364 ' + y + ' H392'} />
      <W d={'M392 ' + y + ' V68'} />
      <Dot x={392} y={y} />
      <VCap x={392} y1={68} y2={102} label="C" />
      <W d="M392 102 V108" />
      <Gnd x={392} y={108} />
      <W d={'M392 ' + y + ' H440'} />
      <W d={'M440 ' + y + ' V68'} dashed />
      <VRes x={440} y1={68} y2={102} label="RL（可选）" dashed />
      <W d="M440 102 V108" dashed />
      <Gnd x={440} y={108} />
      <W d={'M440 ' + y + ' H470'} />
      <Out x={473} y={y} />
    </Figure>
  )
}

/** pi-lowpass：并臂 C/2 + 串臂 L + 并臂 C/2（与网表的 c/2、l、c/2 一致） */
function PiLowpassFigure(): JSX.Element {
  const y = 52
  return (
    <Figure viewBox="0 0 500 140" caption="π 型低通：两并臂各 C/2、串臂 L；常数 k 估算 fc = 1/(π·√(L·C))；虚线 Rs/RL 为可选源内阻与负载">
      <Src x={16} y={y} gy={116} />
      <HRes x1={49} x2={119} y={y} label="Rs（可选）" dashed />
      <W d={'M119 ' + y + ' H130'} />
      <W d={'M130 ' + y + ' V68'} />
      <Dot x={130} y={y} />
      <VCap x={130} y1={68} y2={102} label="C/2" />
      <W d="M130 102 V108" />
      <Gnd x={130} y={108} />
      <W d={'M130 ' + y + ' H160'} />
      <HInd x1={160} x2={230} y={y} label="L" />
      <W d={'M230 ' + y + ' H270'} />
      <W d={'M270 ' + y + ' V68'} />
      <Dot x={270} y={y} />
      <VCap x={270} y1={68} y2={102} label="C/2" />
      <W d="M270 102 V108" />
      <Gnd x={270} y={108} />
      <W d={'M270 ' + y + ' H340'} />
      <W d={'M340 ' + y + ' V68'} dashed />
      <VRes x={340} y1={68} y2={102} label="RL（可选）" dashed />
      <W d="M340 102 V108" dashed />
      <Gnd x={340} y={108} />
      <W d={'M340 ' + y + ' H432'} />
      <Out x={435} y={y} />
    </Figure>
  )
}

/** t-lowpass：串臂 L/2 + 并臂 C + 串臂 L/2（与网表的 l/2、c、l/2 一致） */
function TLowpassFigure(): JSX.Element {
  const y = 52
  return (
    <Figure viewBox="0 0 500 140" caption="T 型低通：两串臂各 L/2、中并臂 C；常数 k 估算 fc = 1/(π·√(L·C))；虚线 Rs/RL 为可选源内阻与负载">
      <Src x={16} y={y} gy={116} />
      <HRes x1={49} x2={119} y={y} label="Rs（可选）" dashed />
      <W d={'M119 ' + y + ' H140'} />
      <HInd x1={140} x2={200} y={y} label="L/2" />
      <W d={'M200 ' + y + ' H230'} />
      <W d={'M230 ' + y + ' V68'} />
      <Dot x={230} y={y} />
      <VCap x={230} y1={68} y2={102} label="C" />
      <W d="M230 102 V108" />
      <Gnd x={230} y={108} />
      <W d={'M230 ' + y + ' H260'} />
      <HInd x1={260} x2={320} y={y} label="L/2" />
      <W d={'M320 ' + y + ' H360'} />
      <W d={'M360 ' + y + ' V68'} dashed />
      <VRes x={360} y1={68} y2={102} label="RL（可选）" dashed />
      <W d="M360 102 V108" dashed />
      <Gnd x={360} y={108} />
      <W d={'M360 ' + y + ' H432'} />
      <Out x={435} y={y} />
    </Figure>
  )
}

/** sallen-lowpass：单位增益 Sallen-Key（网表 R→R2→同相端，C 反馈自 Vout，C2 接地） */
function SallenFigure(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 185" caption="Sallen-Key 二阶低通（单位增益）：fc = 1/(2π·√(R·R2·C·C2))；C 从 R·R2 中间节点反馈到 Vout，C2 接在同相端与地之间">
      <Src x={24} y={90} gy={170} />
      <HRes x1={60} x2={142} y={90} label="R" />
      <W d={'M142 90 H186'} />
      <Dot x={170} y={90} />
      <W d={'M170 90 V30'} />
      <W d={'M170 30 H190'} />
      <HCap x1={190} x2={330} y={30} label="C" />
      <W d={'M330 30 H392'} />
      <W d={'M392 30 V90'} />
      <HRes x1={186} x2={266} y={90} label="R2" />
      <W d={'M266 90 H292'} />
      <Dot x={292} y={90} />
      <W d={'M292 90 V78 H310'} />
      <W d={'M292 90 V112'} />
      <VCap x={292} y1={112} y2={146} label="C2" />
      <W d={'M292 146 V152'} />
      <Gnd x={292} y={152} />
      <path d="M310 62 L310 118 L360 90 Z" fill="none" stroke="currentColor" strokeWidth={SW} strokeLinejoin="round" />
      <Lbl x={320} y={83} text="+" size={11} />
      <Lbl x={320} y={108} text="-" size={11} />
      <W d={'M310 102 V120 H378 V90'} />
      <W d={'M360 90 H420'} />
      <Dot x={378} y={90} />
      <Dot x={392} y={90} />
      <Out x={423} y={90} />
    </Figure>
  )
}

/** twin-notch：双 T（上路 R·R+2C，下路 C·C+R/2），输出端固定挂 RL（网表缺省 100R） */
function TwinNotchFigure(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 225" caption="双 T 陷波（带阻）：上路两串 R、中点并 2C；下路两串 C、中点并 R/2；两 T 并在 Vin 与 Vout 之间，RL 为输出负载（缺省按 100·R 估算）。f0 = 1/(2π·R·C)">
      <Lbl x={118} y={44} text="R·R + 2C 支路" size={11} />
      <Lbl x={118} y={190} text="C·C + R/2 支路" size={11} />
      <Src x={20} y={105} gy={140} />
      <W d={'M48 60 V150'} />
      <Dot x={48} y={105} />
      <W d={'M48 60 H60'} />
      <HRes x1={60} x2={140} y={60} label="R" />
      <W d={'M140 60 H168'} />
      <HRes x1={168} x2={248} y={60} label="R" />
      <W d={'M248 60 H300'} />
      <Dot x={168} y={60} />
      <W d={'M168 60 V80'} />
      <VCap x={168} y1={80} y2={112} label="2C" />
      <W d={'M168 112 V116'} />
      <Gnd x={168} y={116} />
      <W d={'M48 150 H60'} />
      <HCap x1={60} x2={140} y={150} label="C" />
      <W d={'M140 150 H168'} />
      <HCap x1={168} x2={248} y={150} label="C" />
      <W d={'M248 150 H300'} />
      <Dot x={168} y={150} />
      <W d={'M168 150 V172'} />
      <VRes x={168} y1={172} y2={206} label="R/2" />
      <W d={'M168 206 V210'} />
      <Gnd x={168} y={210} />
      <W d={'M300 60 V150'} />
      <W d={'M300 105 H356'} />
      <Dot x={300} y={105} />
      <W d={'M356 105 V125'} />
      <VRes x={356} y1={125} y2={169} label="RL" />
      <W d={'M356 169 V173'} />
      <Gnd x={356} y={173} />
      <W d={'M356 105 H404'} />
      <Out x={407} y={105} />
    </Figure>
  )
}

export function FilterSimDiagram({ payload }: DiagramProps): JSX.Element | null {
  const topology = String(payload.topology ?? 'rc-lowpass')
  const n = Number(payload.sections) || 2
  switch (topology) {
    case 'rc-lowpass':
      return <RcSimFigure lp />
    case 'rc-highpass':
      return <RcSimFigure lp={false} />
    case 'rc-bandpass':
      return <RcBandpassFigure />
    case 'rc-ladder':
      return <RcLadderFigure n={n} />
    case 'lc-ladder':
      return <LcLadderFigure n={n} />
    case 'pi-lowpass':
      return <PiLowpassFigure />
    case 't-lowpass':
      return <TLowpassFigure />
    case 'sallen-lowpass':
      return <SallenFigure />
    case 'twin-notch':
      return <TwinNotchFigure />
    default:
      return null
  }
}
