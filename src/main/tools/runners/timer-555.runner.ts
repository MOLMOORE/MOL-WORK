import type { ToolDefinition, ToolExecutionResult } from '../types'
import { E24, E6, fmtHz, fmtSeconds, nearestSeries, parseQty, standardText } from '../engineering'

/**
 * 555 定时器速算。
 * 关系式（NE555 数据手册 / 教材标准式）：
 * 无稳态 tH = 0.693·(RA+RB)·C，tL = 0.693·RB·C；
 * f = 1/(tH+tL) ≈ 1.44/((RA+2RB)·C)，占空比 D = (RA+RB)/(RA+2RB)×100；
 * 单稳态延时 t = 1.1·R·C（触发只需把 2 脚拉低到 1/3 VCC，宽度与 t 无关）。
 */

const MODES = [
  { label: '无稳态多谐振荡器', value: 'astable' },
  { label: '单稳态触发器', value: 'mono' }
]

const ON = (values: string[]): { key: string; values: string[] } => ({ key: 'mode', values })

export const timer555Tool: ToolDefinition = {
  manifest: {
    id: 'timer-555',
    name: '555 定时器速算',
    category: 'calc',
    description: '555 无稳态频率/占空比正反算与单稳延时速算。',
    icon: 'Radio',
    requires: [],
    builtin: true,
    fields: [
      { name: 'mode', label: '计算类型', type: 'select', required: true, defaultValue: 'astable', options: MODES },
      { name: 'ra', label: '上臂电阻 RA (Ω)', type: 'text', placeholder: '1k、47k', visibleWhen: ON(['astable']) },
      { name: 'rb', label: '下臂电阻 RB (Ω)', type: 'text', placeholder: '10k、100k', visibleWhen: ON(['astable']) },
      { name: 'c', label: '定时电容 C (F)', type: 'text', placeholder: '10n、100n、10u', visibleWhen: ON(['astable', 'mono']) },
      { name: 'f', label: '目标频率 f (Hz)，反算元件时填', type: 'text', placeholder: '1k、555', visibleWhen: ON(['astable']) },
      { name: 'duty', label: '目标占空比 (%)，反算元件时填', type: 'text', placeholder: '60、70', visibleWhen: ON(['astable']) },
      { name: 'r', label: '定时电阻 R (Ω)', type: 'text', placeholder: '100k、1M', visibleWhen: ON(['mono']) },
      { name: 't', label: '目标延时 t (s)', type: 'text', placeholder: '1、10', visibleWhen: ON(['mono']) }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'astable')
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

    switch (mode) {
      case 'astable': {
        const ra = pos('ra')
        const rb = pos('rb')
        const cap = pos('c')
        const f = pos('f')
        const duty = num('duty')
        if (!Number.isNaN(ra) && !Number.isNaN(rb) && !Number.isNaN(cap)) {
          const tH = 0.693 * (ra + rb) * cap
          const tL = 0.693 * rb * cap
          const freq = 1.44 / ((ra + 2 * rb) * cap)
          const d = ((ra + rb) / (ra + 2 * rb)) * 100
          add('频率 f', fmtHz(freq))
          add('周期 T', fmtSeconds(1 / freq))
          add('高电平时间 tH', fmtSeconds(tH))
          add('低电平时间 tL', fmtSeconds(tL))
          add('占空比 D', `${d.toFixed(1)} %`)
          add('就近标准值', `RA ${standardText(ra, 'Ω', E24)} · RB ${standardText(rb, 'Ω', E24)}`)
          notes.push('tH = 0.693·(RA+RB)·C，tL = 0.693·RB·C，f = 1.44/((RA+2RB)·C)，D = (RA+RB)/(RA+2RB)。')
          notes.push('基本接法占空比恒 > 50%；低于 50% 需给 RB 并联二极管（本工具不建模）。')
          break
        }
        if (!Number.isNaN(f) && !Number.isNaN(cap)) {
          let dPct = duty
          if (!Number.isFinite(dPct) || dPct <= 50) {
            dPct = 55
            notes.push('目标占空比留空或不大于 50%：基本接法占空比恒 > 50%，按 55% 给出最小占空比方案；低于 50% 需给 RB 并联二极管，本工具不建模。')
          } else if (dPct >= 100) {
            return fail('目标占空比需小于 100%。')
          }
          const dv = dPct / 100
          const k = 1.44 / (f * cap)
          const raCalc = (2 * dv - 1) * k
          let raFinal = raCalc
          if (raFinal < 1000) {
            notes.push('RA 计算值小于 1 kΩ：放电管饱和影响明显，按 1 kΩ 取值并重解 RB。')
            raFinal = 1000
          }
          const rbFinal = (k - raFinal) / 2
          if (!(rbFinal > 0)) return fail('该频率在 RA ≥ 1 kΩ 约束下反解不出正电阻：请降低目标频率或加大电容。')
          const raStd = nearestSeries(raFinal, E24)
          const rbStd = nearestSeries(rbFinal, E24)
          if (raStd === null || rbStd === null) return fail('计算值找不到 E24 就近标准值：请检查目标频率与电容。')
          const fAct = 1.44 / ((raStd.value + 2 * rbStd.value) * cap)
          const dAct = ((raStd.value + rbStd.value) / (raStd.value + 2 * rbStd.value)) * 100
          add('实际频率（标准值）', fmtHz(fAct))
          add('实际占空比（标准值）', `${dAct.toFixed(1)} %`)
          add('周期 T', fmtSeconds(1 / fAct))
          add('RA（E24 就近）', standardText(raFinal, 'Ω', E24))
          add('RB（E24 就近）', standardText(rbFinal, 'Ω', E24))
          notes.push('反算：f 与 D 联立 ⇒ RB = (1−D)·1.44/(f·C)，RA = (2D−1)·1.44/(f·C)，再取 E24 就近值复算实际 f/D。')
          break
        }
        return fail('无稳态：填 RA/RB/C 正算，或填 f+C 反算元件')
      }

      case 'mono': {
        const r = pos('r')
        const cap = pos('c')
        const t = pos('t')
        if (!Number.isNaN(r) && !Number.isNaN(cap) && Number.isNaN(t)) {
          add('延时 t', fmtSeconds(1.1 * r * cap))
          add('就近标准值', `R ${standardText(r, 'Ω', E24)} · C ${standardText(cap, 'F', E6)}`)
          notes.push('单稳延时 t = 1.1·R·C，与触发脉冲宽度无关。')
        } else if (!Number.isNaN(t) && !Number.isNaN(cap)) {
          const rCalc = t / (1.1 * cap)
          const rStd = nearestSeries(rCalc, E24)
          if (rStd === null) return fail('计算电阻找不到 E24 就近标准值：请检查延时与电容。')
          add('延时 t（目标）', fmtSeconds(t))
          add('R（E24 就近）', standardText(rCalc, 'Ω', E24))
          add('实际延时（标准值）', fmtSeconds(1.1 * rStd.value * cap))
          notes.push('反算：R = t/(1.1·C)，取 E24 就近值后复算实际延时。')
        } else if (!Number.isNaN(t) && !Number.isNaN(r)) {
          const cCalc = t / (1.1 * r)
          const cStd = nearestSeries(cCalc, E6)
          if (cStd === null) return fail('计算电容找不到 E6 就近标准值：请检查延时与电阻。')
          add('延时 t（目标）', fmtSeconds(t))
          add('C（E6 就近）', standardText(cCalc, 'F', E6))
          add('实际延时（标准值）', fmtSeconds(1.1 * r * cStd.value))
          notes.push('反算：C = t/(1.1·R)，电容按 E6 系列就近取值。')
        } else {
          return fail('单稳：填 R+C 正算延时，或 t+R / t+C 反算')
        }
        notes.push('数据手册建议范围：R 取 1 kΩ ~ 10 MΩ；C 小于 10 µF 时漏电误差小。')
        break
      }

      default:
        return fail(`未知计算类型：${mode}`)
    }

    const summary = outputs.length > 0 ? `${outputs[0].label} = ${outputs[0].value}` : '已计算'
    const preview = [summary, ...outputs.slice(1).map((item) => `${item.label}：${item.value}`), '', ...notes].join('\n')
    return { ok: true, resultSummary: summary, outputs, preview }
  }
}