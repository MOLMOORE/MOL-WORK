// unit-convert 配图：按 fromUnit 所属类别画一张概念小图（12 类各一幅），并标注「类别：fromUnit → toUnit」。
// 注意：下方 UNIT_CATEGORY（单位值 → 类别）与 src/main/tools/runners/unit-convert.runner.ts 的 UNITS 保持同步
//（键与 category 逐条照抄）；那张表变更后必须同步这里，否则新单位会查不到类别而不出图。
// 纯内联 SVG：颜色只走主题令牌（currentColor + text-foreground / text-muted-foreground / text-primary）。

import type { DiagramProps } from './types'

const CATEGORY_UNITS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['长度', ['m', 'km', 'cm', 'mm', 'um', 'nm', 'mi', 'yd', 'ft', 'inch', 'nmi', 'li']],
  ['质量', ['kg', 'g', 'mg', 't', 'lb', 'oz', 'jin']],
  ['面积', ['m2', 'km2', 'cm2', 'ha', 'mu', 'acre', 'ft2']],
  ['体积', ['L', 'mL', 'm3', 'gal', 'qt', 'floz']],
  ['速度', ['mps', 'kmph', 'mph', 'kn']],
  ['数据量', ['B', 'KB', 'MB', 'GB', 'TB', 'bit']],
  ['时间', ['ms', 's', 'min', 'h', 'day', 'week']],
  ['压强', ['Pa', 'kPa', 'MPa', 'bar', 'atm', 'mmHg', 'psi']],
  ['能量', ['J', 'kJ', 'cal', 'kcal', 'Wh', 'kWh']],
  ['频率', ['Hz', 'kHz', 'MHz', 'GHz']],
  ['角度', ['deg', 'rad', 'grad']],
  ['温度', ['C', 'F', 'K']]
]

const UNIT_CATEGORY: Record<string, string> = Object.fromEntries(
  CATEGORY_UNITS.flatMap(([category, units]) => units.map((unit) => [unit, category] as [string, string]))
)

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
  return <circle cx={x} cy={y} r={2.4} fill="currentColor" stroke="none" />
}

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
      <marker id="uc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      </marker>
    </defs>
  )
}

// —— 12 类概念小图：均以 (0,0) 为中心的线条画，绘制时外层平移到位 ——

/** 长度：直尺 + 刻度 + 双向测量箭头 */
function rulerIcon(): JSX.Element {
  return (
    <g>
      <rect x={-72} y={-14} width={144} height={28} rx={2} />
      <path d="M-60 -14 V-2 M-45 -14 V-6 M-30 -14 V-2 M-15 -14 V-6 M0 -14 V-2 M15 -14 V-6 M30 -14 V-2 M45 -14 V-6 M60 -14 V-2" />
      <line x1={-72} y1={26} x2={72} y2={26} markerStart="url(#uc-arrow)" markerEnd="url(#uc-arrow)" />
    </g>
  )
}

/** 质量：天平（立柱、横梁、两个秤盘与砝码） */
function balanceIcon(): JSX.Element {
  return (
    <g>
      <path d="M-26 40 H26" />
      <path d="M0 40 V-16" />
      <path d="M-48 -16 H48" />
      {dot(0, -16)}
      <path d="M-48 -16 V-4 M48 -16 V-4" />
      <path d="M-60 -4 Q-48 10 -36 -4" />
      <path d="M36 -4 Q48 10 60 -4" />
      <circle cx={-48} cy={0} r={4} fill="currentColor" stroke="none" />
      <rect x={42} y={-8} width={12} height={8} />
    </g>
  )
}

/** 面积：方格矩形 + 边长双向箭头 */
function areaIcon(): JSX.Element {
  return (
    <g>
      <rect x={-52} y={-30} width={104} height={60} rx={2} />
      <path d="M-26 -30 V30 M0 -30 V30 M26 -30 V30 M-52 -10 H52 M-52 10 H52" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <line x1={-52} y1={-42} x2={52} y2={-42} markerStart="url(#uc-arrow)" markerEnd="url(#uc-arrow)" />
    </g>
  )
}

/** 体积：量杯（刻度、液面波纹、杯口导流嘴） */
function beakerIcon(): JSX.Element {
  return (
    <g>
      <path d="M-28 -32 V24 Q-28 34 -18 34 H18 Q28 34 28 24 V-32" />
      <path d="M28 -32 L40 -26" />
      <path d="M-27 8 Q-13.5 2 0 8 T27 8" className="text-primary" stroke="currentColor" />
      <path d="M-28 -18 H-19 M-28 -5 H-19 M-28 20 H-19" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
    </g>
  )
}

/** 速度：里程表式半圆弧刻度盘 + 指针箭头 */
function speedIcon(): JSX.Element {
  return (
    <g>
      <path d="M-46 12 A46 46 0 0 1 46 12" />
      <path d="M-46 12 H46" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <path d="M0 -34 V-27 M-32.5 -20.5 L-26.9 -14.9 M32.5 -20.5 L26.9 -14.9" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <line x1={0} y1={12} x2={22} y2={-16} className="text-primary" stroke="currentColor" strokeWidth={1.6} markerEnd="url(#uc-arrow)" />
      {dot(0, 12)}
    </g>
  )
}

/** 数据量：堆叠的比特块（2×2 方格，内写 0/1） */
function bitsIcon(): JSX.Element {
  return (
    <g>
      <rect x={-30} y={-30} width={26} height={26} rx={2} />
      <rect x={2} y={-30} width={26} height={26} rx={2} />
      <rect x={-30} y={2} width={26} height={26} rx={2} />
      <rect x={2} y={2} width={26} height={26} rx={2} />
      <T x={-17} y={-13}>1</T>
      <T x={15} y={-13}>0</T>
      <T x={-17} y={21}>0</T>
      <T x={15} y={21}>1</T>
    </g>
  )
}

