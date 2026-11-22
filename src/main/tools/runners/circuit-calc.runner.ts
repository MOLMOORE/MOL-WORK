import type { ToolDefinition, ToolExecutionResult } from '../types'
import { parseQty } from '../engineering'

// 常用电路公式计算

interface OutputLine {
  label: string
  value: string
}

interface CircuitInput {
  voltage: number
  current: number
  resistance: number
  resistance2: number
  capacitance: number
  inductance: number
  forwardVoltage: number
  currentMa: number
}

const MODES = [
  { label: '欧姆定律（U/I/R 求其一）', value: 'ohm' }, { label: '功率计算（P=UI）', value: 'power' },
  { label: '电阻串联', value: 'series' }, { label: '电阻并联', value: 'parallel' },
  { label: '分压电路（求 Vout）', value: 'divider' },
  { label: 'RL 时间常数', value: 'rl' }, { label: '电容储能（E=½CV²）', value: 'cap-energy' },
  { label: 'LED 限流电阻', value: 'led' }
]

const MODE_HINT: Record<string, string> = {
  ohm: '填写 电压(V)、电流(A)、电阻(Ω) 中的任意两项，自动求第三项。',
  power:
    '填写 电压(V)+电流(A)，或 电压(V)+电阻(Ω)，或 电流(A)+电阻(Ω)，计算功率与其余参数。',
  series:
    '填写 电阻(Ω) 与 电阻2(Ω) 求串联总阻值；再填 电压(V) 可一并算出回路电流。',
  parallel: '填写 电阻(Ω) 与 电阻2(Ω) 求并联等效阻值。',
  divider: '填 Vin、R1、R2，求 Vout 与分压比。',
  rl: '填 R 与 L，求时间常数 τ=L/R。',
  'cap-energy': '填写 电容(F) 与 电压(V)，输出储能 E=½CV²。',
  led: '填写 电源电压(Vs)、正向压降(Vf)、目标电流(mA)，输出限流电阻与功耗。'
}

function formatValue(value: number, unit: string, digits = 4): string {
  // 格式化数值和单位
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  let text = String(Number(value.toPrecision(digits)))
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) {
    text = value.toExponential(digits)
  }
  return `${text} ${unit}`
}

function makeOutput(label: string, value: string): OutputLine {
  return { label, value }
}

function makeSuccess(summary: string, outputs: OutputLine[]): ToolExecutionResult {
  return {
    ok: true,
    resultSummary: summary,
    outputs,
    preview: summary
  }
}

function makeFail(message: string): ToolExecutionResult {
  return { ok: false, error: message }
}

function readQuantity(
  payload: Record<string, unknown>,
  key: string
): number {
  // 读取工程量
  const parsed = parseQty(payload[key])
  return parsed === null ? Number.NaN : parsed
}

function readPlainNumber(
  payload: Record<string, unknown>,
  key: string
): number {
  // 读取普通数值
  const raw = payload[key]
  if (raw === undefined || raw === null || raw === '') return Number.NaN
  return Number(raw)
}

function readCircuitInput(payload: Record<string, unknown>): CircuitInput {
  return {
    voltage: readQuantity(payload, 'voltage'), current: readQuantity(payload, 'current'),
    resistance: readQuantity(payload, 'resistance'), resistance2: readQuantity(payload, 'resistance2'),
    capacitance: readQuantity(payload, 'capacitance'), inductance: readQuantity(payload, 'inductance'),
    forwardVoltage: readQuantity(payload, 'forwardVoltage'), currentMa: readPlainNumber(payload, 'currentMa')
  }
}

function calculateOhm(input: CircuitInput): ToolExecutionResult {
  // 根据已知两项计算第三项
  const { voltage, current, resistance } = input

  if (
    Number.isFinite(voltage) &&
    Number.isFinite(current) &&
    current !== 0
  ) {
    // 求电阻
    const answer = voltage / current
    const summary = `R = U / I = ${formatValue(answer, 'Ω')}`
    return makeSuccess(summary, [makeOutput('电压', formatValue(voltage, 'V')), makeOutput('电流', formatValue(current, 'A')), makeOutput('电阻', formatValue(answer, 'Ω'))])
  }

  if (
    Number.isFinite(voltage) &&
    Number.isFinite(resistance) &&
    resistance !== 0
  ) {
    // 求电流
    const answer = voltage / resistance
    const summary = `I = U / R = ${formatValue(answer, 'A')}`
    return makeSuccess(summary, [makeOutput('电压', formatValue(voltage, 'V')), makeOutput('电阻', formatValue(resistance, 'Ω')),
      makeOutput('电流', formatValue(answer, 'A'))])
  }

  if (Number.isFinite(current) && Number.isFinite(resistance)) {
    // 求电压
    const answer = current * resistance
    const summary = `U = I · R = ${formatValue(answer, 'V')}`
    return makeSuccess(summary, [makeOutput('电流', formatValue(current, 'A')), makeOutput('电阻', formatValue(resistance, 'Ω')), makeOutput('电压', formatValue(answer, 'V'))])
  }

  return makeFail('欧姆定律需要填写 电压/电流/电阻 中的任意两项')
}

