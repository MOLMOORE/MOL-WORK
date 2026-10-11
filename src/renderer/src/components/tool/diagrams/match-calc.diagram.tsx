// match-calc 配图：L 型集总 / π 型 / 单支节 / λ4 变换器四种匹配拓扑，按 payload.mode 切换。
// 位号与表单字段一致：zl（负载）、z0（系统阻抗）、q（π 型设计 Q）、stubend（'open'|'short'）、er（εr）、f（频率）。
// 元件符号按教材规范：电阻锯齿、电容双板、电感半圆弧串、传输线=双平行线、开路支节端头断开、短路支节端头横线封死、接地三横线。
// 标注仅为字符串透传与结构切换，不做真实阻抗计算。
// 纯内联 SVG：fill none + stroke currentColor，颜色只走主题令牌（text-foreground / text-muted-foreground / text-primary），零硬编码色值。

import type { DiagramProps } from './types'

const W = 340

function sv(payload: Record<string, unknown>, key: string): string {
  return String(payload[key] ?? '')
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
    <text x={props.x} y={props.y} fontSize={props.size ?? 8} textAnchor={props.anchor ?? 'middle'} fontWeight={props.weight} fill="currentColor" stroke="none" className={className}>
      {props.children}
    </text>
  )
}

function dot(x: number, y: number): JSX.Element {
  return <circle cx={x} cy={y} r={2.1} fill="currentColor" stroke="none" />
}

/** 水平电阻：锯齿 */
function resistorH(x1: number, x2: number, y: number): JSX.Element {
  const bodyW = Math.min(46, (x2 - x1) * 0.72)
  const left = (x1 + x2) / 2 - bodyW / 2
  const seg = bodyW / 6
  let d = 'M ' + x1 + ' ' + y + ' L ' + left.toFixed(1) + ' ' + y
  for (let i = 0; i < 6; i += 1) {
    d += ' L ' + (left + seg * (i + 0.5)).toFixed(1) + ' ' + (y + (i % 2 === 0 ? -5 : 5))
  }
  d += ' L ' + (left + bodyW).toFixed(1) + ' ' + y + ' L ' + x2 + ' ' + y
  return <path d={d} />
}

/** 竖直电阻：锯齿（负载画法） */
function resistorV(x: number, y1: number, y2: number): JSX.Element {
  const bodyH = Math.min(44, (y2 - y1) * 0.72)
  const top = (y1 + y2) / 2 - bodyH / 2
  const seg = bodyH / 6
  let d = 'M ' + x + ' ' + y1 + ' L ' + x + ' ' + top.toFixed(1)
  for (let i = 0; i < 6; i += 1) {
    d += ' L ' + (x + (i % 2 === 0 ? -5 : 5)).toFixed(1) + ' ' + (top + seg * (i + 0.5)).toFixed(1)
  }
  d += ' L ' + x + ' ' + (top + bodyH).toFixed(1) + ' L ' + x + ' ' + y2
  return <path d={d} />
}

/** 串联电感：arcs 段上凸半圆弧串 */
function inductorH(x1: number, x2: number, y: number, arcs: number): JSX.Element {
  const r = (x2 - x1) / (arcs * 2)
  let d = 'M ' + x1 + ' ' + y
  for (let i = 0; i < arcs; i += 1) {
    d += ' A ' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (x1 + r * 2 * (i + 1)).toFixed(1) + ' ' + y
  }
  return <path d={d} />
}

