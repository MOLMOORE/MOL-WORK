import type { ToolDefinition, ToolExecutionResult } from '../types'
import { E6, fmtFarad, fmtHz, fmtQty, fmtVolt, nearestSeries, parseQty, standardText } from '../engineering'

/**
 * 整流与滤波电容速算。
 * 关系式（教材标准近似：电容充放电按三角波、负载电流视为恒定）：
 *   Vpk = √2·V₂；纹波频率 f_r：半波 = f，中心抽头 / 桥式全波 = 2f；
 *   Vdc ≈ Vpk − 导通压降（半波与中心抽头每半周 1 只管，桥式串 2 只管）；
 *   Vr(pp) = I / (f_r·C)，Vr(rms) ≈ Vr(pp)/(2√3)，纹波系数 γ = Vr(rms)/Vdc；
 *   二极管反压 PIV：半波 ≈ 2Vpk、中心抽头 ≈ 2Vpk、桥式 ≈ Vpk；
 *   二极管平均电流：半波 = I，中心抽头 / 桥式 = I/2。
 * 电容容量按 E6 系列就近取值（电容常用系列，见 engineering.ts）。
 */

const MODES = [
  { label: '半波整流', value: 'half' },
  { label: '全波中心抽头', value: 'ct' },
  { label: '桥式全波', value: 'bridge' }
]

const MODE_NAMES: Record<string, string> = {
  half: '半波整流',
  ct: '全波中心抽头整流',
  bridge: '桥式全波整流'
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
      { name: 'mode', label: '整流方式', type: 'select', required: true, defaultValue: 'bridge', options: MODES },
      {
        name: 'vsec',
        label: '变压器次级电压 V₂ (V, RMS)',
        type: 'text',
        required: true,
        placeholder: '9、12、18',
        hint: '中心抽头整流按“半个绕组”的电压填写。'
      },
      { name: 'f', label: '电网频率 (Hz)', type: 'text', defaultValue: '50', placeholder: '50、60' },
      { name: 'vd', label: '单个二极管压降 Vd (V)', type: 'text', defaultValue: '0.7', hint: '硅 0.7 / 肖特基 0.3' },
      { name: 'iload', label: '负载电流 I (A)', type: 'text', required: true, placeholder: '0.5、200m' },
      { name: 'cap', label: '滤波电容 C (F)，填写则正算纹波', type: 'text', placeholder: '1000u、4700u' },
      { name: 'ripple', label: '目标纹波 Vr(pp) (V)，电容留空时按它反算', type: 'text', placeholder: '0.2、0.5' }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'bridge')
    const num = (key: string): number => {
      const parsed = parseQty(ctx.getString(payload, key))
      return parsed === null ? Number.NaN : parsed
    }
    const pos = (key: string): number => {
      const value = num(key)
      return Number.isFinite(value) && value > 0 ? value : Number.NaN
    }
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const add = (label: string, value: string): void => {
      outputs.push({ label, value })
    }
    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })

    const topology = MODE_NAMES[mode]
    if (!topology) return fail(`未知整流方式：${mode}`)
    const vsec = pos('vsec')
    const iload = pos('iload')
    if (Number.isNaN(vsec)) return fail('填变压器次级电压 V₂（RMS，如 9、12、18）')
    if (Number.isNaN(iload)) return fail('填负载电流 I（A，可用 200m 这类写法）')
    const line = pos('f')
    const f = Number.isNaN(line) ? 50 : line
    const vdRaw = num('vd')
    const vd = Number.isFinite(vdRaw) && vdRaw >= 0 ? vdRaw : 0.7

    const vpk = Math.SQRT2 * vsec
    const fr = mode === 'half' ? f : 2 * f
    const vdc = vpk - (mode === 'bridge' ? 2 * vd : vd)
    if (vdc <= 0) return fail('次级峰值低于二极管导通压降，把 V₂ 填大一些')
    const piv = mode === 'bridge' ? vpk : 2 * vpk
    const diodeAvg = mode === 'half' ? iload : iload / 2
    const cap = pos('cap')
    const ripple = pos('ripple')

    const addShared = (): void => {
      add('二极管反压 PIV', fmtVolt(piv))
      add('二极管平均电流', fmtQty(diodeAvg, 'A'))
      add('整流拓扑', topology)
      add('纹波频率', fmtHz(fr))
    }

    if (!Number.isNaN(cap)) {
      const vpp = iload / (fr * cap)
      const vrms = vpp / (2 * Math.sqrt(3))
      const gamma = vrms / vdc
      add('直流电压 Vdc', fmtVolt(vdc))
      add('纹波 Vr(pp)', fmtVolt(vpp))
      add('纹波 Vr(rms)', fmtVolt(vrms))
      add('纹波系数 γ', `${gamma.toFixed(4)}（${(gamma * 100).toFixed(2)} %）`)
      addShared()
      add('建议二极管耐压', `${fmtVolt(piv * 1.5)}（PIV × 1.5 留裕量）`)
      const suggest = nearestSeries(cap * 2, E6)
      add('建议滤波电容（就近标准值）', suggest ? `${fmtFarad(suggest.value)}（按 2×C 就近 E6，留纹波与浪涌裕量）` : '按 2×C 就近取 E6 未命中')
      notes.push('半波与中心抽头每半周只有 1 只二极管导通，桥式串联 2 只，故 Vdc ≈ Vpk − 2Vd。')
      notes.push('中心抽头与桥式在正负半周各给电容补电一次，纹波频率取 2f：50 Hz 电网为 100 Hz，同容量下纹波只有半波的一半。')
      notes.push('半波整流纹波频率仍是 f、纹波大且变压器存在直流磁化，除微小电流指示类场合外不推荐带载使用。')
    } else if (!Number.isNaN(ripple)) {
      const cReq = iload / (fr * ripple)
      const nearest = nearestSeries(cReq, E6)
      const cStd = nearest ? nearest.value : cReq
      const vpp = iload / (fr * cStd)
      const vrms = vpp / (2 * Math.sqrt(3))
      const gamma = vrms / vdc
      add('直流电压 Vdc', fmtVolt(vdc))
      add('所需滤波电容 C', fmtFarad(cReq))
      add('就近标准电容（E6）', standardText(cReq, 'F', E6))
      add('该电容下实际纹波 Vr(pp)', fmtVolt(vpp))
      add('纹波 Vr(rms)', fmtVolt(vrms))
      add('纹波系数 γ', `${gamma.toFixed(4)}（${(gamma * 100).toFixed(2)} %）`)
      addShared()
      notes.push('反算按 C = I / (f_r·Vr(pp))，再就近取 E6 系列标准值，实际纹波用标准容量回算。')
      notes.push('中心抽头与桥式每周期补电两次，纹波频率取 2f（50 Hz 电网为 100 Hz），所需容量只有半波的一半。')
      notes.push('半波整流纹波大、二极管平均电流等于全部负载电流，除微小电流场合外不推荐带载使用。')
    } else {
      return fail('填写滤波电容 C 正算纹波，或留空电容并填写目标纹波反算电容')
    }

    const summary = outputs.length > 0 ? `${outputs[0].label} = ${outputs[0].value}` : '已计算'
    const preview = [summary, ...outputs.slice(1).map((item) => `${item.label}：${item.value}`), '', ...notes].join('\n')
    return { ok: true, resultSummary: summary, outputs, preview }
  }
}