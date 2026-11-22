import type { ToolContext, ToolDefinition, ToolExecutionResult } from '../types'
import { fmtOhm, fmtQty, fmtVolt, fmtWatt, parseQty } from '../engineering'

// PCB 走线宽度计算

interface OutputLine {
  label: string
  value: string
}

interface LayerInfo {
  isInner: boolean
  k: number
  shortName: string
  longText: string
}

interface TraceSize {
  areaMil2: number
  thicknessMil: number
  widthMil: number
  widthMm: number
}

// 可选铜厚
const COPPER_OPTIONS = [
  { label: '0.5 oz（17.5 µm）', value: '0.5' }, { label: '1 oz（35 µm）', value: '1' },
  { label: '2 oz（70 µm）', value: '2' }, { label: '3 oz（105 µm）', value: '3' }
]

const COPPER_OUNCE = { '0.5': 0.5, '1': 1, '2': 2, '3': 3 } as const

const EXTERNAL_K = 0.048
const INTERNAL_K = 0.024
const MIL_TO_MM = 0.0254
const ONE_OUNCE_TO_MIL = 1.37
const COPPER_RESISTIVITY = 1.72e-8
const DEFAULT_TEMPERATURE_RISE = 10
const SQUARE_MIL_TO_SQUARE_M = 2.54e-5 * 2.54e-5

function addOutput(outputs: OutputLine[], label: string, value: string): void {
  outputs.push({ label, value })
}

function makeFail(message: string): ToolExecutionResult {
  return { ok: false, error: message }
}

function readPositiveNumber(value: unknown): number {
  const number = parseQty(value)
  if (number === null || !Number.isFinite(number) || number <= 0) {
    return Number.NaN
  }
  return number
}

function readCopperOunce(value: string): number {
  // 未识别的铜厚按 1 oz 处理
  if (value === '0.5') return COPPER_OUNCE['0.5']
  if (value === '1') return COPPER_OUNCE['1']
  if (value === '2') return COPPER_OUNCE['2']
  if (value === '3') return COPPER_OUNCE['3']
  return COPPER_OUNCE['1']
}

function readTemperatureRise(value: string): number {
  // 无效温升使用默认值
  const number = parseQty(value)
  if (number === null || !Number.isFinite(number) || number <= 0) {
    return DEFAULT_TEMPERATURE_RISE
  }
  return number
}

function getLayerInfo(layer: string): LayerInfo {
  // 内层使用较小的散热系数
  if (layer === 'int') {
    return {
      isInner: true,
      k: INTERNAL_K,
      shortName: '内层',
      longText: '内层 · 散热差，同电流需更宽（k = 0.024）'
    }
  }

  return {
    isInner: false,
    k: EXTERNAL_K,
    shortName: '外层',
    longText: '外层 · 散热好（k = 0.048）'
  }
}

function calculateTraceSize(
  currentAmp: number,
  temperatureRise: number,
  copperOunce: number,
  k: number
): TraceSize {
  // 温升和层系数
  const heatFactor = k * temperatureRise ** 0.44

  // 反算截面积
  const currentDensity = currentAmp / heatFactor
  const areaMil2 = currentDensity ** (1 / 0.725)

  // 截面积转换为线宽
  const thicknessMil = copperOunce * ONE_OUNCE_TO_MIL
  const widthMil = areaMil2 / thicknessMil
  const widthMm = widthMil * MIL_TO_MM

  return {
    areaMil2,
    thicknessMil,
    widthMil,
    widthMm
  }
}

function addResistanceOutputs(
  outputs: OutputLine[],
  currentAmp: number,
  lengthMm: number,
  areaMil2: number
): void {
  // 统一为米制单位
  const areaM2 = areaMil2 * SQUARE_MIL_TO_SQUARE_M
  const lengthMeter = lengthMm / 1000

  // 计算电阻、压降和功耗
  const resistanceOhm = (COPPER_RESISTIVITY * lengthMeter) / areaM2

  addOutput(outputs, '走线电阻', fmtOhm(resistanceOhm)); addOutput(outputs, '压降', fmtVolt(currentAmp * resistanceOhm))
  addOutput(outputs, '损耗功率', fmtWatt(currentAmp * currentAmp * resistanceOhm))
}

