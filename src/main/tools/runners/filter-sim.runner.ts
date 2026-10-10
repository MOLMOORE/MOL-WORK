import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolDefinition, ToolExecutionResult } from '../types'
import { fmtQty, parseQty } from '../engineering'
import { bandMetrics, decadeTable, fmtFreq, polesAndZeros, stepResponse, sweep, toCsv, transfer, type MnaComponent, type MnaNetlist, type ResponsePoint } from '../mna'

/**
 * 滤波电路仿真分析。
 * 电路求解不用自己写：直接调用开源 MNA 引擎 analog-filter-designer（MIT，零依赖，
 * 复数导纳节点方程 + 理想运放 nullor 模型），本项目只做「搭网表 + 读曲线」两层胶水。
 * 因为解的是真实电路，负载效应、级间加载、元件相互作用都会体现在结果里。
 */

const TOPOLOGIES = [
  { label: 'RC 一阶低通', value: 'rc-lowpass' },
  { label: 'RC 一阶高通', value: 'rc-highpass' },
  { label: 'RC 带通（高通 + 低通直接级联）', value: 'rc-bandpass' },
  { label: 'N 级缓冲 RC 低通', value: 'rc-ladder' },
  { label: 'N 节无源 LC 低通', value: 'lc-ladder' },
  { label: 'π 型 LC 低通', value: 'pi-lowpass' },
  { label: 'T 型 LC 低通', value: 't-lowpass' },
  { label: '二阶 Sallen-Key 低通', value: 'sallen-lowpass' },
  { label: '双 T 陷波（带阻）', value: 'twin-notch' }
]

const KIND: Record<string, { label: string; shape: 'lowpass' | 'highpass' | 'bandpass' | 'notch' }> = {
  'rc-lowpass': { label: 'RC 一阶低通', shape: 'lowpass' },
  'rc-highpass': { label: 'RC 一阶高通', shape: 'highpass' },
  'rc-bandpass': { label: 'RC 带通', shape: 'bandpass' },
  'rc-ladder': { label: '缓冲 RC 梯形低通', shape: 'lowpass' },
  'lc-ladder': { label: '无源 LC 低通', shape: 'lowpass' },
  'pi-lowpass': { label: 'π 型 LC 低通', shape: 'lowpass' },
  't-lowpass': { label: 'T 型 LC 低通', shape: 'lowpass' },
  'sallen-lowpass': { label: 'Sallen-Key 低通', shape: 'lowpass' },
  'twin-notch': { label: '双 T 陷波', shape: 'notch' }
}

const ON = (values: string[]): { key: string; values: string[] } => ({ key: 'topology', values })

