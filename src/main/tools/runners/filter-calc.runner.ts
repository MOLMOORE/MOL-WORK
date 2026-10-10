import type { ToolDefinition, ToolExecutionResult } from '../types'
import { E12, E24, TAU, fmtFarad, fmtHenry, fmtHz, fmtOhm, fmtQty, fmtSeconds, fmtVolt, fmtWatt, parseQty, standardText } from '../engineering'

/**
 * 滤波电路速算。
 * 公式取自通用无源 / 有源滤波器设计关系：
 *  - 一阶 RC：fc = 1/(2πRC)
 *  - 常数 k 无源 LC（影像参数法）：fc = 1/(π√LC)，L = R0/(πfc)，C = 1/(πfc·R0)
 *  - 单位增益 Sallen-Key 低通：fc = 1/(2π√(R1R2C1C2))，Q = √(R1R2C1C2)/(C2(R1+R2))
 *  - 双 T 陷波：f0 = 1/(2πRC)
 *  - 谐振回路：f0 = 1/(2π√LC)，ρ = √(L/C)，串联 Q = ρ/R、并联 Q = R/ρ，BW = f0/Q
 *  - n 阶巴特沃斯滚降：|H|dB = 10·log10(1+(f/fc)^(2n))
 * 输入一律支持工程计数法（10k、4m7、100n、1e-9），结果自动给出就近标准值。
 */

const MODES = [
  { label: 'RC 一阶低通 / 高通', value: 'rc' },
  { label: '无源 LC 滤波器（L / T / π 型）', value: 'lc' },
  { label: '二阶 Sallen-Key 低通', value: 'sallen' },
  { label: '双 T 陷波（带阻）', value: 'twin' },
  { label: 'LC 谐振回路与带宽', value: 'resonant' },
  { label: '滚降斜率与所需阶数', value: 'rolloff' },
  { label: '电抗速算 XL / XC', value: 'reactance' },
  { label: 'dB / dBm 电平换算', value: 'db' }
]

const ON = (values: string[]): { key: string; values: string[] } => ({ key: 'mode', values })

