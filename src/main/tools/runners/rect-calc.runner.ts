import type { ToolContext, ToolDefinition, ToolExecutionResult } from '../types'
import {
  E6,
  fmtFarad,
  fmtHz,
  fmtQty,
  fmtVolt,
  nearestSeries,
  parseQty,
  standardText
} from '../engineering'

// 整流滤波与滤波电容计算

interface OutputLine {
  label: string
  value: string
}

interface TopologyInfo {
  name: string
  rippleFactor: number
  diodeDropCount: number
  pivFactor: number
  diodeCurrentDivisor: number
}

interface BasicValues {
  vpk: number
  fr: number
  vdc: number
  piv: number
  diodeAvg: number
}

const MODES = [
  { label: '半波整流', value: 'half' }, { label: '全波中心抽头', value: 'ct' },
  { label: '桥式全波', value: 'bridge' }
]

function getTopologyInfo(mode: string): TopologyInfo | null {
  // 各整流拓扑参数
  if (mode === 'half') {
    return {
      name: '半波整流',
      rippleFactor: 1,
      diodeDropCount: 1,
      pivFactor: 2,
      diodeCurrentDivisor: 1
    }
  }

  if (mode === 'ct') {
    return {
      name: '全波中心抽头整流',
      rippleFactor: 2,
      diodeDropCount: 1,
      pivFactor: 2,
      diodeCurrentDivisor: 2
    }
  }

  if (mode === 'bridge') {
    return {
      name: '桥式全波整流',
      rippleFactor: 2,
      diodeDropCount: 2,
      pivFactor: 1,
      diodeCurrentDivisor: 2
    }
  }

  return null
}

function readNumber(
  ctx: ToolContext,
  payload: Record<string, unknown>,
  key: string
): number {
  // 支持工程计数法
  const parsed = parseQty(ctx.getString(payload, key))
  return parsed === null ? Number.NaN : parsed
}

function readPositiveNumber(
  ctx: ToolContext,
  payload: Record<string, unknown>,
  key: string
): number {
  // 输入必须大于 0
  const number = readNumber(ctx, payload, key)
  if (!Number.isFinite(number) || number <= 0) return Number.NaN
  return number
}

function addOutput(outputs: OutputLine[], label: string, value: string): void {
  outputs.push({ label, value })
}

function makeFail(message: string): ToolExecutionResult {
  return { ok: false, error: message }
}

function makeSuccess(outputs: OutputLine[], notes: string[]): ToolExecutionResult {
  // 生成摘要和预览
  const summary =
    outputs.length > 0 ? `${outputs[0].label} = ${outputs[0].value}` : '已计算'
  const detailLines = outputs
    .slice(1)
    .map((item) => `${item.label}：${item.value}`)
  const preview = [summary, ...detailLines, '', ...notes].join('\n')

  return {
    ok: true,
    resultSummary: summary,
    outputs,
    preview
  }
}

function calculateBasicValues(
  vsec: number,
  iload: number,
  frequency: number,
  diodeDrop: number,
  topology: TopologyInfo
): BasicValues | null {
  // 次级有效值转峰值
  const vpk = Math.SQRT2 * vsec

  // 计算纹波频率
  const fr = frequency * topology.rippleFactor

  // 减去二极管压降
  const vdc = vpk - topology.diodeDropCount * diodeDrop

  // 直流输出无效
  if (vdc <= 0) return null

  return {
    vpk,
    fr,
    vdc,
    piv: topology.pivFactor * vpk,
    diodeAvg: iload / topology.diodeCurrentDivisor
  }
}

function addSharedOutputs(
  outputs: OutputLine[],
  values: BasicValues,
  topology: TopologyInfo
): void {
  // 正算和反算共用结果
  addOutput(outputs, '二极管反压 PIV', fmtVolt(values.piv))
  addOutput(outputs, '二极管平均电流', fmtQty(values.diodeAvg, 'A'))
  addOutput(outputs, '整流拓扑', topology.name)
  addOutput(outputs, '纹波频率', fmtHz(values.fr))
}

function calculateFromCapacitor(
  cap: number,
  iload: number,
  values: BasicValues,
  topology: TopologyInfo
): ToolExecutionResult {
  // 由电容计算纹波
  const vpp = iload / (values.fr * cap)

  // 三角波纹波有效值
  const vrms = vpp / (2 * Math.sqrt(3))

  // 纹波系数
  const gamma = vrms / values.vdc
  const outputs: OutputLine[] = []
  const notes: string[] = []

  addOutput(outputs, '直流电压 Vdc', fmtVolt(values.vdc))
  addOutput(outputs, '纹波 Vr(pp)', fmtVolt(vpp))
  addOutput(outputs, '纹波 Vr(rms)', fmtVolt(vrms))
  addOutput(
    outputs,
    '纹波系数 γ',
    `${gamma.toFixed(4)}（${(gamma * 100).toFixed(2)} %）`
  )
  addSharedOutputs(outputs, values, topology)
  addOutput(
    outputs,
    '建议二极管耐压',
    `${fmtVolt(values.piv * 1.5)}（PIV × 1.5 留裕量）`
  )

  // 建议滤波电容
  const suggestion = nearestSeries(cap * 2, E6)
  addOutput(
    outputs,
    '建议滤波电容（就近标准值）',
    suggestion
      ? `${fmtFarad(suggestion.value)}（按 2×C 就近 E6，留纹波与浪涌裕量）`
      : '按 2×C 就近取 E6 未命中'
  )

  notes.push(
    '半波与中心抽头每半周只有 1 只二极管导通，桥式串联 2 只，故 Vdc ≈ Vpk − 2Vd。'
  )
  notes.push(
    '中心抽头与桥式在正负半周各给电容补电一次，纹波频率取 2f：50 Hz 电网为 100 Hz，同容量下纹波只有半波的一半。'
  )
  notes.push(
    '半波整流纹波频率仍是 f、纹波大且变压器存在直流磁化，除微小电流指示类场合外不推荐带载使用。'
  )

  return makeSuccess(outputs, notes)
}