function calculatePower(input: CircuitInput): ToolExecutionResult {
  // 根据已知两项计算功率
  const { voltage, current, resistance } = input

  if (Number.isFinite(voltage) && Number.isFinite(current)) {
    // P = UI
    const power = voltage * current
    const summary = `P = U · I = ${formatValue(power, 'W')}`

    let equivalentResistance = '—'
    if (current !== 0) {
      equivalentResistance = formatValue(voltage / current, 'Ω')
    }
    return makeSuccess(summary, [
      makeOutput('功率 P', formatValue(power, 'W')),
      makeOutput('等效电阻 R', equivalentResistance)
    ])
  }

  if (
    Number.isFinite(voltage) &&
    Number.isFinite(resistance) &&
    resistance !== 0
  ) {
    // P = U²/R
    const power = (voltage * voltage) / resistance
    const summary = `P = U² / R = ${formatValue(power, 'W')}`
    return makeSuccess(summary, [
      makeOutput('功率 P', formatValue(power, 'W')),
      makeOutput('电流 I', formatValue(voltage / resistance, 'A'))
    ])
  }

  if (Number.isFinite(current) && Number.isFinite(resistance)) {
    // P = I²R
    const power = current * current * resistance
    const summary = `P = I² · R = ${formatValue(power, 'W')}`
    return makeSuccess(summary, [
      makeOutput('功率 P', formatValue(power, 'W')),
      makeOutput('电压 U', formatValue(current * resistance, 'V'))
    ])
  }

  return makeFail('功率计算需要提供 U+I、U+R 或 I+R 组合')
}

function calculateSeries(input: CircuitInput): ToolExecutionResult {
  // 串联电阻
  const { voltage, resistance, resistance2 } = input
  if (!Number.isFinite(resistance) || !Number.isFinite(resistance2)) {
    return makeFail('电阻串联需要填写 电阻 R 与 电阻 R2')
  }

  const total = resistance + resistance2
  const summary = `R总 = R1 + R2 = ${formatValue(total, 'Ω')}`
  const outputs = [makeOutput('总电阻', formatValue(total, 'Ω'))]

  if (Number.isFinite(voltage)) {
    // 可选电流和分压
    outputs.push(
      makeOutput('回路电流', formatValue(voltage / total, 'A')),
      makeOutput('R1 分压', formatValue((voltage * resistance) / total, 'V')),
      makeOutput(
        'R2 分压',
        formatValue((voltage * resistance2) / total, 'V')
      )
    )
  }

  return makeSuccess(summary, outputs)
}

function calculateParallel(input: CircuitInput): ToolExecutionResult {
  // 并联电阻
  const { resistance, resistance2 } = input
  if (
    !Number.isFinite(resistance) ||
    !Number.isFinite(resistance2) ||
    resistance === 0 ||
    resistance2 === 0
  ) {
    return makeFail('电阻并联需要填写非零的 电阻 R 与 电阻 R2')
  }

  const total = (resistance * resistance2) / (resistance + resistance2)
  const summary = `R并 = R1·R2/(R1+R2) = ${formatValue(total, 'Ω')}`

  // 分流比
  const ratio =
    `${formatValue(resistance2 / (resistance + resistance2), '', 4)} : ` +
    `${formatValue(resistance / (resistance + resistance2), '', 4)}`

  return makeSuccess(summary, [
    makeOutput('并联等效电阻', formatValue(total, 'Ω')),
    makeOutput('分流比 R1:R2', ratio)
  ])
}

function calculateDivider(input: CircuitInput): ToolExecutionResult {
  // 分压输出
  const { voltage, resistance, resistance2 } = input
  if (
    !Number.isFinite(voltage) ||
    !Number.isFinite(resistance) ||
    !Number.isFinite(resistance2)
  ) {
    return makeFail('分压电路需要填写 电压 Vin、电阻 R1、电阻 R2')
  }

  if (resistance + resistance2 === 0) {
    return makeFail('电阻之和不能为 0')
  }

  const voltageAcrossOutput = voltage * resistance2
  const totalResistance = resistance + resistance2
  const vout = voltageAcrossOutput / totalResistance
  const summary = `Vout = Vin · R2/(R1+R2) = ${formatValue(vout, 'V')}`

  return makeSuccess(summary, [
    makeOutput('输入电压', formatValue(voltage, 'V')),
    makeOutput('输出电压 Vout', formatValue(vout, 'V')),
    makeOutput(
      '分压比',
      formatValue(resistance2 / (resistance + resistance2), '', 4)
    )
  ])
}

