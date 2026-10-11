import type { ToolDefinition, ToolExecutionResult } from '../types'
import { fmtSeconds, fmtVolt, parseQty } from '../engineering'

/**
 * 交流波形有效值换算。
 * 公式为教材标准结果：
 * 正弦 Vrms = Vpk/√2，全波整流平均值 = (2/π)·Vpk；
 * 方波 Vrms = Vpk，整流平均值 = Vpk；
 * 三角与锯齿 Vrms = Vpk/√3，整流平均值 = Vpk/2。
 * 波形因数 kf = Vrms/Vavg，峰值因数 kpk = Vpk/Vrms。
 */

interface ShapeConstants {
  /** 波形中文名 */
  name: string
  /** Vrms = Vpk / rmsDiv */
  rmsDiv: number
  /** 全波整流平均值 Vavg = Vpk / avgDiv */
  avgDiv: number
}

const SHAPE: Record<string, ShapeConstants> = {
  sine: { name: '正弦', rmsDiv: Math.SQRT2, avgDiv: Math.PI / 2 },
  square: { name: '方波', rmsDiv: 1, avgDiv: 1 },
  triangle: { name: '三角', rmsDiv: Math.sqrt(3), avgDiv: 2 },
  sawtooth: { name: '锯齿', rmsDiv: Math.sqrt(3), avgDiv: 2 }
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
      { name: 'value', label: '数值 (V)', type: 'text', required: true, placeholder: '311、5、0.7' },
      { name: 'freq', label: '频率 (Hz)，选填仅用于周期展示', type: 'text', placeholder: '50、1k' }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const wave = ctx.getString(payload, 'wave', 'sine')
    const spec = ctx.getString(payload, 'spec', 'pk')
    const shape = SHAPE[wave] ?? SHAPE.sine
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const add = (label: string, value: string): void => {
      outputs.push({ label, value })
    }
    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })

    const value = parseQty(ctx.getString(payload, 'value'))
    if (value === null || !Number.isFinite(value) || value <= 0) return fail('填写电压数值，如 311、5 或 700m')
    const pk = spec === 'pp' ? value / 2 : spec === 'rms' ? value * shape.rmsDiv : value
    const rms = pk / shape.rmsDiv
    const avg = pk / shape.avgDiv
    add('峰值 Vpk', fmtVolt(pk))
    add('峰峰 Vpp', fmtVolt(pk * 2))
    add('有效值 Vrms', fmtVolt(rms))
    add('整流平均值 Vavg', fmtVolt(avg))
    add('波形因数 kf', (rms / avg).toFixed(4))
    add('峰值因数 kpk', (pk / rms).toFixed(4))
    const freq = parseQty(ctx.getString(payload, 'freq'))
    if (freq !== null && Number.isFinite(freq) && freq > 0) add('周期 T', fmtSeconds(1 / freq))
    notes.push(
      `${shape.name}波形：Vavg 是全波整流后的平均值，不是 RMS。多数万用表 AC 档按“整流均值 × 1.111 = 正弦有效值”刻度，测非正弦波形会有偏差（三角/锯齿 kf = 1.155，读数约低 4%），真有效值 = 表读数 × 本波形 kf ÷ 1.111。`
    )

    const rmsOutput = outputs.find((item) => item.label === '有效值 Vrms') ?? outputs[0]
    const summary = `${rmsOutput.label} = ${rmsOutput.value}`
    const preview = [summary, ...outputs.filter((item) => item !== rmsOutput).map((item) => `${item.label}：${item.value}`), '', ...notes].join('\n')
    return { ok: true, resultSummary: summary, outputs, preview }
  }
}
