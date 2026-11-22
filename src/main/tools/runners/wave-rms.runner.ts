import type { ToolDefinition, ToolExecutionResult } from '../types'
import { fmtSeconds, fmtVolt, parseQty } from '../engineering'

// 交流波形有效值换算

interface WaveShape {
  name: string
  rmsDiv: number
  avgDiv: number
}

interface WaveResult {
  peak: number
  peakToPeak: number
  rms: number
  average: number
  formFactor: number
  crestFactor: number
}

interface OutputLine {
  label: string
  value: string
}

const WAVE_SHAPES: Record<string, WaveShape> = {
  // 峰值除数，用于计算 RMS 和平均值
  sine: { name: '正弦', rmsDiv: Math.SQRT2, avgDiv: Math.PI / 2 },
  square: { name: '方波', rmsDiv: 1, avgDiv: 1 },
  triangle: { name: '三角', rmsDiv: Math.sqrt(3), avgDiv: 2 },
  sawtooth: { name: '锯齿', rmsDiv: Math.sqrt(3), avgDiv: 2 }
}

function getWaveShape(wave: string): WaveShape {
  // 未知波形按正弦处理
  if (wave === 'square') return WAVE_SHAPES.square
  if (wave === 'triangle') return WAVE_SHAPES.triangle
  if (wave === 'sawtooth') return WAVE_SHAPES.sawtooth
  return WAVE_SHAPES.sine
}

function makeFail(message: string): ToolExecutionResult {
  return { ok: false, error: message }
}

function convertToPeak(value: number, spec: string, shape: WaveShape): number {
  // 输入统一转换为峰值
  if (spec === 'pp') {
    return value / 2
  }

  if (spec === 'rms') {
    return value * shape.rmsDiv
  }

  return value
}

function calculateWave(
  inputValue: number,
  spec: string,
  shape: WaveShape
): WaveResult {
  const peak = convertToPeak(inputValue, spec, shape)

  // 有效值
  const rms = peak / shape.rmsDiv

  // 全波整流平均值
  const average = peak / shape.avgDiv

  return {
    peak,
    peakToPeak: peak * 2,
    rms,
    average,
    formFactor: rms / average,
    crestFactor: peak / rms
  }
}

function addOutput(outputs: OutputLine[], label: string, value: string): void {
  outputs.push({ label, value })
}

function makeWaveNote(shape: WaveShape): string {
  // 万用表读数说明
  return (
    `${shape.name}波形：Vavg 是全波整流后的平均值，不是 RMS。` +
    '多数万用表 AC 档按“整流均值 × 1.111 = 正弦有效值”刻度，' +
    '测非正弦波形会有偏差（三角/锯齿 kf = 1.155，读数约低 4%），' +
    '真有效值 = 表读数 × 本波形 kf ÷ 1.111。'
  )
}

export const waveRmsTool: ToolDefinition = {
  manifest: {
    id: 'wave-rms',
    name: '交流波形有效值换算',
    category: 'calc',
    description: '正弦/方波/三角/锯齿的峰值、有效值、整流平均值与波形因数、峰值因数。',
    icon: 'Activity',
    requires: [],
    builtin: true,
    fields: [
      {
        name: 'wave',
        label: '波形',
        type: 'select',
        required: true,
        defaultValue: 'sine',
        options: [
          { label: '正弦', value: 'sine' },
          { label: '方波', value: 'square' },
          { label: '三角', value: 'triangle' },
          { label: '锯齿', value: 'sawtooth' }
        ]
      },
      {
        name: 'spec',
        label: '已知规格',
        type: 'select',
        required: true,
        defaultValue: 'pk',
        options: [
          { label: '按峰值 Vpk', value: 'pk' },
          { label: '按峰峰 Vpp', value: 'pp' },
          { label: '按有效值 Vrms', value: 'rms' }
        ]
      },
      {
        name: 'value',
        label: '数值 (V)',
        type: 'text',
        required: true,
        placeholder: '311、5、0.7'
      },
      {
        name: 'freq',
        label: '频率 (Hz)，选填仅用于周期展示',
        type: 'text',
        placeholder: '50、1k'
      }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    // 读取波形和输入规格
    const wave = ctx.getString(payload, 'wave', 'sine')

    const spec = ctx.getString(payload, 'spec', 'pk')
    const shape = getWaveShape(wave)

    // 校验电压输入
    const inputValue = parseQty(ctx.getString(payload, 'value'))
    if (
      inputValue === null ||
      !Number.isFinite(inputValue) ||
      inputValue <= 0
    ) {
      return makeFail('填写电压数值，如 311、5 或 700m')
    }

    const result = calculateWave(inputValue, spec, shape)
    const outputs: OutputLine[] = []
    const notes: string[] = []

    // 输出顺序固定
    addOutput(outputs, '峰值 Vpk', fmtVolt(result.peak))
    addOutput(outputs, '峰峰 Vpp', fmtVolt(result.peakToPeak))
    addOutput(outputs, '有效值 Vrms', fmtVolt(result.rms))
    addOutput(outputs, '整流平均值 Vavg', fmtVolt(result.average))
    addOutput(outputs, '波形因数 kf', result.formFactor.toFixed(4))
    addOutput(outputs, '峰值因数 kpk', result.crestFactor.toFixed(4))

    const freq = parseQty(ctx.getString(payload, 'freq'))
    if (freq !== null && Number.isFinite(freq) && freq > 0) addOutput(outputs, '周期 T', fmtSeconds(1 / freq))

    notes.push(makeWaveNote(shape))

    // 摘要优先使用有效值
    let rmsOutput = outputs[0]
    for (const item of outputs) {
      if (item.label === '有效值 Vrms') {
        rmsOutput = item
        break
      }
    }

    const summary = `${rmsOutput.label} = ${rmsOutput.value}`
    const otherLines = outputs
      .filter((item) => item !== rmsOutput)
      .map((item) => `${item.label}：${item.value}`)
    const preview = [summary, ...otherLines, '', ...notes].join('\n')

    return { ok: true, resultSummary: summary, outputs, preview }
  }
}