function buildNetlist(topology: string, parts: { r: number; r2: number; c: number; c2: number; l: number; rs: number; rl: number; sections: number }): { netlist: MnaNetlist; outputNode: number } | string {
  const comps: MnaComponent[] = [{ type: 'V', nodes: [1, 0], value: 1 }]
  const finite = (value: number): boolean => Number.isFinite(value) && value > 0
  let nodes = 1

  const push = (component: MnaComponent): void => {
    comps.push(component)
    for (const node of component.nodes) nodes = Math.max(nodes, node)
  }

  switch (topology) {
    case 'rc-lowpass': {
      if (!finite(parts.r) || !finite(parts.c)) return '需要电阻 R 与电容 C'
      push({ type: 'R', nodes: [1, 2], value: parts.r })
      push({ type: 'C', nodes: [2, 0], value: parts.c })
      if (finite(parts.rl)) push({ type: 'R', nodes: [2, 0], value: parts.rl })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: 2 }
    }
    case 'rc-highpass': {
      if (!finite(parts.r) || !finite(parts.c)) return '需要电阻 R 与电容 C'
      push({ type: 'C', nodes: [1, 2], value: parts.c })
      push({ type: 'R', nodes: [2, 0], value: parts.r })
      if (finite(parts.rl)) push({ type: 'R', nodes: [2, 0], value: parts.rl })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: 2 }
    }
    case 'rc-bandpass': {
      if (!finite(parts.r) || !finite(parts.c) || !finite(parts.r2) || !finite(parts.c2)) return '需要 R、C（高通）与 R2、C2（低通）四件'
      push({ type: 'C', nodes: [1, 2], value: parts.c })
      push({ type: 'R', nodes: [2, 0], value: parts.r })
      push({ type: 'R', nodes: [2, 3], value: parts.r2 })
      push({ type: 'C', nodes: [3, 0], value: parts.c2 })
      if (finite(parts.rl)) push({ type: 'R', nodes: [3, 0], value: parts.rl })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: 3 }
    }
    case 'rc-ladder': {
      if (!finite(parts.r) || !finite(parts.c)) return '需要电阻 R 与电容 C'
      const n = Math.max(1, Math.min(8, Math.round(parts.sections || 1)))
      let drive = 1
      let output = 1
      for (let index = 1; index <= n; index += 1) {
        const junction = 2 * index
        output = junction + 1
        push({ type: 'R', nodes: [drive, junction], value: parts.r })
        push({ type: 'C', nodes: [junction, 0], value: parts.c })
        push({ type: 'OPAMP', nodes: [junction, output, output] })
        drive = output
      }
      if (finite(parts.rl)) push({ type: 'R', nodes: [output, 0], value: parts.rl })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: output }
    }
    case 'lc-ladder':
    case 'pi-lowpass':
    case 't-lowpass': {
      if (!finite(parts.l) || !finite(parts.c)) return '需要电感 L 与电容 C'
      let cursor = 1
      if (finite(parts.rs)) {
        push({ type: 'R', nodes: [1, 2], value: parts.rs })
        cursor = 2
      }
      if (topology === 'pi-lowpass') {
        const next = cursor + 1
        const out = next + 1
        push({ type: 'C', nodes: [cursor, next], value: parts.c / 2 })
        push({ type: 'L', nodes: [next, out], value: parts.l })
        push({ type: 'C', nodes: [out, 0], value: parts.c / 2 })
        cursor = out
        if (finite(parts.rl)) push({ type: 'R', nodes: [cursor, 0], value: parts.rl })
        return { netlist: { numNodes: nodes, components: comps }, outputNode: cursor }
      }
      if (topology === 't-lowpass') {
        const mid = cursor + 1
        const out = mid + 1
        push({ type: 'L', nodes: [cursor, mid], value: parts.l / 2 })
        push({ type: 'C', nodes: [mid, 0], value: parts.c })
        push({ type: 'L', nodes: [mid, out], value: parts.l / 2 })
        cursor = out
        if (finite(parts.rl)) push({ type: 'R', nodes: [cursor, 0], value: parts.rl })
        return { netlist: { numNodes: nodes, components: comps }, outputNode: cursor }
      }
      const n = Math.max(1, Math.min(6, Math.round(parts.sections || 1)))
      let output = cursor
      for (let index = 1; index <= n; index += 1) {
        const next = cursor + 1
        push({ type: 'L', nodes: [cursor, next], value: parts.l })
        push({ type: 'C', nodes: [next, 0], value: parts.c })
        cursor = next
        output = next
      }
      push({ type: 'R', nodes: [output, 0], value: finite(parts.rl) ? parts.rl : 1e3 })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: output }
    }
    case 'sallen-lowpass': {
      if (!finite(parts.r) || !finite(parts.r2) || !finite(parts.c) || !finite(parts.c2)) return '需要 R1、R2、C1、C2 四件'
      push({ type: 'R', nodes: [1, 2], value: parts.r })
      push({ type: 'R', nodes: [2, 3], value: parts.r2 })
      push({ type: 'C', nodes: [2, 4], value: parts.c })
      push({ type: 'C', nodes: [3, 0], value: parts.c2 })
      push({ type: 'OPAMP', nodes: [3, 4, 4] })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: 4 }
    }
    case 'twin-notch': {
      if (!finite(parts.r) || !finite(parts.c)) return '需要电阻 R 与电容 C'
      push({ type: 'R', nodes: [1, 2], value: parts.r })
      push({ type: 'R', nodes: [2, 4], value: parts.r })
      push({ type: 'C', nodes: [2, 0], value: 2 * parts.c })
      push({ type: 'C', nodes: [1, 3], value: parts.c })
      push({ type: 'C', nodes: [3, 4], value: parts.c })
      push({ type: 'R', nodes: [3, 0], value: parts.r / 2 })
      push({ type: 'R', nodes: [4, 0], value: finite(parts.rl) ? parts.rl : 100 * parts.r })
      return { netlist: { numNodes: nodes, components: comps }, outputNode: 4 }
    }
    default:
      return `未知电路结构：${topology}`
  }
}

