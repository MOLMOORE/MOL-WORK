import type { ToolDefinition, ToolExecutionResult } from '../types'
import { parseQty } from '../engineering'

const MODES = [
  { label: '欧姆定律（U/I/R 求其一）', value: 'ohm' },
  { label: '功率计算（P=UI）', value: 'power' },
  { label: '电阻串联', value: 'series' },
  { label: '电阻并联', value: 'parallel' },
  { label: '分压电路（求 Vout）', value: 'divider' },
  { label: 'RL 时间常数', value: 'rl' },
  { label: '电容储能（E=½CV²）', value: 'cap-energy' },
  { label: 'LED 限流电阻', value: 'led' }
]

const MODE_HINT: Record<string, string> = {
  ohm: '填写 电压(V)、电流(A)、电阻(Ω) 中的任意两项，自动求第三项。',
  power: '填写 电压(V)+电流(A)，或 电压(V)+电阻(Ω)，或 电流(A)+电阻(Ω)，计算功率与其余参数。',
  series: '填写 电阻(Ω) 与 电阻2(Ω) 求串联总阻值；再填 电压(V) 可一并算出回路电流。',
  parallel: '填写 电阻(Ω) 与 电阻2(Ω) 求并联等效阻值。',
  divider: '填 Vin、R1、R2，求 Vout 与分压比。',
  rl: '填 R 与 L，求时间常数 τ=L/R。',
  'cap-energy': '填写 电容(F) 与 电压(V)，输出储能 E=½CV²。',
  led: '填写 电源电压(Vs)、正向压降(Vf)、目标电流(mA)，输出限流电阻与功耗。'
}