/** 并联电容：竖直引线 + 双板（两条水平短板） */
function capV(x: number, y1: number, y2: number): JSX.Element {
  const mid = (y1 + y2) / 2
  return (
    <g>
      <path d={'M ' + x + ' ' + y1 + ' V ' + (mid - 3).toFixed(1)} />
      <line x1={x - 7} y1={mid - 3} x2={x + 7} y2={mid - 3} />
      <line x1={x - 7} y1={mid + 3} x2={x + 7} y2={mid + 3} />
      <path d={'M ' + x + ' ' + (mid + 3).toFixed(1) + ' V ' + y2} />
    </g>
  )
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

/** 传输线（水平）：两条平行线 */
function tlineH(x1: number, x2: number, y: number, gap: number): JSX.Element {
  return (
    <g>
      <line x1={x1} y1={y - gap} x2={x2} y2={y - gap} />
      <line x1={x1} y1={y + gap} x2={x2} y2={y + gap} />
    </g>
  )
}

/** 支节传输线（竖直）：x 左右各一条平行线 */
function tlineV(x: number, y1: number, y2: number, off: number): JSX.Element {
  return (
    <g>
      <line x1={x - off} y1={y1} x2={x - off} y2={y2} />
      <line x1={x + off} y1={y1} x2={x + off} y2={y2} />
    </g>
  )
}

/** 四图共用的底部注释行：结构名 + 关键关系式 */
function Caption(props: { name: string; formula: string }): JSX.Element {
  return <p className="text-[11px] leading-snug text-muted-foreground">{props.name + '：' + props.formula}</p>
}

// —— 1) L 型集总匹配：并-串两臂。假定 R_L > Z0（常见情形）时并联臂取电容、串联臂取电感；
//    反例时两者互换，故位号写成 'C 或 L' / 'L 或 C'，± 表示两种解。
function LMatchScene(zl: string, z0: string): JSX.Element {
  const mainY = 76
  const railY = 158
  return (
    <g>
      {/* 两条水平主线：上为信号线，下为公共地 */}
      <path d={'M 20 ' + mainY + ' H 180'} />
      <path d={'M 250 ' + mainY + ' H 300'} />
      <path d={'M 20 ' + railY + ' H 300'} />
      {gnd(60, railY)}
      {dot(20, mainY)}
      <T x={20} y={mainY - 10} size={7.5} anchor="start">{(zl || 'ZL') + '（源端侧）'}</T>
      {/* 并联支路：电容双板竖直落地（示意 C，实际随负载类型与 C/L 互换） */}
      <path d={'M 140 ' + mainY + ' V 96'} />
      {capV(140, 96, railY)}
      {dot(140, mainY)}
      <T x={124} y={132} size={7} anchor="end">C 或 L</T>
      {/* 串联元件：电感半圆弧串在主线 */}
      {inductorH(180, 250, mainY, 4)}
      <T x={215} y={mainY - 10} size={7}>L 或 C</T>
      <T x={163} y={64} size={9.5} tone="primary" weight={600}>±</T>
      {/* 右端负载 */}
      {resistorV(300, mainY, railY)}
      <T x={310} y={118} size={7.5} anchor="start">{z0 || 'Z0'}</T>
      <T x={160} y={188} size={7} tone="muted">并-串两解 · ± 对应 C/L 互换</T>
    </g>
  )
}

// —— 2) π 型：并C串L并C（低通），等效两个 L 网络背靠背，Q 由表单透传。
function PiScene(zl: string, z0: string, q: string): JSX.Element {
  const mainY = 64
  const railY = 156
  return (
    <g>
      <path d={'M 20 ' + mainY + ' H 24'} />
      {resistorH(24, 86, mainY)}
      <path d={'M 86 ' + mainY + ' H 165'} />
      <path d={'M 235 ' + mainY + ' H 310'} />
      <path d={'M 20 ' + railY + ' H 310'} />
      {gnd(60, railY)}
      <T x={55} y={mainY - 24} size={7} tone="muted">{'R1 = ' + (z0 || 'Z0')}</T>
      {/* C1 落地 */}
      <path d={'M 135 ' + mainY + ' V 92'} />
      {capV(135, 92, railY)}
      {dot(135, mainY)}
      <T x={118} y={116} size={7} anchor="end">C1</T>
      {/* 串联电感 */}
      {inductorH(165, 235, mainY, 4)}
      <T x={200} y={mainY - 10} size={7}>L</T>
      {/* C2 落地 */}
      <path d={'M 270 ' + mainY + ' V 92'} />
      {capV(270, 92, railY)}
      {dot(270, mainY)}
      <T x={288} y={116} size={7} anchor="start">C2</T>
      {/* 右端负载 R2 */}
      {resistorV(310, mainY, railY)}
      <T x={306} y={mainY - 24} size={7} anchor="end" tone="muted">{'R2 = ' + (zl || 'R_L')}</T>
      <T x={175} y={34} size={7.5} tone="primary">{q ? 'Q=' + q : 'Q'}</T>
    </g>
  )
}

// —— 3) 单支节匹配：主线为双平行传输线，d 处引出 1/4 线长的并联支节，端头按 open/short 切换。
function StubScene(zl: string, z0: string, er: string, f: string, stubend: string): JSX.Element {
  const up = 58
  const lo = 70
  const nodeX = 120
  const stubEndY = 132
  const isShort = stubend === 'short'
  return (
    <g>
      {/* d 尺寸线（信号源到支节节点） */}
      <path d={'M 28 40 H ' + nodeX} />
      <path d={'M 28 36 V 44'} />
      <path d={'M ' + nodeX + ' 36 V 44'} />
      <T x={74} y={34} size={7.5}>d</T>
      {/* 主线传输线：两条平行线 */}
      {tlineH(28, 290, (up + lo) / 2, (lo - up) / 2)}
      <path d={'M 28 ' + up + ' V ' + lo} />
      <T x={160} y={48} size={7}>{'Z0=' + (z0 || 'Z0')}</T>
      <T x={230} y={48} size={7} tone="muted">{er ? 'εr=' + er : 'εr'}</T>
      {/* 支节：竖直双平行线，长度约为主线 1/4 */}
      {tlineV(nodeX, lo, stubEndY, 6)}
      {dot(nodeX, lo)}
      <T x={104} y={106} size={7.5} anchor="end">l</T>
      {isShort ? (
        <g>
          <path d={'M ' + (nodeX - 6) + ' ' + stubEndY + ' H ' + (nodeX + 6)} />
          {gnd(nodeX, stubEndY + 4)}
          <T x={140} y={138} size={6.5} anchor="start" tone="muted">短路端</T>
        </g>
      ) : (
        <g>
          <T x={140} y={132} size={6.5} anchor="start" tone="muted">开路端</T>
        </g>
      )}
      {/* 右端负载竖框 + 频率标注 */}
      <rect x={290} y={up} width={16} height={lo - up} />
      <T x={298} y={88} size={7} anchor="start">{'ZL ' + (zl || 'Z_L')}</T>
      <T x={298} y={100} size={7} tone="muted">{f ? 'f = ' + f : 'f'}</T>
    </g>
  )
}

// —— 4) λ/4 阻抗变换器：一段加粗双平行线矩形框，Z1 为几何平均。
function QuarterScene(zl: string, z0: string, f: string): JSX.Element {
  const y = 96
  return (
    <g>
      <path d={'M 24 ' + y + ' H 92'} />
      <rect x={92} y={74} width={120} height={44} strokeWidth={2} />
      {tlineH(92, 212, y, 7)}
      <T x={152} y={100} size={7.5}>{'Z₁ = √(Z0·RL)'}</T>
      <path d={'M 212 ' + y + ' H 308'} />
      <rect x={308} y={y - 14} width={12} height={28} />
      {dot(24, y)}
      <T x={58} y={82} size={7}>{'Z0 = ' + (z0 || 'Z0')}</T>
      <T x={260} y={82} size={7}>{'RL = ' + (zl || 'RL')}</T>
      <T x={152} y={132} size={7.5} tone="primary">{'λ/4' + (f ? ' @ f = ' + f : '')}</T>
      <T x={152} y={148} size={6.5} tone="muted">Z_in = Z₁² / RL = Z0</T>
    </g>
  )
}

interface Scene {
  h: number
  title: string
  formula: string
  body: JSX.Element
}

export function MatchCalcDiagram(props: DiagramProps): JSX.Element {
  const payload = props.payload
  const mode = typeof payload.mode === 'string' && payload.mode ? payload.mode : 'lmatch'
  const zl = sv(payload, 'zl')
  const z0 = sv(payload, 'z0')
  const q = sv(payload, 'q')
  const er = sv(payload, 'er')
  const f = sv(payload, 'f')
  const stubend = sv(payload, 'stubend')
  let scene: Scene
  if (mode === 'pi') {
    scene = {
      h: 190,
      title: 'π型 · 两个L网络背靠背（低通：并C串L并C）',
      formula: '先选 Q，两侧各按一个 L 网络求解：X_L = Q·R_并，B_C1/B_C2 由 Q 与 R1、R2 决定',
      body: PiScene(zl, z0, q)
    }
  } else if (mode === 'stub') {
    scene = {
      h: 205,
      title: '单支节 · d 与 l 两个解族',
      formula: 'y(d) = (y_L + j·tanβd) / (1 + j·y_L·tanβd)，支节电纳取 −Im{y(d)}；开路/短路支节各给 ±jB',
      body: StubScene(zl, z0, er, f, stubend)
    }
  } else if (mode === 'qtr') {
    scene = {
      h: 190,
      title: 'λ/4 阻抗变换器 · 窄带',
      formula: 'Z₁ = √(Z0·RL)，Z_in = Z₁²/RL = Z0，仅在设计中心频率精确匹配',
      body: QuarterScene(zl, z0, f)
    }
  } else {
    scene = {
      h: 200,
      title: 'L型集总 · 窄带单频匹配',
      formula: '并-串两解：Q = √(|Z_L/Z_0| − 1)，串联臂电抗 = Q·小端电阻、并联臂电纳 = Q/大端电阻，± 对应 C/L 互换',
      body: LMatchScene(zl, z0)
    }
  }
  return (
    <div className="flex w-full flex-col gap-1">
      <svg viewBox={'0 0 ' + W + ' ' + scene.h} className="w-full h-auto text-foreground" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={scene.title + ' 示意图'}>
        {scene.body}
      </svg>
      <Caption name={scene.title} formula={scene.formula} />
    </div>
  )
}