export const filterCalcTool: ToolDefinition = {
  manifest: {
    id: 'filter-calc',
    name: '滤波电路速算',
    category: 'calc',
    description: 'RC / LC / Sallen-Key / 双 T 的截止频率、Q 值、带宽与电平换算，给出就近标准值。',
    icon: 'Radio',
    requires: [],
    builtin: true,
    fields: [
      { name: 'mode', label: '计算类型', type: 'select', required: true, defaultValue: 'rc', options: MODES },
      {
        name: 'topo',
        label: '结构',
        type: 'select',
        defaultValue: 'l',
        options: [
          { label: 'L 型单节（串 L 并 C）', value: 'l' },
          { label: 'T 型（两串臂各 L/2）', value: 't' },
          { label: 'π 型（两并臂各 C/2）', value: 'pi' }
        ],
        visibleWhen: ON(['lc'])
      },
      {
        name: 'kind',
        label: '谐振类型',
        type: 'select',
        defaultValue: 'series',
        options: [
          { label: '串联回路（R 为损耗电阻）', value: 'series' },
          { label: '并联回路（R 为负载电阻）', value: 'parallel' }
        ],
        visibleWhen: ON(['resonant'])
      },
      { name: 'r', label: '电阻 R / R1 (Ω)', type: 'text', placeholder: '10k、4m7、1500', visibleWhen: ON(['rc', 'sallen', 'twin', 'resonant', 'db']) },
      { name: 'r2', label: '电阻 R2 (Ω)', type: 'text', placeholder: '10k', visibleWhen: ON(['sallen']) },
      { name: 'c', label: '电容 C / C1 (F)', type: 'text', placeholder: '100n、22p、1u', visibleWhen: ON(['rc', 'sallen', 'twin', 'resonant', 'reactance']) },
      { name: 'c2', label: '电容 C2 (F)', type: 'text', placeholder: '100n', visibleWhen: ON(['sallen']) },
      { name: 'l', label: '电感 L (H)', type: 'text', placeholder: '100u、1m、4u7', visibleWhen: ON(['lc', 'resonant', 'reactance']) },
      { name: 'f', label: '频率 f / 截止频率 fc (Hz)', type: 'text', placeholder: '1k、50、10m', visibleWhen: ON(['rc', 'lc', 'sallen', 'twin', 'resonant', 'rolloff', 'reactance']) },
      { name: 'f2', label: '频率 f2 (Hz)', type: 'text', placeholder: '查该频点响应时填', visibleWhen: ON(['rc', 'sallen', 'rolloff']) },
      {
        name: 'n',
        label: '滤波器阶数 n',
        type: 'select',
        defaultValue: '2',
        options: [1, 2, 3, 4, 5, 6, 7, 8].map((value) => ({ label: `${value} 阶`, value: String(value) })),
        visibleWhen: ON(['rolloff'])
      },
      { name: 'v', label: '电压 V1 (V，有效值)', type: 'text', placeholder: '0.775、2', visibleWhen: ON(['db']) },
      { name: 'v2', label: '电压 V2 (V)', type: 'text', placeholder: '求比值时填写', visibleWhen: ON(['db']) },
      { name: 'db', label: '电平 / 衰减 (dB 或 dBm)', type: 'text', placeholder: '-20、+6', visibleWhen: ON(['db', 'rolloff']) }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'rc')
    const num = (key: string): number => {
      const parsed = parseQty(ctx.getString(payload, key))
      return parsed === null || parsed === 0 ? Number.NaN : parsed
    }
    const has = (value: number): boolean => Number.isFinite(value) && value > 0
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })
    const add = (label: string, value: string): void => {
      outputs.push({ label, value })
    }

    switch (mode) {
      case 'rc': {
        const R = num('r')
        const C = num('c')
        const F = num('f')
        let r = R
        let c = C
        let fc = F
        if (has(r) && has(c)) fc = 1 / (TAU * r * c)
        else if (has(F) && has(c)) r = 1 / (TAU * F * c)
        else if (has(F) && has(r)) c = 1 / (TAU * F * r)
        else return fail('填两项：R 与 C，或 fc 与 R / C 之一')
        const tau = r * c
        add('截止频率 fc', fmtHz(fc))
        add('角频率 ωc', fmtQty(TAU * fc, 'rad/s'))
        add('时间常数 τ', fmtSeconds(tau))
        add('建议标准电阻', standardText(r, 'Ω', E24))
        add('建议标准电容', standardText(c, 'F', E12))
        const fx = num('f2')
        if (has(fx)) {
          const x = fx / fc
          const gain = 1 / Math.sqrt(1 + x * x)
          add(`${fmtHz(fx)} 处幅值`, `${(gain * 100).toFixed(2)} % · ${fmtQty(20 * Math.log10(gain), 'dB')}`)
          add(`${fmtHz(fx)} 处相位`, `低通 −${((Math.atan(x) * 180) / Math.PI).toFixed(1)}° / 高通 +${((Math.atan(x) * 180) / Math.PI).toFixed(1)}°`)
        }
        notes.push('fc = 1/(2πRC)，一阶滚降 20 dB/十倍频程；低通与高通的幅值衰减相同。')
        break
      }

      case 'lc': {
        const topo = ctx.getString(payload, 'topo', 'l')
        const L = num('l')
        const C = num('c')
        const R0 = num('r')
        const F = num('f')
        let l = L
        let c = C
        let fc = F
        let z = R0
        if (has(L) && has(C)) {
          fc = 1 / (Math.PI * Math.sqrt(L * C))
          z = Math.sqrt(L / C)
        } else if (has(F) && has(R0)) {
          l = R0 / (Math.PI * F)
          c = 1 / (Math.PI * F * R0)
        } else if (has(F) && has(L)) {
          c = 1 / (Math.PI * Math.PI * F * F * L)
          z = Math.PI * F * L
        } else if (has(F) && has(C)) {
          l = 1 / (Math.PI * Math.PI * F * F * C)
          z = 1 / (Math.PI * F * C)
        } else {
          return fail('填 fc + 影像阻抗 R0，或填 L + C，或 fc + L / C 之一')
        }
        add('截止频率 fc', fmtHz(fc))
        add('影像阻抗 R0', fmtOhm(z))
        add('串联电感 L', fmtHenry(l))
        add('并联电容 C', fmtFarad(c))
        if (topo === 't') add('T 型臂值', `串臂各 ${fmtHenry(l / 2)}，并臂 ${fmtFarad(c)}`)
        else if (topo === 'pi') add('π 型臂值', `串臂 ${fmtHenry(l)}，并臂各 ${fmtFarad(c / 2)}`)
        else add('L 型单节', `串臂 ${fmtHenry(l)}，并臂 ${fmtFarad(c)}`)
        add('建议标准电感', standardText(l, 'H', E12))
        add('建议标准电容', standardText(c, 'F', E12))
        notes.push('常数 k 影像参数法：fc = 1/(π√LC)，L = R0/(πfc)，C = 1/(πfc·R0)。实际通带边缘会因负载偏离 R0 而移动。')
        break
      }

      case 'sallen': {
        let r1 = num('r')
        let r2 = num('r2')
        let c1 = num('c')
        let c2 = num('c2')
        const fc = num('f')
        const known = [r1, r2, c1, c2].filter(has).length
        if (known === 4) {
          /* 元件齐全，直接分析 */
        } else if (has(fc) && known === 3) {
          const target = 1 / (TAU * fc) ** 2
          if (!has(r1)) r1 = target / (r2 * c1 * c2)
          else if (!has(r2)) r2 = target / (r1 * c1 * c2)
          else if (!has(c1)) c1 = target / (r1 * r2 * c2)
          else c2 = target / (r1 * r2 * c1)
        } else {
          return fail('填齐 R1 R2 C1 C2，或给出 fc 并留空其中一项')
        }
        const w0 = 1 / Math.sqrt(r1 * r2 * c1 * c2)
        const q = Math.sqrt(r1 * r2 * c1 * c2) / (c2 * (r1 + r2))
        const zeta = 1 / (2 * q)
        add('截止频率 fc', fmtHz(w0 / TAU))
        add('品质因数 Q', q.toFixed(3))
        add('阻尼比 ζ', zeta.toFixed(3))
        add('阻尼状态', zeta < 0.999 ? '欠阻尼（有峰值）' : zeta > 1.001 ? '过阻尼' : '临界阻尼')
        if (zeta < 1) {
          const mp = Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta))
          add('阶跃过冲', `${(mp * 100).toFixed(1)} %`)
        }
        add('R1 / R2', `${fmtOhm(r1)} / ${fmtOhm(r2)}（标准值 ${standardText(r1, 'Ω', E24)} · ${standardText(r2, 'Ω', E24)}）`)
        add('C1 / C2', `${fmtFarad(c1)} / ${fmtFarad(c2)}（标准值 ${standardText(c1, 'F', E12)} · ${standardText(c2, 'F', E12)}）`)
        const fx = num('f2')
        if (has(fx)) {
          const x = fx / (w0 / TAU)
          const gain = 1 / Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2)
          add(`${fmtHz(fx)} 处幅值`, `${(gain * 100).toFixed(1)} % · ${fmtQty(20 * Math.log10(gain), 'dB')}`)
        }
        notes.push('单位增益 Sallen-Key：R1 串入、R2 到同相端、C1 从输出反馈到 R1R2 节点、C2 同相端接地。fc = 1/(2π√(R1R2C1C2))，Q = √(R1R2C1C2)/(C2(R1+R2))。等阻时 Q 上限为 1，更高 Q 需引入同相增益。')
        break
      }

      case 'twin': {
        let r = num('r')
        let c = num('c')
        let f0 = num('f')
        if (has(r) && has(c)) f0 = 1 / (TAU * r * c)
        else if (has(f0) && has(c)) r = 1 / (TAU * f0 * c)
        else if (has(f0) && has(r)) c = 1 / (TAU * f0 * r)
        else return fail('填 R 与 C，或 f0 与 R / C 之一')
        add('陷波频率 f0', fmtHz(f0))
        add('桥臂元件', `电阻臂 R、R = ${fmtOhm(r)}，并臂 2C = ${fmtFarad(2 * c)}；电容臂 C、C = ${fmtFarad(c)}，并臂 R/2 = ${fmtOhm(r / 2)}`)
        add('建议标准值', `R ${standardText(r, 'Ω', E24)}，C ${standardText(c, 'F', E12)}`)
        add('空载品质因数', 'Q ≈ 0.25（陷波较浅，需缓冲或加正反馈提高 Q）')
        notes.push('双 T：f0 = 1/(2πRC)，电阻臂串 R、R 并 2C，电容臂串 C、C 并 R/2。陷波深度取决于配对精度，建议用 1% 电阻。')
        break
      }

      case 'resonant': {
        const kind = ctx.getString(payload, 'kind', 'series')
        const L = num('l')
        const C = num('c')
        const R = num('r')
        if (!has(L) || !has(C)) return fail('谐振回路需要电感 L 与电容 C')
        const f0 = 1 / (TAU * Math.sqrt(L * C))
        const rho = Math.sqrt(L / C)
        add('谐振频率 f0', fmtHz(f0))
        add('角频率 ω0', fmtQty(TAU * f0, 'rad/s'))
        add('特性阻抗 ρ', fmtOhm(rho))
        if (has(R)) {
          const q = kind === 'series' ? rho / R : R / rho
          const bw = f0 / q
          const spread = Math.sqrt(1 + 1 / (4 * q * q))
          add('品质因数 Q', q.toFixed(2))
          add('-3 dB 带宽 BW', fmtHz(bw))
          add('半功率点 f1 / f2', `${fmtHz(f0 * (spread - 1 / (2 * q)))} / ${fmtHz(f0 * (spread + 1 / (2 * q)))}`)
          add('回路电阻', kind === 'series' ? `串联损耗 ${fmtOhm(R)}` : `并联负载 ${fmtOhm(R)}`)
        } else {
          notes.push('再填 R（串联损耗或并联负载）即可求出 Q、带宽与半功率点。')
        }
        add('建议标准值', `L ${standardText(L, 'H', E12)}，C ${standardText(C, 'F', E12)}`)
        notes.push(kind === 'series' ? '串联回路：Q = ρ/R = ω0L/R，ρ = √(L/C)。' : '并联回路：Q = R/ρ = R/(ω0L)，含损耗的实配电感会明显拉低 Q。')
        break
      }

      case 'rolloff': {
        const n = Number(ctx.getString(payload, 'n', '2')) || 2
        const fc = num('f')
        const fx = num('f2')
        const need = parseQty(ctx.getString(payload, 'db'))
        const slope = 20 * n
        add('滚降斜率', `${slope} dB/十倍频程 · ${fmtQty(slope / Math.log10(2), 'dB/oct')} 每倍频`)
        if (has(fc) && has(fx) && fx > fc && need === null) {
          const ratio = fx / fc
          const attenuation = 10 * Math.log10(1 + ratio ** (2 * n))
          add(`${fmtHz(fx)} 处衰减`, `${attenuation.toFixed(1)} dB（剩余 ${((1 / Math.sqrt(1 + ratio ** (2 * n))) * 100).toFixed(3)} %）`)
          add('相对截止点倍数', `${fmtQty(ratio, '×')}`)
        } else if (has(fc) && has(fx) && fx > fc && need !== null && need > 0) {
          const required = Math.log(10 ** (need / 10) - 1) / (2 * Math.log(fx / fc))
          const order = Math.max(1, Math.ceil(required))
          add(`需 ${need} dB 衰减的最小阶数`, `${order} 阶（算得 ${required.toFixed(2)}）`)
        } else if (has(fx) && need !== null && need > 0 && !has(fc)) {
          const ratio = (10 ** (need / 10) - 1) ** (1 / (2 * n))
          add('满足条件的截止频率 fc', fmtHz(fx / ratio))
        } else {
          notes.push('填 fc + f2 求衰减；再加 dB 求所需阶数；只填 f2 + dB 反求 fc。')
        }
        notes.push('按 n 阶巴特沃斯幅度响应计算：|H|dB = 10·log10(1+(f/fc)^(2n))。')
        break
      }

      case 'reactance': {
        const F = num('f')
        const L = num('l')
        const C = num('c')
        if (!has(F)) return fail('请先填写频率 f')
        if (has(L)) add(`${fmtHz(F)} 下感抗 XL`, fmtOhm(TAU * F * L))
        if (has(C)) add(`${fmtHz(F)} 下容抗 XC`, fmtOhm(1 / (TAU * F * C)))
        if (has(L) && has(C)) {
          const xl = TAU * F * L
          const xc = 1 / (TAU * F * C)
          add('串联净电抗', `${fmtOhm(Math.abs(xl - xc))}（${xl > xc ? '感性' : '容性'}）`)
          add('LC 谐振频率', fmtHz(1 / (TAU * Math.sqrt(L * C))))
        }
        if (!has(L) || !has(C)) notes.push('再补一个 L 或 C 即可比较感抗与容抗、并给出谐振频率。')
        break
      }

      case 'db': {
        const v1 = num('v')
        const v2 = num('v2')
        const r = num('r')
        const raw = parseQty(ctx.getString(payload, 'db'))
        if (has(v1) && has(v2)) add('电压比', `${fmtQty(v1 / v2, '×')} · ${(20 * Math.log10(v1 / v2)).toFixed(2)} dB`)
        else if (has(v1)) add('电压比（对 1 V）', `${(20 * Math.log10(v1)).toFixed(2)} dBV`)
        if (raw !== null && Number.isFinite(raw) && (has(v1) || has(v2))) {
          add(`${raw} dB 对应倍数`, `${fmtQty(10 ** (raw / 20), '×')} 电压 / ${fmtQty(10 ** (raw / 10), '×')} 功率`)
        }
        if (raw !== null && Number.isFinite(raw) && has(r) && !has(v1)) {
          const watts = 10 ** ((raw - 30) / 10)
          add(`${raw} dBm 在 ${fmtOhm(r)}`, `功率 ${fmtWatt(watts)} · 有效值 ${fmtVolt(Math.sqrt(watts * r))} · 峰值 ${fmtVolt(Math.sqrt(2 * watts * r))}`)
        }
        if (has(v1) && has(r)) {
          const watts = (v1 * v1) / r
          add(`${fmtVolt(v1)} 在 ${fmtOhm(r)}`, `功率 ${fmtWatt(watts)} · ${fmtQty(10 * Math.log10(watts * 1000), 'dBm')}`)
          add('峰值 / 峰峰值', `${fmtVolt(v1 * Math.SQRT2)} / ${fmtVolt(v1 * 2 * Math.SQRT2)}`)
        }
        if (outputs.length === 0) return fail('填 V1（可配 R）、或 V1+V2、或 dB(+R)')
        notes.push('电压按正弦有效值处理：dB = 20log(V1/V2)，功率 dB = 10log(P1/P2)，0 dBm = 1 mW。')
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