function readCurrent(ctx: ToolContext, payload: Record<string, unknown>): number {
  return readPositiveNumber(ctx.getString(payload, 'current'))
}

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
      {
        name: 'current',
        label: '目标电流 I (A)',
        type: 'text',
        required: true,
        placeholder: '0.5、2'
      },
      {
        name: 'copper',
        label: '铜厚',
        type: 'select',
        required: true,
        defaultValue: '1',
        options: COPPER_OPTIONS
      },
      {
        name: 'rise',
        label: '允许温升 ΔT (°C)',
        type: 'text',
        placeholder: '默认 10',
        defaultValue: '10'
      },
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
      {
        name: 'length',
        label: '走线长度 L (mm)，选填算电阻压降',
        type: 'text',
        placeholder: '50、200'
      }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    // 电流必填
    const currentAmp = readCurrent(ctx, payload)
    if (Number.isNaN(currentAmp)) {
      return makeFail('填写目标电流，如 0.5 或 200m')
    }

    // 读取铜厚、温升和层位
    const copperText = ctx.getString(payload, 'copper', '1')
    const riseText = ctx.getString(payload, 'rise')
    const layerText = ctx.getString(payload, 'layer', 'ext')
    const copperOunce = readCopperOunce(copperText)
    const temperatureRise = readTemperatureRise(riseText)
    const layer = getLayerInfo(layerText)

    // 计算截面积和线宽
    const size = calculateTraceSize(currentAmp, temperatureRise, copperOunce, layer.k)

    const outputs: OutputLine[] = []
    const notes: string[] = []

    // 固定结果顺序
    addOutput(
      outputs,
      '建议宽度',
      `${size.widthMm.toFixed(2)} mm（${fmtQty(size.widthMil, 'mil')}）`
    )
    const areaMm2 = (size.areaMil2 * MIL_TO_MM ** 2).toPrecision(3)
    addOutput(
      outputs,
      '截面积',
      `${fmtQty(size.areaMil2, 'mil²')} ≈ ${areaMm2} mm²`
    )
    addOutput(
      outputs,
      '铜厚',
      `${copperOunce} oz ≈ ${fmtQty(copperOunce * 35, 'µm')}（t = ${fmtQty(size.thicknessMil, 'mil')}）`
    )
    addOutput(outputs, '层位', layer.longText)
    addOutput(
      outputs,
      '输入回显',
      `I = ${fmtQty(currentAmp, 'A')}，ΔT = ${temperatureRise} °C`
    )

    // 长度选填
    const lengthText = ctx.getString(payload, 'length')
    const lengthMm = readPositiveNumber(lengthText)
    if (!Number.isNaN(lengthMm)) {
      addResistanceOutputs(outputs, currentAmp, lengthMm, size.areaMil2)
      notes.push('电阻按 ρ铜 = 1.72×10⁻⁸ Ω·m（20 ℃）估算，25 ℃ 修正可忽略。')
    }

    notes.push(
      '经验式 I = k·ΔT^0.44·A^0.725（IPC-2221）：A 为截面积 mil²，外层 k = 0.048、内层 k = 0.024。'
    )
    notes.push(
      '工程建议：把宽度向上取整到 0.1 mm 的下一档再复核；高频信号线还要看阻抗，不是只看载流。'
    )

    // 生成结果摘要
    const widthText = size.widthMm.toFixed(2)
    const summary =
      `建议宽度 ≈ ${widthText} mm` +
      `（${layer.shortName} ${copperOunce} oz · ΔT ${temperatureRise} °C）`
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
}