function fmt(value: number, unit: string, digits = 4): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const text = abs !== 0 && (abs >= 1e6 || abs < 1e-3) ? value.toExponential(digits) : String(Number(value.toPrecision(digits)))
  return `${text} ${unit}`
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
      { name: 'mode', label: '计算类型', type: 'select', required: true, defaultValue: 'ohm', options: MODES },
      { name: 'voltage', label: '电压 U (V)', type: 'text', placeholder: '12' },
      { name: 'current', label: '电流 I (A)', type: 'text', placeholder: '0.5、20m' },
      { name: 'resistance', label: '电阻 R (Ω)', type: 'text', placeholder: '1k、4m7' },
      { name: 'resistance2', label: '电阻 R2 (Ω)', type: 'text', placeholder: '串并联 / 分压时填' },
      { name: 'capacitance', label: '电容 C (F)', type: 'text', placeholder: '100n、1u' },
      { name: 'inductance', label: '电感 L (H)', type: 'text', placeholder: '1m、4u7' },
      { name: 'forwardVoltage', label: 'LED 正向压降 Vf (V)', type: 'text', placeholder: '2' },
      { name: 'currentMa', label: 'LED 目标电流 (mA)', type: 'text', placeholder: '20' }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'ohm')
    const num = (key: string): number => {
      const parsed = parseQty(payload[key])
      return parsed === null ? Number.NaN : parsed
    }
    const plain = (key: string): number => {
      const raw = payload[key]
      if (raw === undefined || raw === null || raw === '') return Number.NaN
      return Number(raw)
    }
    const U = num('voltage')
    const I = num('current')
    const R = num('resistance')
    const R2 = num('resistance2')
    const C = num('capacitance')
    const L = num('inductance')
    const Vf = num('forwardVoltage')
    const ImA = plain('currentMa')

    const outputs: { label: string; value: string }[] = []
    let summary = ''

    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })

    switch (mode) {
      case 'ohm': {
        if (Number.isFinite(U) && Number.isFinite(I) && I !== 0) {
          summary = `R = U / I = ${fmt(U / I, 'Ω')}`
          outputs.push({ label: '电压', value: fmt(U, 'V') }, { label: '电流', value: fmt(I, 'A') }, { label: '电阻', value: fmt(U / I, 'Ω') })
        } else if (Number.isFinite(U) && Number.isFinite(R) && R !== 0) {
          summary = `I = U / R = ${fmt(U / R, 'A')}`
          outputs.push({ label: '电压', value: fmt(U, 'V') }, { label: '电阻', value: fmt(R, 'Ω') }, { label: '电流', value: fmt(U / R, 'A') })
        } else if (Number.isFinite(I) && Number.isFinite(R)) {
          summary = `U = I · R = ${fmt(I * R, 'V')}`
          outputs.push({ label: '电流', value: fmt(I, 'A') }, { label: '电阻', value: fmt(R, 'Ω') }, { label: '电压', value: fmt(I * R, 'V') })
        } else {
          return fail('欧姆定律需要填写 电压/电流/电阻 中的任意两项')
        }
        break
      }
      case 'power': {
        if (Number.isFinite(U) && Number.isFinite(I)) {
          summary = `P = U · I = ${fmt(U * I, 'W')}`
          outputs.push({ label: '功率 P', value: fmt(U * I, 'W') }, { label: '等效电阻 R', value: I !== 0 ? fmt(U / I, 'Ω') : '—' })
        } else if (Number.isFinite(U) && Number.isFinite(R) && R !== 0) {
          const power = (U * U) / R
          summary = `P = U² / R = ${fmt(power, 'W')}`
          outputs.push({ label: '功率 P', value: fmt(power, 'W') }, { label: '电流 I', value: fmt(U / R, 'A') })
        } else if (Number.isFinite(I) && Number.isFinite(R)) {
          const power = I * I * R
          summary = `P = I² · R = ${fmt(power, 'W')}`
          outputs.push({ label: '功率 P', value: fmt(power, 'W') }, { label: '电压 U', value: fmt(I * R, 'V') })
        } else {
          return fail('功率计算需要提供 U+I、U+R 或 I+R 组合')
        }
        break
      }
      case 'series': {
        if (!Number.isFinite(R) || !Number.isFinite(R2)) return fail('电阻串联需要填写 电阻 R 与 电阻 R2')
        const total = R + R2
        summary = `R总 = R1 + R2 = ${fmt(total, 'Ω')}`
        outputs.push({ label: '总电阻', value: fmt(total, 'Ω') })
        if (Number.isFinite(U)) {
          outputs.push({ label: '回路电流', value: fmt(U / total, 'A') }, { label: 'R1 分压', value: fmt((U * R) / total, 'V') }, { label: 'R2 分压', value: fmt((U * R2) / total, 'V') })
        }
        break
      }
      case 'parallel': {
        if (!Number.isFinite(R) || !Number.isFinite(R2) || R === 0 || R2 === 0) return fail('电阻并联需要填写非零的 电阻 R 与 电阻 R2')
        const total = (R * R2) / (R + R2)
        summary = `R并 = R1·R2/(R1+R2) = ${fmt(total, 'Ω')}`
        outputs.push({ label: '并联等效电阻', value: fmt(total, 'Ω') }, { label: '分流比 R1:R2', value: `${fmt(R2 / (R + R2), '', 4)} : ${fmt(R / (R + R2), '', 4)}` })
        break
      }
      case 'divider': {
        if (!Number.isFinite(U) || !Number.isFinite(R) || !Number.isFinite(R2)) return fail('分压电路需要填写 电压 Vin、电阻 R1、电阻 R2')
        if (R + R2 === 0) return fail('电阻之和不能为 0')
        const vout = (U * R2) / (R + R2)
        summary = `Vout = Vin · R2/(R1+R2) = ${fmt(vout, 'V')}`
        outputs.push({ label: '输入电压', value: fmt(U, 'V') }, { label: '输出电压 Vout', value: fmt(vout, 'V') }, { label: '分压比', value: fmt(R2 / (R + R2), '', 4) })
        break
      }
      case 'rl': {
        if (!Number.isFinite(R) || !Number.isFinite(L) || R === 0) return fail('RL 时间常数需要填写非零 电阻 R 与 电感 L')
        const tau = L / R
        summary = `τ = L / R = ${fmt(tau, 's')}`
        outputs.push({ label: '时间常数 τ', value: fmt(tau, 's') }, { label: '达稳态约需', value: fmt(5 * tau, 's') })
        break
      }
      case 'cap-energy': {
        if (!Number.isFinite(C) || !Number.isFinite(U)) return fail('电容储能需要填写 电容 C 与 电压 U')
        const energy = 0.5 * C * U * U
        summary = `E = ½CV² = ${fmt(energy, 'J')}`
        outputs.push({ label: '储能 E', value: fmt(energy, 'J') }, { label: '换算', value: `${fmt(energy * 1000, 'mJ')}` })
        break
      }
      case 'led': {
        if (!Number.isFinite(U) || !Number.isFinite(Vf) || !Number.isFinite(ImA) || ImA <= 0) {
          return fail('LED 限流需要填写 电源电压 Vs、正向压降 Vf 与 目标电流 mA')
        }
        const amps = ImA / 1000
        if (U - Vf <= 0) return fail('电源电压必须高于 LED 正向压降')
        const resistor = (U - Vf) / amps
        summary = `R = (Vs - Vf) / I = ${fmt(resistor, 'Ω')}`
        outputs.push(
          { label: '限流电阻 R', value: fmt(resistor, 'Ω') },
          { label: '电阻功耗', value: fmt((U - Vf) * amps, 'W') },
          { label: '建议标准阻值', value: `${Math.round(resistor)} Ω` }
        )
        break
      }
      default:
        return fail(`未知计算类型：${mode}`)
    }

    return { ok: true, resultSummary: summary, outputs, preview: summary }
  }
}
