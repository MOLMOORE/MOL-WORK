import { poleZeroMap, solveAC, simulateTransient } from 'analog-filter-designer'
import type { MnaNetlist } from 'analog-filter-designer'

/**
 * 开源 MNA 引擎（analog-filter-designer）之上的一层薄封装：
 * 把「节点电压」整理成幅频 / 相频曲线，并从曲线上实测 -3 dB 点、通带、陷波深度等指标。
 * 所有指标都来自真实电路方程（含负载与级间加载效应），不是理想公式的近似。
 */

export type { MnaComponent, MnaNetlist } from 'analog-filter-designer'

export const TWO_PI = 2 * Math.PI

export interface ResponsePoint {
  freqHz: number
  magnitude: number
  db: number
  phaseDeg: number
}

export type CurveShape = 'lowpass' | 'highpass' | 'bandpass' | 'notch'

export interface BandMetrics {
  /** 通带参考增益（dB） */
  referenceDb: number
  /** 实测 -3 dB 点：低通取最后一个、高通取第一个、带通取首尾、陷波取两侧 */
  crossings: number[]
  /** 曲线上全部 -3 dB 交点（多节 LC 通带内会反复穿越，留作排查） */
  allCrossings: number[]
  peakDb: number
  peakFreqHz: number
  nullDb: number
  nullFreqHz: number
}

export function transfer(netlist: MnaNetlist, outputNode: number, inputNode: number, freqHz: number): ResponsePoint {
  const omega = Math.max(TWO_PI * freqHz, 1e-9)
  const voltages = solveAC(netlist, omega)
  const out = voltages[outputNode]
  const reference = voltages[inputNode]
  const magnitude = out.abs() / reference.abs()
  const phase = (Math.atan2(out.im, out.re) - Math.atan2(reference.im, reference.re)) * (180 / Math.PI)
  return {
    freqHz,
    magnitude,
    db: 20 * Math.log10(Math.max(magnitude, 1e-18)),
    phaseDeg: Number(phase.toFixed(3))
  }
}

/** 对数等间隔扫频 */
export function sweep(netlist: MnaNetlist, outputNode: number, inputNode: number, fromHz: number, toHz: number, points: number): ResponsePoint[] {
  const count = Math.max(8, Math.min(Number.isFinite(points) ? points : 200, 4000))
  const low = Math.log10(Math.max(fromHz, 1e-3))
  const high = Math.log10(Math.max(toHz, fromHz * 10))
  const step = (high - low) / (count - 1)
  const list: ResponsePoint[] = []
  for (let index = 0; index < count; index += 1) {
    list.push(transfer(netlist, outputNode, inputNode, 10 ** (low + step * index)))
  }
  return list
}

/** 曲线在 levelDb 上从上方穿到下方（或反向）的频率，按 log f 线性插值 */
function crossingAt(list: ResponsePoint[], levelDb: number): number[] {
  const hits: number[] = []
  for (let index = 1; index < list.length; index += 1) {
    const a = list[index - 1]
    const b = list[index]
    if (a.db === b.db) continue
    if ((a.db - levelDb) * (b.db - levelDb) > 0) continue
    if (Math.abs(b.db - a.db) > 300) continue
    const ratio = (levelDb - a.db) / (b.db - a.db)
    const freq = 10 ** (Math.log10(a.freqHz) + ratio * (Math.log10(b.freqHz) - Math.log10(a.freqHz)))
    hits.push(freq)
  }
  return hits
}