function calculateRl(input: CircuitInput): ToolExecutionResult {
  // RL 时间常数
  const { resistance, inductance } = input
  if (
    !Number.isFinite(resistance) ||
    !Number.isFinite(inductance) ||
    resistance === 0
  ) {
    return makeFail('RL 时间常数需要填写非零 电阻 R 与 电感 L')
  }

  const tau = inductance / resistance
  const summary = `τ = L / R = ${formatValue(tau, 's')}`

  return makeSuccess(summary, [
    makeOutput('时间常数 τ', formatValue(tau, 's')),
    makeOutput('达稳态约需', formatValue(5 * tau, 's'))
  ])
}

function calculateCapEnergy(input: CircuitInput): ToolExecutionResult {
  // 电容储能
  const { capacitance, voltage } = input
  if (!Number.isFinite(capacitance) || !Number.isFinite(voltage)) {
    return makeFail('电容储能需要填写 电容 C 与 电压 U')
  }

  const energy = 0.5 * capacitance * voltage * voltage
  const summary = `E = ½CV² = ${formatValue(energy, 'J')}`

  return makeSuccess(summary, [
    makeOutput('储能 E', formatValue(energy, 'J')),
    makeOutput('换算', `${formatValue(energy * 1000, 'mJ')}`)
  ])
}

function calculateLed(input: CircuitInput): ToolExecutionResult {
  // LED 限流电路
  const { voltage, forwardVoltage, currentMa } = input
  if (
    !Number.isFinite(voltage) ||
    !Number.isFinite(forwardVoltage) ||
    !Number.isFinite(currentMa) ||
    currentMa <= 0
  ) {
    return makeFail(
      'LED 限流需要填写 电源电压 Vs、正向压降 Vf 与 目标电流 mA'
    )
  }

  // mA 转 A
  const currentAmp = currentMa / 1000
  if (voltage - forwardVoltage <= 0) {
    return makeFail('电源电压必须高于 LED 正向压降')
  }

  const voltageOnResistor = voltage - forwardVoltage
  const resistor = voltageOnResistor / currentAmp
  const summary = `R = (Vs - Vf) / I = ${formatValue(resistor, 'Ω')}`

  return makeSuccess(summary, [
    makeOutput('限流电阻 R', formatValue(resistor, 'Ω')),
    makeOutput(
      '电阻功耗',
      formatValue(voltageOnResistor * currentAmp, 'W')
    ),
    makeOutput('建议标准阻值', `${Math.round(resistor)} Ω`)
  ])
}

export const circuitCalcTool: ToolDefinition = {
  manifest: {
    id: 'circuit-calc',
    name: '电路常用计算',
    category: 'calc',
    description: '欧姆定律、功率、串并联、分压、LED 限流与电容储能。',
    icon: 'CircuitBoard',
    requires: [],
    builtin: true,
    fields: [
      {
        name: 'mode',
        label: '计算类型',
        type: 'select',
        required: true,
        defaultValue: 'ohm',
        options: MODES
      },
      {
        name: 'voltage',
        label: '电压 U (V)',
        type: 'text',
        placeholder: '12'
      },
      {
        name: 'current',
        label: '电流 I (A)',
        type: 'text',
        placeholder: '0.5、20m'
      },
      {
        name: 'resistance',
        label: '电阻 R (Ω)',
        type: 'text',
        placeholder: '1k、4m7'
      },
      {
        name: 'resistance2',
        label: '电阻 R2 (Ω)',
        type: 'text',
        placeholder: '串并联 / 分压时填'
      },
      {
        name: 'capacitance',
        label: '电容 C (F)',
        type: 'text',
        placeholder: '100n、1u'
      },
      {
        name: 'inductance',
        label: '电感 L (H)',
        type: 'text',
        placeholder: '1m、4u7'
      },
      {
        name: 'forwardVoltage',
        label: 'LED 正向压降 Vf (V)',
        type: 'text',
        placeholder: '2'
      },
      {
        name: 'currentMa',
        label: 'LED 目标电流 (mA)',
        type: 'text',
        placeholder: '20'
      }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    // 按模式分发
    const mode = ctx.getString(payload, 'mode', 'ohm')
    const input = readCircuitInput(payload)

    if (mode === 'ohm') return calculateOhm(input)
    if (mode === 'power') return calculatePower(input)
    if (mode === 'series') return calculateSeries(input)
    if (mode === 'parallel') return calculateParallel(input)
    if (mode === 'divider') return calculateDivider(input)
    if (mode === 'rl') return calculateRl(input)
    if (mode === 'cap-energy') return calculateCapEnergy(input)
    if (mode === 'led') return calculateLed(input)

    return makeFail(`未知计算类型：${mode}`)
  }
}
