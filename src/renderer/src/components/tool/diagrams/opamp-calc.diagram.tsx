// opamp-calc 配图：5 种计算模式各一张对应的原理/特性示意图，随表单 payload.mode 联动。
// 位号与 opamp-calc.runner.ts 的字段一致：Rf（反馈/上臂 R1）、Rg（对地或输入/下臂 R2）、Vref、VOH/VOL、Ui/Uo。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary）。

import type { DiagramProps } from './types'

const W = 320
const H = 200

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

/** 运放三角形：cx/cy 为几何中心，输入在左边 ±9，输出在右顶点 */
function opamp(cx: number, cy: number): JSX.Element {
  const w = 42
  const h = 36
  return (
    <g>
      <path d={'M ' + (cx - w / 2) + ' ' + (cy - h / 2) + ' L ' + (cx - w / 2) + ' ' + (cy + h / 2) + ' L ' + (cx + w / 2) + ' ' + cy + ' Z'} />
      <T x={cx - w / 2 + 7} y={cy - h / 4 + 3} size={8} weight={600}>−</T>
      <T x={cx - w / 2 + 7} y={cy + h / 4 + 3} size={8} weight={600}>+</T>
    </g>
  )
}

/** 正弦曲线折线近似 */
function sinePath(x0: number, x1: number, yc: number, amp: number, cycles: number): string {
  const steps = Math.max(24, Math.round((x1 - x0) / 3))
  const pts: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = yc - amp * Math.sin((i / steps) * cycles * Math.PI * 2)
    pts.push(x.toFixed(1) + ' ' + y.toFixed(1))
  }
  return 'M ' + pts[0] + ' L ' + pts.slice(1).join(' L ')
}