export const filterSimTool: ToolDefinition = {
  manifest: {
    id: 'filter-sim',
    name: '滤波电路仿真',
    category: 'calc',
    description: '用开源 MNA 引擎解真实电路：实测 -3 dB 点、极点零点与阶跃响应，含负载效应，可导出 CSV。',
    icon: 'Activity',
    requires: [],
    builtin: true,
    fields: [
      { name: 'topology', label: '电路结构', type: 'select', required: true, defaultValue: 'rc-lowpass', options: TOPOLOGIES },
      { name: 'r', label: '电阻 R / R1 (Ω)', type: 'text', placeholder: '10k、4m7', visibleWhen: ON(['rc-lowpass', 'rc-highpass', 'rc-bandpass', 'rc-ladder', 'sallen-lowpass', 'twin-notch']) },
      { name: 'r2', label: '电阻 R2 (Ω)', type: 'text', placeholder: '10k', visibleWhen: ON(['rc-bandpass', 'sallen-lowpass']) },
      { name: 'c', label: '电容 C / C1 (F)', type: 'text', placeholder: '100n、22p', visibleWhen: ON(['rc-lowpass', 'rc-highpass', 'rc-bandpass', 'rc-ladder', 'lc-ladder', 'pi-lowpass', 't-lowpass', 'sallen-lowpass', 'twin-notch']) },
      { name: 'c2', label: '电容 C2 (F)', type: 'text', placeholder: '100n', visibleWhen: ON(['rc-bandpass', 'sallen-lowpass']) },
      { name: 'l', label: '电感 L (H)', type: 'text', placeholder: '1m、100u', visibleWhen: ON(['lc-ladder', 'pi-lowpass', 't-lowpass']) },
      { name: 'rs', label: '信号源内阻 Rs (Ω)', type: 'text', placeholder: '50、1k', visibleWhen: ON(['lc-ladder', 'pi-lowpass', 't-lowpass']) },
      { name: 'rl', label: '负载电阻 RL (Ω)', type: 'text', placeholder: '1k、10k', visibleWhen: ON(['rc-lowpass', 'rc-highpass', 'rc-bandpass', 'rc-ladder', 'lc-ladder', 'pi-lowpass', 't-lowpass', 'twin-notch']) },
      { name: 'sections', label: '级数 / 节数', type: 'select', defaultValue: '2', options: [1, 2, 3, 4, 5, 6].map((value) => ({ label: `${value}`, value: String(value) })), visibleWhen: ON(['rc-ladder', 'lc-ladder']) },
      { name: 'fStart', label: '扫频起点 (Hz)', type: 'text', defaultValue: '10', placeholder: '10' },
      { name: 'fStop', label: '扫频终点 (Hz)', type: 'text', defaultValue: '1M', placeholder: '1M' },
      { name: 'points', label: '扫频点数', type: 'select', defaultValue: '600', options: [200, 600, 1200].map((value) => ({ label: `${value} 点`, value: String(value) })) },
      { name: 'at', label: '指定频点 (Hz)', type: 'text', placeholder: '查该频点增益时填' },
      { name: 'stepSpan', label: '阶跃观测时长 (s)', type: 'text', placeholder: '留空则不分析瞬态' }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const topology = ctx.getString(payload, 'topology', 'rc-lowpass')
    const meta = KIND[topology]
    if (!meta) return { ok: false, error: `未知电路结构：${topology}` }
    const value = (key: string): number => {
      const parsed = parseQty(ctx.getString(payload, key))
      return parsed === null || parsed === 0 ? Number.NaN : parsed
    }
    const built = buildNetlist(topology, {
      r: value('r'),
      r2: value('r2'),
      c: value('c'),
      c2: value('c2'),
      l: value('l'),
      rs: value('rs'),
      rl: value('rl'),
      sections: Number(ctx.getString(payload, 'sections', '1')) || 1
    })
    if (typeof built === 'string') return { ok: false, error: built }
    const { netlist, outputNode } = built

    const from = value('fStart') || 10
    const to = value('fStop') || from * 1e5
    const points = Number(ctx.getString(payload, 'points', '600')) || 600
    let curve: ResponsePoint[]
    try {
      curve = sweep(netlist, outputNode, 1, from, to, points)
    } catch (error) {
      return { ok: false, error: `电路方程无解：${(error as Error).message}。请补全元件值，并确认每个节点都有通路到地。` }
    }
    const metrics = bandMetrics(curve, meta.shape)
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const add = (label: string, val: string): void => {
      outputs.push({ label, value: val })
    }

    add('电路', `${meta.label} · ${netlist.components.length - 1} 个元件 / ${netlist.numNodes} 个节点`)
    add('扫频范围', `${fmtFreq(from)} ~ ${fmtFreq(to)}（${curve.length} 点）`)
    if (metrics.crossings.length >= 1) {
      add('实测 -3 dB 频率', metrics.crossings.map((freq) => fmtFreq(freq)).join(' / '))
      if (metrics.allCrossings.length > metrics.crossings.length) {
        notes.push('通带内有纹波导致曲线多次穿越 -3 dB，已按电路类型取端点；全部交点见曲线文件。')
      }
    }
    if (meta.shape === 'bandpass' && metrics.crossings.length >= 2) {
      const low = metrics.crossings[0]
      const high = metrics.crossings[metrics.crossings.length - 1]
      const center = Math.sqrt(low * high)
      add('中心频率 f0', fmtFreq(center))
      add('-3 dB 带宽', fmtFreq(high - low))
      add('品质因数 Q', (center / (high - low)).toFixed(3))
    }
    if (meta.shape === 'notch') {
      add('陷波频率', fmtFreq(metrics.nullFreqHz))
      add('陷波深度', `${metrics.nullDb.toFixed(1)} dB`)
    }
    if (metrics.peakDb > metrics.referenceDb + 0.01) {
      add('通带峰值', `${metrics.peakDb.toFixed(2)} dB @ ${fmtFreq(metrics.peakFreqHz)}`)
      notes.push('峰值来自电路的谐振 / 加载效应，不是理想模型的近似。')
    }
    const at = value('at')
    if (Number.isFinite(at)) {
      const point = transfer(netlist, outputNode, 1, at)
      add(`${fmtFreq(at)} 处响应`, `${point.db.toFixed(2)} dB（${(point.magnitude * 100).toFixed(3)} %）· 相位 ${point.phaseDeg.toFixed(1)}°`)
    }
    let pz: { poles: { freqHz: number; q: number }[]; zeros: { freqHz: number; q: number }[] } = { poles: [], zeros: [] }
    try {
      pz = polesAndZeros(netlist, outputNode)
    } catch {
      notes.push('阶数过高时极点拟合可能不收敛，扫频结果仍然有效。')
    }
    if (pz.poles.length > 0) add('极点', pz.poles.map((pole) => `${fmtFreq(pole.freqHz)}${pole.q > 40 ? '' : `（Q ${pole.q.toFixed(2)}）`}`).join('、'))
    if (pz.zeros.length > 0) add('零点', pz.zeros.map((zero) => fmtFreq(zero.freqHz)).join('、'))

    const span = value('stepSpan')
    if (Number.isFinite(span) && span > 0) {
      let step: { timeSeconds: number; voltage: number }[] = []
      try {
        step = stepResponse(netlist, outputNode, 1, span)
      } catch {
        step = []
      }
      const finalValue = step[step.length - 1]?.voltage ?? 0
      if (step.length === 0) notes.push('瞬态分析未收敛，可缩短观测时长或减小步长。')
      if (Math.abs(finalValue) > 1e-9) {
        const level = (fraction: number): number => {
          const target = finalValue * fraction
          const hit = step.find((sample) => sample.voltage >= target)
          return hit ? hit.timeSeconds : Number.NaN
        }
        const rise10 = level(0.1)
        const rise90 = level(0.9)
        const settle = level(0.99)
        const overshoot = Math.max(...step.map((sample) => sample.voltage)) / finalValue - 1
        add('阶跃终值', finalValue.toFixed(4))
        if (Number.isFinite(rise10) && Number.isFinite(rise90)) add('10%~90% 上升时间', fmtQty(rise90 - rise10, 's'))
        if (Number.isFinite(settle)) add('到达 99% 用时', fmtQty(settle, 's'))
        if (overshoot > 0.001) add('过冲', `${(overshoot * 100).toFixed(1)} %`)
      }
    }

    // 导出曲线，便于在别的软件里画图
    mkdirSync(ctx.outputRoot, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const csvPath = join(ctx.outputRoot, `filter-sim-${topology}-${stamp}.csv`)
    writeFileSync(csvPath, toCsv(curve), 'utf8')
    add('曲线文件', csvPath)

    const table = decadeTable(curve)
      .map((point) => `${fmtFreq(point.freqHz).padEnd(12)} ${point.db.toFixed(2).padStart(8)} dB  ${point.phaseDeg.toFixed(1).padStart(7)}°`)
      .join('\n')
    notes.push('数值由开源 MNA 求解器 analog-filter-designer（MIT）解真实节点方程得到，已含负载与级间加载效应。')
    const summary = metrics.crossings.length > 0 ? `实测 -3 dB：${metrics.crossings.map((freq) => fmtFreq(freq)).join(' / ')}` : `通带 ${metrics.referenceDb.toFixed(2)} dB，陷波 ${metrics.nullDb.toFixed(1)} dB`
    const preview = `${summary}\n\n${table}\n\n${notes.join('\n')}`
    return { ok: true, resultSummary: summary, outputs, resultPath: csvPath, preview }
  }
}