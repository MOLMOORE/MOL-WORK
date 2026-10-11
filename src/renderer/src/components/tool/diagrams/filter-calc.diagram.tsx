// 滤波电路速算（filter-calc）电路示意图：随表单 mode / topo / kind 联动。
// 契约见 types.ts：payload 是当前表单值，select 以字符串存放（mode、topo、kind、n）。
// 与并行任务的写入集隔离约定：本文件自带全套绘图辅助函数，不抽共享 primitives。
import type { ReactNode } from 'react'
import type { DiagramProps } from './types'

const SW = 1.4

/** 一段导线/元件轮廓；dashed 用于"可选元件"（Rs、RL 等） */
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

function VInd({ x, y1, y2, label, dashed }: VSlot): JSX.Element {
  const ym = Math.round((y1 + y2) / 2)
  const bump = ' a6.5 6.5 0 0 1 0 13'
  return (
    <g opacity={dashed ? 0.55 : 1}>
      <W d={'M' + x + ' ' + y1 + ' V' + (ym - 26) + bump + bump + bump + bump + ' V' + y2} dashed={dashed} />
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

/** rc 模式：一阶低通 / 高通并排，各自完整回路 */
function RcCell({ lp, dx }: { lp: boolean; dx: number }): JSX.Element {
  const y = 52
  const node = 208
  return (
    <g transform={'translate(' + dx + ' 0)'}>
      <Lbl x={132} y={16} text={lp ? '低通：串 R 并 C，输出取 C' : '高通：串 C 并 R，输出取 R'} size={12} />
      <Src x={26} y={y} gy={116} />
      {lp ? <HRes x1={59} x2={151} y={y} label="R" /> : <HCap x1={59} x2={151} y={y} label="C" />}
      <W d={'M151 ' + y + ' H' + node} />
      <W d={'M' + node + ' ' + y + ' V70'} />
      <Dot x={node} y={y} />
      {lp ? <VCap x={node} y1={70} y2={104} label="C" /> : <VRes x={node} y1={70} y2={104} label="R" />}
      <W d={'M' + node + ' 104 V116'} />
      <Gnd x={node} y={116} />
      <W d={'M' + node + ' ' + y + ' H247'} />
      <Out x={250} y={y} />
    </g>
  )
}

/** lc 模式的单节结构（局部坐标 0..330 × 0..106），供主图与缩略图复用 */
function LcCell({ topo }: { topo: 'l' | 't' | 'pi' }): JSX.Element {
  const y = 40
  const slot = { y1: 58, y2: 92, gy: 96 }
  if (topo === 'l') {
    return (
      <g>
        <Src x={22} y={y} gy={slot.gy} />
        <HInd x1={55} x2={145} y={y} label="L" />
        <W d={'M145 ' + y + ' H215'} />
        <W d={'M215 ' + y + ' V' + slot.y1} />
        <Dot x={215} y={y} />
        <VCap x={215} y1={slot.y1} y2={slot.y2} label="C" />
        <W d={'M215 ' + slot.y2 + ' V' + slot.gy} />
        <Gnd x={215} y={slot.gy} />
        <W d={'M215 ' + y + ' H272'} />
        <Out x={275} y={y} />
      </g>
    )
  }
  if (topo === 't') {
    return (
      <g>
        <Src x={22} y={y} gy={slot.gy} />
        <HInd x1={55} x2={115} y={y} label="L/2" />
        <W d={'M115 ' + y + ' H145'} />
        <W d={'M145 ' + y + ' V' + slot.y1} />
        <Dot x={145} y={y} />
        <VCap x={145} y1={slot.y1} y2={slot.y2} label="C" />
        <W d={'M145 ' + slot.y2 + ' V' + slot.gy} />
        <Gnd x={145} y={slot.gy} />
        <W d={'M145 ' + y + ' H175'} />
        <HInd x1={175} x2={235} y={y} label="L/2" />
        <W d={'M235 ' + y + ' H287'} />
        <Out x={290} y={y} />
      </g>
    )
  }
  return (
    <g>
      <Src x={22} y={y} gy={slot.gy} />
      <W d={'M55 ' + y + ' H105'} />
      <W d={'M105 ' + y + ' V' + slot.y1} />
      <Dot x={105} y={y} />
      <VCap x={105} y1={slot.y1} y2={slot.y2} label="C/2" />
      <W d={'M105 ' + slot.y2 + ' V' + slot.gy} />
      <Gnd x={105} y={slot.gy} />
      <W d={'M105 ' + y + ' H135'} />
      <HInd x1={135} x2={215} y={y} label="L" />
      <W d={'M215 ' + y + ' H265'} />
      <W d={'M265 ' + y + ' V' + slot.y1} />
      <Dot x={265} y={y} />
      <VCap x={265} y1={slot.y1} y2={slot.y2} label="C/2" />
      <W d={'M265 ' + slot.y2 + ' V' + slot.gy} />
      <Gnd x={265} y={slot.gy} />
      <W d={'M265 ' + y + ' H317'} />
      <Out x={320} y={y} />
    </g>
  )
}

const LC_NAMES: Record<'l' | 't' | 'pi', string> = { l: 'L 型', t: 'T 型', pi: 'π 型' }

/** lc 模式：主图画当前 topo，下方三格缩略图高亮当前选择、其余淡化 */
function LcDiagram({ topo }: { topo: 'l' | 't' | 'pi' }): JSX.Element {
  return (
    <Figure viewBox="0 0 470 210" caption={'常数 k 无源 LC 低通（当前：' + LC_NAMES[topo] + '）：fc = 1/(π·√(L·C))；T 型两串臂各 L/2，π 型两并臂各 C/2'}>
      <g transform="translate(50 12)">
        {<LcCell topo={topo} />}
      </g>
      <Lbl x={235} y={138} text="三种结构（高亮 = 当前所选）" size={11} />
      {(['l', 't', 'pi'] as const).map((kind, i) => (
        <g
          key={kind}
          transform={'translate(' + (14 + i * 152) + ' 176) scale(0.32)'}
          className={kind === topo ? 'text-primary' : 'text-muted-foreground'}
          opacity={kind === topo ? 1 : 0.4}
        >
          {<LcCell topo={kind} />}
          <Lbl x={140} y={122} text={LC_NAMES[kind]} size={28} />
        </g>
      ))}
    </Figure>
  )
}

/** 二阶 Sallen-Key 单位增益低通（与 filter-sim 网表同构：R→R2→同相端，C 反馈自 Vout，C2 接地） */
function SallenDiagram(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 185" caption="单位增益 Sallen-Key 二阶低通：fc = 1/(2π·√(R·R2·C·C2))，Q = √(R·R2·C·C2)/(C·(R+R2))">
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

/** 双 T 陷波（与 filter-sim 网表同构：上路 R-R 中点 2C，下路 C-C 中点 R/2，输出挂 RL） */
function TwinDiagram(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 225" caption="双 T 陷波（带阻）：上路两串 R、中点并 2C；下路两串 C、中点并 R/2；两 T 并在 Vin 与 Vout 之间，RL 为负载。f0 = 1/(2π·R·C)">
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

/** resonant 模式：随 kind 切换串联 / 并联谐振回路 */
function ResonantDiagram({ kind }: { kind: 'series' | 'parallel' }): JSX.Element {
  if (kind === 'series') {
    return (
      <Figure viewBox="0 0 470 160" caption="串联谐振回路：f0 = 1/(2π·√(L·C))，ρ = √(L/C)，Q = ρ/R = ω0L/R，BW = f0/Q（R 为损耗电阻，越小 Q 越高）">
        <Src x={26} y={55} gy={120} />
        <HInd x1={59} x2={149} y={55} label="L" />
        <W d={'M149 55 H179'} />
        <HCap x1={179} x2={259} y={55} label="C" />
        <W d={'M259 55 H289'} />
        <HRes x1={289} x2={369} y={55} label="R" />
        <W d={'M369 55 H400 V120'} />
        <Gnd x={400} y={120} />
        <Lbl x={230} y={102} text="回路电流处处相同" size={11} />
      </Figure>
    )
  }
  return (
    <Figure viewBox="0 0 470 178" caption="并联谐振回路：f0 = 1/(2π·√(L·C))，ρ = √(L/C)，Q = R/ρ，BW = f0/Q（R 为负载/损耗电阻，越大 Q 越高；输出取自回路两端）">
      <Src x={26} y={52} gy={148} />
      <W d={'M59 52 H300'} />
      <W d={'M110 52 V70'} />
      <Dot x={110} y={52} />
      <VInd x={110} y1={70} y2={130} label="L" />
      <W d={'M110 130 V134'} />
      <Gnd x={110} y={134} />
      <W d={'M190 52 V70'} />
      <Dot x={190} y={52} />
      <VCap x={190} y1={70} y2={130} label="C" />
      <W d={'M190 130 V134'} />
      <Gnd x={190} y={134} />
      <W d={'M270 52 V70'} />
      <Dot x={270} y={52} />
      <VRes x={270} y1={70} y2={130} label="R" />
      <W d={'M270 130 V134'} />
      <Gnd x={270} y={134} />
      <W d={'M300 52 H340'} />
      <Out x={343} y={52} />
    </Figure>
  )
}

/** rolloff 模式：巴特沃斯 n 阶滚降的 Bode 折线概念图 */
function RolloffDiagram({ n }: { n: number }): JSX.Element {
  const xFc = 230
  const yFlat = 90
  const yEnd = Math.min(158, yFlat + 11 * n)
  return (
    <Figure viewBox="0 0 470 190" caption={'n 阶巴特沃斯滚降：|H|(dB) = 10·log10(1+(f/fc)^(2n))；折线近似为 fc 之前平坦、之后 ' + 20 * n + ' dB/十倍频程下降（当前 n = ' + n + '）'}>
      <W d="M64 22 V160 H442" />
      <Lbl x={56} y={28} text="dB" anchor="end" size={11} />
      <Lbl x={438} y={176} text="lg f" anchor="end" size={11} />
      <Lbl x={70} y={84} text="0 dB" anchor="start" size={10} />
      <W dashed d={'M64 ' + yFlat + ' H430'} />
      <W d={'M64 ' + yFlat + ' H' + xFc} />
      <W d={'M' + xFc + ' ' + yFlat + ' L405 ' + yEnd} />
      <W dashed d={'M' + xFc + ' ' + yFlat + ' V160'} />
      <Lbl x={xFc} y={176} text="fc" size={11} />
      <Lbl x={306} y={Math.round((yFlat + yEnd) / 2) - 8} text={'-' + 20 * n + ' dB/十倍频程'} anchor="start" size={11} />
    </Figure>
  )
}

/** reactance 模式：L 与 C 的阻抗示意 */
function ReactanceDiagram(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 150" caption="同一频率 f 下：XL = 2π·f·L 随 f、L 增大；XC = 1/(2π·f·C) 随 f、C 增大而减小；L、C 串联时净电抗 |XL - XC| 在 f0 = 1/(2π√(LC)) 处为 0（谐振）">
      <g>
        <Src x={24} y={56} gy={118} />
        <HInd x1={57} x2={147} y={56} label="L" />
        <W d="M147 56 H200 V118" />
        <Gnd x={200} y={118} />
        <Lbl x={110} y={104} text="XL = 2π·f·L" size={12} />
      </g>
      <g transform="translate(240 0)">
        <Src x={24} y={56} gy={118} />
        <HCap x1={57} x2={147} y={56} label="C" />
        <W d="M147 56 H200 V118" />
        <Gnd x={200} y={118} />
        <Lbl x={110} y={104} text="XC = 1/(2π·f·C)" size={12} />
      </g>
    </Figure>
  )
}

/** db 模式：两级波形幅度对比 + dB 标注 */
function DbDiagram(): JSX.Element {
  return (
    <Figure viewBox="0 0 470 172" caption="电压比 G = 20·log10(V1/V2) dB；功率比 10·log10(P1/P2)；0 dBm = 1 mW，配合 R 可换算出有效值电压">
      <Lbl x={288} y={60} text="V1" anchor="start" size={12} />
      <Lbl x={288} y={132} text="V2" anchor="start" size={12} />
      <W d="M46 56 q16 -28 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0" />
      <W dashed d="M46 28 H282" />
      <W dashed d="M46 84 H282" />
      <W d="M46 128 q16 -13 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0" />
      <W dashed d="M46 115 H282" />
      <W dashed d="M46 141 H282" />
      <rect x={322} y={62} width={132} height={48} rx={8} fill="none" stroke="currentColor" strokeWidth={1.2} />
      <Lbl x={388} y={82} text="G = 20·log(V1/V2)" size={12} />
      <Lbl x={388} y={100} text="单位：dB" size={11} />
    </Figure>
  )
}

export function FilterCalcDiagram({ payload }: DiagramProps): JSX.Element | null {
  const mode = String(payload.mode ?? 'rc')
  switch (mode) {
    case 'rc':
      return (
        <Figure viewBox="0 0 520 136" caption="一阶 RC：低通串 R 并 C 取 C 上电压，高通串 C 并 R 取 R 上电压；两者截止频率同为 fc = 1/(2π·R·C)">
          {<RcCell lp dx={0} />}
          {<RcCell lp={false} dx={265} />}
        </Figure>
      )
    case 'lc': {
      const raw = String(payload.topo ?? 'l')
      const topo: 'l' | 't' | 'pi' = raw === 't' || raw === 'pi' ? raw : 'l'
      return <LcDiagram topo={topo} />
    }
    case 'sallen':
      return <SallenDiagram />
    case 'twin':
      return <TwinDiagram />
    case 'resonant':
      return <ResonantDiagram kind={String(payload.kind ?? 'series') === 'parallel' ? 'parallel' : 'series'} />
    case 'rolloff':
      return <RolloffDiagram n={Number(payload.n) || 2} />
    case 'reactance':
      return <ReactanceDiagram />
    case 'db':
      return <DbDiagram />
    default:
      return null
  }
}
