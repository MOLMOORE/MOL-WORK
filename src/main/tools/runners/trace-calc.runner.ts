import type { ToolDefinition, ToolExecutionResult } from '../types'
import { fmtOhm, fmtQty, fmtVolt, fmtWatt, parseQty } from '../engineering'

/**
 * PCB 走线载流宽度速算（IPC-2221 经验式）。
 * 公式出处：I = k · ΔT^0.44 · A^0.725，A 为走线截面积（mil²），外层 k = 0.048、内层 k = 0.024；
 * 1 oz 铜厚 ≈ 1.37 mil = 35 µm。这是业界通用近似式（与 Saturn PCB Toolkit / UltraLibrarian 的计算式同源）。
 * 由电流与温升反解截面积 A = (I / (k · ΔT^0.44))^(1/0.725)，再除以厚度 t = oz × 1.37 mil 得宽度。
 * 电阻与压降按 ρ铜 = 1.72e-8 Ω·m（20 ℃，25 ℃ 修正可忽略），A_mil2 → m² 换算 ×(2.54e-5)²。
 */

const COPPER_OPTIONS = [
  { label: '0.5 oz（17.5 µm）', value: '0.5' },
  { label: '1 oz（35 µm）', value: '1' },
  { label: '2 oz（70 µm）', value: '2' },
  { label: '3 oz（105 µm）', value: '3' }
]

const COPPER_OZ: Record<string, number> = { '0.5': 0.5, '1': 1, '2': 2, '3': 3 }

const K_EXTERNAL = 0.048
const K_INTERNAL = 0.024
const MIL_TO_MM = 0.0254
const OZ_TO_MIL = 1.37
const RHO_COPPER = 1.72e-8
const DEFAULT_DT = 10

export const traceCalcTool: ToolDefinition = {
  manifest: {
    id: 'trace-calc',
    name: 'PCB 走线宽度速算',
    category: 'calc',
    description: '按电流、温升、铜厚与层位估算走线宽度，选填长度算电阻压降。',
    icon: 'Ruler',
    requires: [],
    builtin: true,
    fields: [
      { name: 'current', label: '目标电流 I (A)', type: 'text', required: true, placeholder: '0.5、2' },
      { name: 'copper', label: '铜厚', type: 'select', required: true, defaultValue: '1', options: COPPER_OPTIONS },
      { name: 'rise', label: '允许温升 ΔT (°C)', type: 'text', placeholder: '默认 10', defaultValue: '10' },
      {
        name: 'layer',
        label: '走线层位',
        type: 'select',
        required: true,
        defaultValue: 'ext',
        hint: '内层散热差需更宽',
        options: [
          { label: '外层', value: 'ext' },
          { label: '内层', value: 'int' }
        ]
      },
      { name: 'length', label: '走线长度 L (mm)，选填算电阻压降', type: 'text', placeholder: '50、200' }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const add = (label: string, value: string): void => {
      outputs.push({ label, value })
    }

    const amps = parseQty(ctx.getString(payload, 'current'))
    if (amps === null || !Number.isFinite(amps) || amps <= 0) return fail('填写目标电流，如 0.5 或 200m')

    const copperOz = COPPER_OZ[ctx.getString(payload, 'copper', '1')] ?? 1
    const riseParsed = parseQty(ctx.getString(payload, 'rise'))
    const dT = riseParsed !== null && Number.isFinite(riseParsed) && riseParsed > 0 ? riseParsed : DEFAULT_DT
    const internal = ctx.getString(payload, 'layer', 'ext') === 'int'
    const k = internal ? K_INTERNAL : K_EXTERNAL

    const aMil2 = (amps / (k * dT ** 0.44)) ** (1 / 0.725)
    const tMil = copperOz * OZ_TO_MIL
    const wMil = aMil2 / tMil
    const wMm = wMil * MIL_TO_MM

    add('建议宽度', `${wMm.toFixed(2)} mm（${fmtQty(wMil, 'mil')}）`)
    add('截面积', `${fmtQty(aMil2, 'mil²')} ≈ ${(aMil2 * MIL_TO_MM ** 2).toPrecision(3)} mm²`)
    add('铜厚', `${copperOz} oz ≈ ${fmtQty(copperOz * 35, 'µm')}（t = ${fmtQty(tMil, 'mil')}）`)
    add('层位', internal ? '内层 · 散热差，同电流需更宽（k = 0.024）' : '外层 · 散热好（k = 0.048）')
    add('输入回显', `I = ${fmtQty(amps, 'A')}，ΔT = ${dT} °C`)

    const lengthMm = parseQty(ctx.getString(payload, 'length'))
    if (lengthMm !== null && Number.isFinite(lengthMm) && lengthMm > 0) {
      const areaM2 = aMil2 * (2.54e-5 * 2.54e-5)
      const resistance = (RHO_COPPER * (lengthMm / 1000)) / areaM2
      add('走线电阻', fmtOhm(resistance))
      add('压降', fmtVolt(amps * resistance))
      add('损耗功率', fmtWatt(amps * amps * resistance))
      notes.push('电阻按 ρ铜 = 1.72×10⁻⁸ Ω·m（20 ℃）估算，25 ℃ 修正可忽略。')
    }

    notes.push('经验式 I = k·ΔT^0.44·A^0.725（IPC-2221）：A 为截面积 mil²，外层 k = 0.048、内层 k = 0.024。')
    notes.push('工程建议：把宽度向上取整到 0.1 mm 的下一档再复核；高频信号线还要看阻抗，不是只看载流。')

    const summary = `建议宽度 ≈ ${wMm.toFixed(2)} mm（${internal ? '内层' : '外层'} ${copperOz} oz · ΔT ${dT} °C）`
    const preview = [summary, ...outputs.slice(1).map((item) => `${item.label}：${item.value}`), '', ...notes].join('\n')
    return { ok: true, resultSummary: summary, outputs, preview }
  }
}