function calculateFromRipple(
  ripple: number,
  iload: number,
  values: BasicValues,
  topology: TopologyInfo
): ToolExecutionResult {
  // 由目标纹波计算电容
  const requiredCap = iload / (values.fr * ripple)
  const nearest = nearestSeries(requiredCap, E6)
  const standardCap = nearest ? nearest.value : requiredCap

  // 用标准电容回算纹波
  const vpp = iload / (values.fr * standardCap)
  const vrms = vpp / (2 * Math.sqrt(3))
  const gamma = vrms / values.vdc
  const outputs: OutputLine[] = []
  const notes: string[] = []

  addOutput(outputs, '直流电压 Vdc', fmtVolt(values.vdc))
  addOutput(outputs, '所需滤波电容 C', fmtFarad(requiredCap))
  addOutput(outputs, '就近标准电容（E6）', standardText(requiredCap, 'F', E6))
  addOutput(outputs, '该电容下实际纹波 Vr(pp)', fmtVolt(vpp))
  addOutput(outputs, '纹波 Vr(rms)', fmtVolt(vrms))
  addOutput(
    outputs,
    '纹波系数 γ',
    `${gamma.toFixed(4)}（${(gamma * 100).toFixed(2)} %）`
  )
  addSharedOutputs(outputs, values, topology)

  notes.push(
    '反算按 C = I / (f_r·Vr(pp))，再就近取 E6 系列标准值，实际纹波用标准容量回算。'
  )
  notes.push(
    '中心抽头与桥式每周期补电两次，纹波频率取 2f（50 Hz 电网为 100 Hz），所需容量只有半波的一半。'
  )
  notes.push(
    '半波整流纹波大、二极管平均电流等于全部负载电流，除微小电流场合外不推荐带载使用。'
  )

  return makeSuccess(outputs, notes)
}

export const rectCalcTool: ToolDefinition = {
  manifest: {
    id: 'rect-calc',
    name: '整流滤波与电源电容',
    category: 'calc',
    description: '整流拓扑输出、纹波与滤波电容反算。',
    icon: 'CircuitBoard',
    requires: [],
    builtin: true,
    fields: [
      {
        name: 'mode',
        label: '整流方式',
        type: 'select',
        required: true,
        defaultValue: 'bridge',
        options: MODES
      },
      {
        name: 'vsec',
        label: '变压器次级电压 V₂ (V, RMS)',
        type: 'text',
        required: true,
        placeholder: '9、12、18',
        hint: '中心抽头整流按“半个绕组”的电压填写。'
      },
      {
        name: 'f',
        label: '电网频率 (Hz)',
        type: 'text',
        defaultValue: '50',
        placeholder: '50、60'
      },
      {
        name: 'vd',
        label: '单个二极管压降 Vd (V)',
        type: 'text',
        defaultValue: '0.7',
        hint: '硅 0.7 / 肖特基 0.3'
      },
      {
        name: 'iload',
        label: '负载电流 I (A)',
        type: 'text',
        required: true,
        placeholder: '0.5、200m'
      },
      {
        name: 'cap',
        label: '滤波电容 C (F)，填写则正算纹波',
        type: 'text',
        placeholder: '1000u、4700u'
      },
      {
        name: 'ripple',
        label: '目标纹波 Vr(pp) (V)，电容留空时按它反算',
        type: 'text',
        placeholder: '0.2、0.5'
      }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    // 读取整流拓扑
    const mode = ctx.getString(payload, 'mode', 'bridge')
    const topology = getTopologyInfo(mode)
    if (!topology) return makeFail(`未知整流方式：${mode}`)

    // 校验必填输入
    const vsec = readPositiveNumber(ctx, payload, 'vsec')
    const iload = readPositiveNumber(ctx, payload, 'iload')

    if (Number.isNaN(vsec)) {
      return makeFail('填变压器次级电压 V₂（RMS，如 9、12、18）')
    }
    if (Number.isNaN(iload)) {
      return makeFail('填负载电流 I（A，可用 200m 这类写法）')
    }

    // 读取默认参数
    const frequencyValue = readPositiveNumber(ctx, payload, 'f')
    const frequency = Number.isNaN(frequencyValue) ? 50 : frequencyValue
    const diodeDropValue = readNumber(ctx, payload, 'vd')
    const diodeDrop =
      Number.isFinite(diodeDropValue) && diodeDropValue >= 0
        ? diodeDropValue
        : 0.7

    // 计算公共结果
    const values = calculateBasicValues(vsec, iload, frequency, diodeDrop, topology)
    if (!values) {
      return makeFail('次级峰值低于二极管导通压降，把 V₂ 填大一些')
    }

    // 选择正算或反算
    const cap = readPositiveNumber(ctx, payload, 'cap')
    if (!Number.isNaN(cap)) {
      return calculateFromCapacitor(cap, iload, values, topology)
    }

    const ripple = readPositiveNumber(ctx, payload, 'ripple')
    if (!Number.isNaN(ripple)) {
      return calculateFromRipple(ripple, iload, values, topology)
    }

    return makeFail(
      '填写滤波电容 C 正算纹波，或留空电容并填写目标纹波反算电容'
    )
  }
}