/** 时间：表盘（整点刻度 + 两根指针） */
function clockIcon(): JSX.Element {
  return (
    <g>
      <circle cx={0} cy={0} r={34} />
      <path d="M0 -34 V-28 M34 0 H28 M0 34 V28 M-34 0 H-28" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <path d="M0 0 V-22" strokeWidth={1.8} />
      <path d="M0 0 H15" strokeWidth={1.8} />
      {dot(0, 0)}
    </g>
  )
}

/** 压强：压力表（刻度、指针）压在承载板上，两个下压箭头表示力/面积 */
function gaugeIcon(): JSX.Element {
  return (
    <g>
      <circle cx={0} cy={-12} r={24} />
      {dot(0, -12)}
      <line x1={0} y1={-12} x2={13} y2={-25} className="text-primary" stroke="currentColor" strokeWidth={1.6} markerEnd="url(#uc-arrow)" />
      <path d="M0 -36 V-31 M-17 -29 L-13.5 -25.5 M17 -29 L13.5 -25.5 M-24 -12 H-19 M24 -12 H19" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <path d="M0 12 V30" />
      <path d="M-22 30 H22" strokeWidth={2} />
      <line x1={-13} y1={16} x2={-13} y2={26} markerEnd="url(#uc-arrow)" />
      <line x1={13} y1={16} x2={13} y2={26} markerEnd="url(#uc-arrow)" />
    </g>
  )
}

/** 能量：电池 + 闪电 */
function energyIcon(): JSX.Element {
  return (
    <g>
      <rect x={-58} y={-15} width={62} height={30} rx={3} />
      <rect x={6} y={-6} width={6} height={12} rx={1.5} />
      <path d="M-46 -6 V6 M-34 -6 V6 M-22 -6 V6" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <path d="M44 -28 L28 0 L37 0 L23 28 L48 -4 L37 -4 Z" className="text-primary" stroke="currentColor" strokeWidth={1.2} />
    </g>
  )
}

/** 频率：波形 + 波峰计数标线 */
function waveIcon(): JSX.Element {
  return (
    <g>
      <path d={sinePath(-58, 58, 8, 18, 2)} />
      <path d="M-43.5 -12 V-24 M14.5 -12 V-24" className="text-primary" stroke="currentColor" strokeWidth={1.4} />
      <circle cx={-43.5} cy={-28} r={2} fill="currentColor" stroke="none" className="text-primary" />
      <circle cx={14.5} cy={-28} r={2} fill="currentColor" stroke="none" className="text-primary" />
      <line x1={-58} y1={32} x2={58} y2={32} className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} markerEnd="url(#uc-arrow)" />
    </g>
  )
}

/** 角度：量角器（半圆刻度）+ 一条射线与夹角弧 */
function protractorIcon(): JSX.Element {
  return (
    <g>
      <path d="M-46 20 A46 46 0 0 1 46 20 Z" />
      <path d="M0 -26 V-19 M-23 -19.8 L-19.5 -13.7 M23 -19.8 L19.5 -13.7 M-39.8 -3 L-33.8 0.5 M39.8 -3 L33.8 0.5" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
      <line x1={0} y1={20} x2={31} y2={-17} className="text-primary" stroke="currentColor" strokeWidth={1.6} markerEnd="url(#uc-arrow)" />
      <path d="M20 20 A20 20 0 0 0 12.9 4.7" className="text-muted-foreground" stroke="currentColor" strokeWidth={1} />
      <T x={30} y={14} size={9} tone="primary">θ</T>
      {dot(0, 20)}
    </g>
  )
}

/** 温度：温度计（球部、毛细管、刻度、液柱） */
function thermometerIcon(): JSX.Element {
  return (
    <g>
      <path d="M-5 14 V-32 A5 5 0 0 1 5 -32 V14" />
      <circle cx={0} cy={24} r={12} />
      <path d="M0 24 V-16" strokeWidth={3} className="text-primary" stroke="currentColor" />
      <path d="M6 -26 H13 M6 -15 H13 M6 -4 H13 M6 7 H13" className="text-muted-foreground" stroke="currentColor" strokeWidth={0.9} />
    </g>
  )
}

const ICONS: Record<string, () => JSX.Element> = {
  长度: rulerIcon,
  质量: balanceIcon,
  面积: areaIcon,
  体积: beakerIcon,
  速度: speedIcon,
  数据量: bitsIcon,
  时间: clockIcon,
  压强: gaugeIcon,
  能量: energyIcon,
  频率: waveIcon,
  角度: protractorIcon,
  温度: thermometerIcon
}

export function UnitConvertDiagram(props: DiagramProps): JSX.Element | null {
  const fromUnit = typeof props.payload.fromUnit === 'string' ? props.payload.fromUnit : ''
  const toUnit = typeof props.payload.toUnit === 'string' ? props.payload.toUnit : ''
  const category = UNIT_CATEGORY[fromUnit]
  const icon = category ? ICONS[category] : undefined
  if (!icon) return null
  const label = category + '：' + fromUnit + ' → ' + toUnit
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox="0 0 320 165" className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label + ' 概念示意'}>
        {arrowDefs()}
        <g transform="translate(160, 66)">{icon()}</g>
        <T x={160} y={152} size={12} weight={600} tone="primary">{label}</T>
      </svg>
      <p className="text-[11px] leading-snug text-muted-foreground">{'单位换算：按「' + category + '」类单位绘制概念示意，换算方向见上图标注'}</p>
    </div>
  )
}