function arrowDefs(): JSX.Element {
  return (
    <defs>
      <marker id="oc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

const mutedDash = { stroke: 'currentColor', strokeWidth: 0.8, strokeDasharray: '2 5' } as const

interface Scene {
  title: string
  formula: string
  render: () => JSX.Element
}

const SCENES: Record<string, Scene> = {
  gain: {
    title: '反相 / 同相增益与电阻',
    formula: '同相 A = 1 + Rf/Rg；反相 A = −Rf/Rg（Rf 接输出到反相端，Rg 对地或串在输入）',
    render: () => (
      <g>
        <g>
          {opamp(105, 78)}
          <path d="M18 69 H30" />
          {resistorH(30, 80, 69)}
          <path d="M80 69 H84" />
          {dot(80, 69)}
          <path d="M80 69 V30" />
          {resistorH(80, 140, 30)}
          <path d="M140 30 H160 V78" />
          <path d="M126 78 H166" />
          {dot(160, 78)}
          <path d="M84 87 V104" />
          {gnd(84, 104)}
          <T x={18} y={62} anchor="start" size={8.5}>Ui</T>
          <T x={55} y={87} size={8.5}>Rg</T>
          <T x={110} y={22} size={8.5}>Rf</T>
          <T x={168} y={73} anchor="start" size={8.5} tone="primary">Uo</T>
          <T x={95} y={150} size={8.5} tone="primary">反相 A = −Rf/Rg</T>
        </g>
        <g>
          {opamp(255, 78)}
          <path d="M190 87 H234" />
          <path d="M225 30 V69" />
          {dot(225, 69)}
          <path d="M225 69 H234" />
          {resistorV(225, 69, 114)}
          <path d="M225 114 V120" />
          {gnd(225, 120)}
          {resistorH(225, 298, 30)}
          <path d="M276 78 H310" />
          {dot(298, 78)}
          <path d="M298 78 V30" />
          <T x={190} y={80} anchor="start" size={8.5}>Ui</T>
          <T x={236} y={100} anchor="start" size={8.5}>Rg</T>
          <T x={261} y={22} size={8.5}>Rf</T>
          <T x={304} y={70} anchor="start" size={8.5} tone="primary">Uo</T>
          <T x={248} y={150} anchor="middle" size={8.5} tone="primary">同相 A = 1 + Rf/Rg</T>
        </g>
      </g>
    )
  },
  gbw: {
    title: '增益带宽积与闭环带宽',
    formula: '闭环 −3 dB 带宽 = GBW / Acl（Acl 取噪声增益）',
    render: () => (
      <g>
        <path d="M40 168 H302" />
        <path d="M40 168 V28" />
        <path d="M110 168 V172 M170 168 V172 M230 168 V172 M290 168 V172" className="text-muted-foreground" stroke="currentColor" strokeWidth={1} />
        <T x={40} y={22} size={8} tone="muted">增益 (dB)</T>
        <T x={304} y={171} anchor="start" size={8} tone="muted">f</T>
        <path d="M55 40 H95 L275 158" />
        <T x={266} y={131} anchor="start" size={8} tone="muted">开环</T>
        <g className="text-primary" stroke="currentColor" strokeWidth={1.6}>
          <path d="M45 105 H205" />
        </g>
        <T x={48} y={99} anchor="start" size={8} tone="primary">闭环增益 Acl</T>
        {dot(194, 105)}
        <g className="text-muted-foreground" {...mutedDash}>
          <path d="M194 105 V168" strokeDasharray="4 3" />
        </g>
        <T x={194} y={182} size={8} tone="muted">f(-3dB)</T>
        <T x={296} y={38} anchor="end" size={8.5} tone="primary">GBW = Acl × f(-3dB)</T>
      </g>
    )
  },
  slew: {
    title: '压摆率与满功率带宽',
    formula: '需要 SR ≥ 2π·f·Vp（按 V/µs 时 f、Vp 用 MHz 与 V 组合）；FPBW = SR / (2π·Vp)',
    render: () => (
      <g>
        <g className="text-muted-foreground" {...mutedDash}>
          <path d="M55 60 H295" />
          <path d="M55 118 H295" />
          <path d="M55 168 H295" />
        </g>
        <path d={sinePath(55, 295, 60, 26, 3)} />
        <T x={48} y={44} anchor="end" size={8} tone="muted">输入 Ui</T>
        <g className="text-primary" stroke="currentColor" strokeWidth={1.6}>
          <path d="M55 168 L92 118 L129 168 L166 118 L203 168 L240 118 L277 168" />
        </g>
        <T x={48} y={110} anchor="end" size={8} tone="muted">输出 Uo</T>
        <T x={48} y={121} anchor="end" size={8}>Vp</T>
        <T x={48} y={171} anchor="end" size={8}>−Vp</T>
        <T x={160} y={194} size={8} tone="muted">SR 不足时正弦顶部被线性斜坡取代（趋近三角波）</T>
      </g>
    )
  },
  hysteresis: {
    title: '迟滞比较器阈值',
    formula: 'VTH/VTL = Rg/(Rf+Rg)·(VOH/VOL) + Rf/(Rf+Rg)·Vref；回差 = Rg/(Rf+Rg)·(VOH − VOL)',
    render: () => (
      <g>
        {opamp(100, 88)}
        <path d="M20 79 H79" />
        <path d="M121 88 H166" />
        {dot(150, 88)}
        <path d="M150 88 V30" />
        {resistorH(90, 150, 30)}
        <path d="M90 30 H58 V97 H79" />
        {dot(58, 97)}
        {dot(70, 97)}
        <path d="M70 97 V108" />
        {resistorV(70, 108, 146)}
        <path d="M70 146 V150" />
        <circle cx={70} cy={154} r={3.5} />
        <T x={20} y={72} anchor="start" size={8.5}>Ui</T>
        <T x={120} y={22} anchor="middle" size={8.5}>Rf</T>
        <T x={80} y={130} anchor="start" size={8.5}>Rg</T>
        <T x={70} y={168} anchor="middle" size={8} tone="muted">Vref</T>
        <T x={169} y={85} anchor="start" size={8.5} tone="primary">Uo</T>
        <T x={169} y={72} anchor="start" size={7.5} tone="muted">VOH/VOL</T>
        <path d="M208 152 V40 M208 152 H304" />
        <T x={208} y={34} anchor="middle" size={8} tone="muted">Uo</T>
        <T x={300} y={165} anchor="end" size={8} tone="muted">Ui</T>
        <path d="M214 142 H254 V62 H296" markerEnd="url(#oc-arrow)" />
        <path d="M296 62 H272 V142 H236" markerEnd="url(#oc-arrow)" strokeDasharray="4 3" className="text-muted-foreground" stroke="currentColor" />
        <line x1={222} y1={142} x2={238} y2={142} markerEnd="url(#oc-arrow)" />
        <line x1={288} y1={62} x2={272} y2={62} markerEnd="url(#oc-arrow)" />
        <g className="text-muted-foreground" {...mutedDash}>
          <path d="M254 142 V152" />
          <path d="M272 142 V152" />
          <path d="M208 62 H216" />
          <path d="M208 142 H214" />
        </g>
        <T x={252} y={164} size={8} tone="primary">VTH</T>
        <T x={278} y={164} size={8} tone="primary">VTL</T>
        <T x={202} y={64} anchor="end" size={7.5} tone="muted">H</T>
        <T x={202} y={144} anchor="end" size={7.5} tone="muted">L</T>
      </g>
    )
  },
  noise: {
    title: '电阻热噪声',
    formula: 'en = √(4kTR)（25 ℃ 谱密度 nV/√Hz）；B 带宽内总噪声 = en·√B',
    render: () => (
      <g>
        <circle cx={46} cy={90} r={3.5} />
        <path d="M50 90 H105" />
        {resistorH(105, 165, 90)}
        <T x={135} y={106} size={9}>R</T>
        <path d="M165 90 H202" />
        <circle cx={215} cy={90} r={13} />
        <path d={sinePath(206, 224, 90, 4.5, 1.5)} strokeWidth={1.1} />
        <T x={215} y={72} size={9} tone="primary" weight={600}>en</T>
        <path d="M228 90 H280" />
        <circle cx={284} cy={90} r={3.5} />
        <T x={165} y={134} size={8.5} tone="muted">串联噪声电压源（约翰逊噪声）</T>
        <T x={165} y={150} size={8.5} tone="primary">en = √(4kTR) · √B = √(4kTRB)</T>
      </g>
    )
  }
}

export function OpampCalcDiagram(props: DiagramProps): JSX.Element | null {
  const mode = typeof props.payload.mode === 'string' && props.payload.mode ? props.payload.mode : 'gain'
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