export function bandMetrics(list: ResponsePoint[], shape: CurveShape = 'lowpass'): BandMetrics {
  let peak = list[0]
  let nullPoint = list[0]
  for (const point of list) {
    if (point.db > peak.db) peak = point
    if (point.db < nullPoint.db) nullPoint = point
  }
  const lowEnd = list.slice(0, Math.max(3, Math.round(list.length * 0.05)))
  const highEnd = list.slice(-Math.max(3, Math.round(list.length * 0.05)))
  // 带通与陷波的通带在曲线中间，参考只能取峰值；低通 / 高通取两端，避免把通带纹波当参考
  const referenceDb = shape === 'bandpass' || shape === 'notch' ? peak.db : Math.max(...lowEnd.map((point) => point.db), ...highEnd.map((point) => point.db))
  const hits = crossingAt(list, referenceDb - 3)
  let crossings: number[] = []
  if (shape === 'lowpass') crossings = hits.length > 0 ? [hits[hits.length - 1]] : []
  else if (shape === 'highpass') crossings = hits.length > 0 ? [hits[0]] : []
  else if (shape === 'bandpass') crossings = hits.length >= 2 ? [hits[0], hits[hits.length - 1]] : hits
  else {
    const left = hits.filter((freq) => freq < nullPoint.freqHz)
    const right = hits.filter((freq) => freq > nullPoint.freqHz)
    crossings = [left.length > 0 ? left[left.length - 1] : hits[0], right.length > 0 ? right[0] : hits[hits.length - 1]].filter(Number.isFinite)
  }
  return {
    referenceDb,
    crossings,
    allCrossings: hits,
    peakDb: peak.db,
    peakFreqHz: peak.freqHz,
    nullDb: nullPoint.db,
    nullFreqHz: nullPoint.freqHz
  }
}

/** 极点 / 零点：由引擎的有理拟合给出，换算成主导极点频率与 Q */
export function polesAndZeros(netlist: MnaNetlist, outputNode: number): {
  poles: { freqHz: number; q: number }[]
  zeros: { freqHz: number; q: number }[]
} {
  const map = poleZeroMap(netlist, outputNode)
  const convert = (list: { re: number; im: number }[]) =>
    list
      .filter((root) => Math.hypot(root.re, root.im) > 1e-6)
      .map((root) => {
        const omega0 = Math.hypot(root.re, root.im)
        const q = omega0 / (2 * Math.abs(root.re))
        return { freqHz: omega0 / TWO_PI, q }
      })
      .filter((item, index, all) => all.findIndex((other) => Math.abs(other.freqHz - item.freqHz) < item.freqHz * 1e-6) === index)
  return { poles: convert(map.poles ?? []), zeros: convert(map.zeros ?? []) }
}

export interface StepPoint {
  timeSeconds: number
  voltage: number
}

/** 阶跃响应：inputValue 为 t 的函数，返回输出节点电压 */
export function stepResponse(netlist: MnaNetlist, outputNode: number, amplitude: number, seconds: number): StepPoint[] {
  const samples = simulateTransient(netlist, { dt: seconds / 400, tStop: seconds, inputValue: () => amplitude })
  return samples.map((sample) => ({ timeSeconds: sample.t, voltage: sample.voltages[outputNode] ?? 0 }))
}

export function toCsv(list: ResponsePoint[]): string {
  const head = 'freq_hz,magnitude,gain_db,phase_deg'
  const rows = list.map((point) => `${point.freqHz.toExponential(6)},${point.magnitude.toExponential(8)},${point.db.toFixed(4)},${point.phaseDeg.toFixed(3)}`)
  return `${head}\n${rows.join('\n')}\n`
}

/** 每十倍频程取一个点，做一小段可直接读的文字波特图 */
export function decadeTable(list: ResponsePoint[], marks = 7): ResponsePoint[] {
  if (list.length === 0) return []
  const low = Math.log10(list[0].freqHz)
  const high = Math.log10(list[list.length - 1].freqHz)
  const picked: ResponsePoint[] = []
  for (let index = 0; index < marks; index += 1) {
    const target = 10 ** (low + ((high - low) * index) / (marks - 1))
    let best = list[0]
    for (const point of list) {
      if (Math.abs(Math.log10(point.freqHz) - Math.log10(target)) < Math.abs(Math.log10(best.freqHz) - Math.log10(target))) best = point
    }
    if (!picked.includes(best)) picked.push(best)
  }
  return picked
}

export const fmtFreq = (value: number): string => {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1e9) return `${(value / 1e9).toPrecision(4)} GHz`
  if (value >= 1e6) return `${(value / 1e6).toPrecision(4)} MHz`
  if (value >= 1e3) return `${(value / 1e3).toPrecision(4)} kHz`
  return `${value.toPrecision(4)} Hz`
}