import type { ToolDefinition, ToolExecutionResult } from '../types'
import { E24, TAU, fmtHz, fmtOhm, fmtQty, fmtVolt, fmtWatt, parseQty, standardText } from '../engineering'

/**
 * 运放与比较器速算。
 * 关系式：同相 A = 1 + Rf/Rg、反相 A = −Rf/Rg；带宽 = GBW / 噪声增益；
 * 压摆率 SR ≥ 2πfVp（满功率带宽 f = SR/(2πVp)）；
 * 迟滞比较器 V+ = (Vout·R2 + Vref·R1)/(R1+R2)；电阻热噪声 en = √(4kTR)（25 ℃）。
 */

const MODES = [
  { label: '反相 / 同相增益与电阻', value: 'gain' },
  { label: '增益带宽积与闭环带宽', value: 'gbw' },
  { label: '压摆率与满功率带宽', value: 'slew' },
  { label: '迟滞比较器阈值', value: 'hysteresis' },
  { label: '电阻热噪声', value: 'noise' }
]

const ON = (values: string[]): { key: string; values: string[] } => ({ key: 'mode', values })
const BOLTZMANN = 1.380649e-23
const ROOM_TEMP = 298.15

export const opampCalcTool: ToolDefinition = {
  manifest: {
    id: 'opamp-calc',
    name: '运放比较器速算',
    category: 'calc',
    description: '增益与电阻配对、GBW 带宽、压摆率、迟滞阈值与热噪声。',
    icon: 'Gauge',
    requires: [],
    builtin: true,
    fields: [
      { name: 'mode', label: '计算类型', type: 'select', required: true, defaultValue: 'gain', options: MODES },
      { name: 'rf', label: '反馈电阻 Rf / 上臂 R1 (Ω)', type: 'text', placeholder: '10k、100k', visibleWhen: ON(['gain', 'hysteresis']) },
      { name: 'rg', label: '对地电阻 Rg / 下臂 R2 (Ω)', type: 'text', placeholder: '10k', visibleWhen: ON(['gain', 'hysteresis']) },
      { name: 'gain', label: '增益（目标或已知）', type: 'text', placeholder: '10、-5、1.5', visibleWhen: ON(['gain', 'gbw']) },
      { name: 'gbw', label: '增益带宽积 GBW (Hz)', type: 'text', placeholder: '1M、10M', visibleWhen: ON(['gbw']) },
      { name: 'f', label: '频率 f (Hz)', type: 'text', placeholder: '20k、1M', visibleWhen: ON(['gbw', 'slew']) },
      { name: 'sr', label: '压摆率 SR (V/µs)', type: 'text', placeholder: '0.5、13', visibleWhen: ON(['slew']) },
      { name: 'vp', label: '输出峰值电压 Vp (V)', type: 'text', placeholder: '5、10', visibleWhen: ON(['slew']) },
      { name: 'vref', label: '参考电压 Vref (V)', type: 'text', placeholder: '留空按 0 处理', visibleWhen: ON(['hysteresis']) },
      { name: 'vhigh', label: '输出高电平 VOH (V)', type: 'text', placeholder: '5、3.3', visibleWhen: ON(['hysteresis']) },
      { name: 'vlow', label: '输出低电平 VOL (V)', type: 'text', placeholder: '0、0.1', visibleWhen: ON(['hysteresis']) },
      { name: 'r', label: '电阻 R (Ω)', type: 'text', placeholder: '1k、100k', visibleWhen: ON(['noise']) },
      { name: 'b', label: '噪声带宽 B (Hz)', type: 'text', placeholder: '10k、1M', visibleWhen: ON(['noise']) }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'gain')
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
      case 'gain': {
        const rf = pos('rf')
        const rg = pos('rg')
        const target = num('gain')
        if (Number.isFinite(target) && (Number.isNaN(rf) !== Number.isNaN(rg))) {
          const base = Number.isNaN(rg) ? rf : rg
          const wantNon = target >= 0 ? target : Math.abs(target)
          const forNon = wantNon > 1 ? base * (wantNon - 1) : Number.NaN
          const forInv = base * Math.abs(target)
          add('同相放大（A = +'+wantNon+'）', Number.isFinite(forNon) ? `Rf = ${fmtOhm(forNon)}，Rg = ${fmtOhm(base)}` : '同相增益无法小于 1，改用反相')
          add('反相放大（A = −'+Math.abs(target)+'）', `Rf = ${fmtOhm(forInv)}，Rg = ${fmtOhm(base)}`)
          add('就近标准值', `Rf ${standardText(forInv, 'Ω', E24)} · Rg ${standardText(base, 'Ω', E24)}`)
          notes.push('同相 A = 1 + Rf/Rg，反相 A = −Rf/Rg。填 Rf 或 Rg 其中一项作为基准电阻。')
          break
        }
        if (Number.isNaN(rf) || Number.isNaN(rg)) return fail('填 Rf 与 Rg，或改填目标增益加一只基准电阻')
        const non = 1 + rf / rg
        const inv = -rf / rg
        add('同相增益', `${non.toFixed(3)} 倍 · ${(20 * Math.log10(non)).toFixed(2)} dB`)
        add('反相增益', `${inv.toFixed(3)} 倍 · ${(20 * Math.log10(Math.abs(inv))).toFixed(2)} dB`)
        add('噪声增益', `${non.toFixed(3)}（决定带宽与稳定性）`)
        add('输入阻抗（反相）', fmtOhm(rg))
        add('就近标准值', `Rf ${standardText(rf, 'Ω', E24)} · Rg ${standardText(rg, 'Ω', E24)}`)
        notes.push('同相 A = 1 + Rf/Rg，反相 A = −Rf/Rg。反相时输入阻抗约等于 Rg。')
        break
      }

      case 'gbw': {
        const gbw = pos('gbw')
        const ng = num('gain')
        const f = pos('f')
        const closed = Number.isFinite(ng) && ng !== 0 ? Math.abs(ng) : Number.NaN
        if (!Number.isNaN(gbw) && !Number.isNaN(closed)) {
          add('闭环 −3 dB 带宽', fmtHz(gbw / closed))
          add('噪声增益', closed.toFixed(2))
          notes.push('电压反馈型运放：带宽 ≈ GBW / 噪声增益，增益越高带宽越窄。')
        } else if (!Number.isNaN(gbw) && !Number.isNaN(f)) {
          add('该增益下最大可用增益', (gbw / f).toFixed(2))
          notes.push('给定 GBW 与目标频率，可用的闭环增益上限 = GBW / f。')
        } else if (!Number.isNaN(f) && !Number.isNaN(closed)) {
          add('所需 GBW', `${fmtHz(f * closed)}（留 2~5 倍余量更稳）`)
        } else {
          return fail('填 GBW + 增益，或 GBW + 频率，或 频率 + 增益')
        }
        break
      }

      case 'slew': {
        const sr = num('sr')
        const vp = pos('vp')
        const f = pos('f')
        if (!Number.isNaN(sr) && sr > 0 && !Number.isNaN(vp) && !Number.isNaN(f)) {
          const needSlew = TAU * f * vp * 1e-6
          add('该信号所需压摆率', `${fmtQty(needSlew, 'V/µs')}`)
          add('结论', needSlew <= sr ? `余量 ${(sr / needSlew).toFixed(2)} 倍，不会削峰` : '压摆率不足，输出会失真')
        } else if (!Number.isNaN(sr) && sr > 0 && !Number.isNaN(vp)) {
          add('满功率带宽 FPBW', fmtHz((sr * 1e6) / (TAU * vp)))
          notes.push('FPBW = SR/(2πVp)，超过该频率幅度开始被压摆率限制。')
        } else if (!Number.isNaN(sr) && sr > 0 && !Number.isNaN(f)) {
          add('该频率最大不失真峰值', fmtVolt((sr * 1e6) / (TAU * f)))
        } else {
          return fail('填 SR，再填 Vp 或 f（两者都填可判断是否削峰）')
        }
        if (!Number.isNaN(sr) && sr > 0) add('所用压摆率', `${sr} V/µs`)
        notes.push('正弦波斜率峰值 = 2πfVp，需小于器件 SR（SR 通常按 V/µs 标注）。')
        break
      }

      case 'hysteresis': {
        const r1 = pos('rf')
        const r2 = pos('rg')
        const vref = Number.isFinite(num('vref')) ? num('vref') : 0
        const voh = num('vhigh')
        const vol = Number.isFinite(num('vlow')) ? num('vlow') : 0
        if (Number.isNaN(r1) || Number.isNaN(r2)) return fail('填 R1（输出到同相端）与 R2（同相端到参考）')
        if (Number.isNaN(voh)) return fail('再填输出高电平 VOH（低电平留空按 0 处理）')
        const k = r2 / (r1 + r2)
        const upper = voh * k + vref * (1 - k)
        const lower = vol * k + vref * (1 - k)
        add('上门限 V_TH', fmtVolt(Math.max(upper, lower)))
        add('下门限 V_TL', fmtVolt(Math.min(upper, lower)))
        add('回差电压', fmtVolt(Math.abs(upper - lower)))
        add('中心点', fmtVolt((upper + lower) / 2))
        add('R1 建议（按目标回差）', `R1 = R2·((VOH−VOL)/回差 − 1)，例：回差 ${fmtVolt(Math.abs(upper - lower))} 时 R1 = ${fmtOhm(r1)}`)
        notes.push('同相迟滞：V+ = (Vout·R2 + Vref·R1)/(R1+R2)，R1 接输出、R2 接参考。回差 = R2/(R1+R2)·(VOH−VOL)。')
        break
      }

      case 'noise': {
        const r = pos('r')
        const b = pos('b')
        if (Number.isNaN(r)) return fail('填电阻 R（可再填噪声带宽 B）')
        const density = Math.sqrt(4 * BOLTZMANN * ROOM_TEMP * r)
        add('噪声谱密度', `${fmtQty(density * 1e9, 'nV/√Hz')}`)
        if (!Number.isNaN(b)) {
          add(`${fmtHz(b)} 带宽内总噪声`, `${fmtQty(density * Math.sqrt(b) * 1e6, 'µV rms')}`)
          add('等效噪声功率', fmtWatt((density * Math.sqrt(b)) ** 2 / r))
          notes.push('一阶低通的等效噪声带宽 = π/2 × 截止频率，实际总噪声比按 −3 dB 频率估算高约 28%。')
        }
        notes.push('约翰逊噪声 en = √(4kTR)，按 25 ℃ 计算；总噪声 = en × √B。')
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