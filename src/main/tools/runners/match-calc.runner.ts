import type { ToolDefinition, ToolExecutionResult } from '../types'
import { TAU, fmtFarad, fmtHenry, fmtHz, fmtOhm, fmtQty, parseQty } from '../engineering'

/**
 * 阻抗匹配速算（窄带）：L 型/π 型集总匹配与单支节、λ/4 传输线匹配。
 * 参考口径：
 * - L 型：Analog Devices RF 匹配计算器（CN0300 思路）。Y_L = conj(ZL)/|ZL|² = G + jB_L；
 *   正向（负载侧先并联、再串联到源）：要求 G ≤ 1/Z0，B_tot = ±√(G/Z0 − G²)，
 *   并联臂 B_shunt = B_tot − B_L，并联后 Z1 = 1/(G + jB_tot)，串联臂 X = −Im(Z1)。
 *   G > 1/Z0（低阻负载）时网络反接：把 Z0 与 ZL 互换角色调用同一正向算法，
 *   并联臂落在源侧，串联臂 X′ 再减去负载虚部（X_串 = X′ − X_L）。
 * - π 型：everythingrf 虚电阻法。Rv = R大/(1+Q²)，每侧 Qi = √(Ri/Rv − 1)，
 *   串联臂 X = (Q1+Q2)·Rv（电感），两侧并联臂 Bi = Qi/Ri（电容），Q ≥ Q0 = √(R大/R小 − 1)。
 * - 单支节：Pozar《微波工程》。归一 y = Z0/ZL = g + jb，解 (g − b² − g²)t² + 2bt + (g − 1) = 0
 *   （t = tanβd）；y_in = (y + jt)/(1 + jyt)，短路支节 tanβl = 1/b_in，开路支节 tanβl = −b_in；
 *   λ = λ0/√εr(eff)，λ0 = 3e8/f。
 * - λ/4：Pozar 单节四分之一波长变换器 Z1 = √(Z0·RL)，按最大反射纹波 ρ=0.2 设计，
 *   分数带宽 FBW = (4/π)·asin(min(1, ρ/(2|Γ|)))。
 */

interface ComplexZ {
  re: number
  im: number
}

interface LSolution {
  /** 并联臂电纳（正=电容，负=电感），单位 S */
  bShunt: number
  /** 串联臂电抗（正=电感，负=电容），单位 Ω */
  xSeries: number
}

/**
 * 复数阻抗解析：'300'、'100-j50'、'100-50j'、'60+40j'、'100+j47'、'1k-j500'、'-j25'。
 * 实部虚部各走 parseQty（支持 1k、4m7 这类工程计数法），'j' 可在前在后；纯数字按实数处理。
 */
function parseZ(raw: unknown): ComplexZ | null {
  let text = String(raw ?? '')
    .trim()
    .replace(/[, ]/g, '')
    .replace(/[µμ]/g, 'u')
  if (/[ωΩ]$/.test(text)) text = text.slice(0, -1)
  if (text === '') return null
  if (!/[jJ]/.test(text)) {
    const value = parseQty(text)
    return value === null ? null : { re: value, im: 0 }
  }
  const body = text.replace(/[jJ]/g, '')
  let cut = -1
  for (let i = body.length - 1; i > 0; i--) {
    const c = body.charAt(i)
    if ((c === '+' || c === '-') && !/[eE]/.test(body.charAt(i - 1))) {
      cut = i
      break
    }
  }
  let reStr = ''
  let imStr = ''
  if (cut === -1) {
    reStr = '0'
    imStr = body
  } else {
    reStr = body.slice(0, cut)
    imStr = body.slice(cut)
  }
  if (imStr === '' || imStr === '+' || imStr === '-') imStr = imStr + '1'
  const re = parseQty(reStr === '' ? '0' : reStr)
  const im = parseQty(imStr)
  if (re === null || im === null) return null
  return { re, im }
}

/**
 * 正向 L 型（负载侧先并联、再串联到源）：要求负载电导 G ≤ 1/R0，返回 ± 两组解；不可解返回 null。
 * 口径同 Analog Devices 匹配计算器：B_tot=±√(G/R0−G²)，X=−Im(1/(G+jB_tot))=B_tot/(G²+B_tot²)。
 */
function solveL(zl: ComplexZ, r0: number): LSolution[] | null {
  const mag2 = zl.re * zl.re + zl.im * zl.im
  if (mag2 === 0 || !(r0 > 0)) return null
  const g = zl.re / mag2
  const bLoad = -zl.im / mag2
  if (g > 1 / r0) return null
  const inner = g / r0 - g * g
  if (inner < 0) return null
  const bTot = Math.sqrt(inner)
  if (bTot === 0) return [{ bShunt: -bLoad, xSeries: 0 }]
  return [bTot, -bTot].map((b) => ({
    bShunt: b - bLoad,
    xSeries: b / (g * g + b * b)
  }))
}

const MODES = [
  { label: 'L 型集总匹配', value: 'lmatch' },
  { label: 'π 型集总匹配', value: 'pi' },
  { label: '单支节匹配', value: 'stub' },
  { label: 'λ/4 阻抗变换', value: 'qtr' }
]

const STUB_ENDS = [
  { label: '短路支节', value: 'short' },
  { label: '开路支节', value: 'open' }
]

const ON = (values: string[]): { key: string; values: string[] } => ({ key: 'mode', values })

export const matchCalcTool: ToolDefinition = {
  manifest: {
    id: 'match-calc',
    name: '阻抗匹配速算',
    category: 'calc',
    description: 'L 型/π 型集总匹配与单支节、λ/4 传输线匹配速算。',
    icon: 'Radio',
    requires: [],
    builtin: true,
    fields: [
      { name: 'mode', label: '匹配类型', type: 'select', required: true, defaultValue: 'lmatch', options: MODES },
      { name: 'zl', label: '负载阻抗 ZL (Ω)', type: 'text', required: true, placeholder: '50、300、100-j50、60+40j' },
      { name: 'z0', label: '系统阻抗 Z0 (Ω)', type: 'text', required: true, defaultValue: '50', placeholder: '50、75' },
      {
        name: 'f',
        label: '工作频率 f (Hz)',
        type: 'text',
        placeholder: '100M、2.4G',
        hint: 'L/π 换算 L·C 与支节/λ4 算波长都靠它'
      },
      { name: 'q', label: 'π 型有载品质因数 Q', type: 'text', placeholder: '如 5；须 ≥ √(R大/R小−1)', visibleWhen: ON(['pi']) },
      { name: 'stubend', label: '支节端接', type: 'select', defaultValue: 'short', options: STUB_ENDS, visibleWhen: ON(['stub']) },
      {
        name: 'er',
        label: '介质有效相对介电常数 εr(eff)',
        type: 'text',
        defaultValue: '1',
        placeholder: '1、4.4（微带近似）',
        visibleWhen: ON(['stub', 'qtr'])
      }
    ]
  },

  async run(payload, ctx): Promise<ToolExecutionResult> {
    const mode = ctx.getString(payload, 'mode', 'lmatch')
    const outputs: { label: string; value: string }[] = []
    const notes: string[] = []
    const add = (label: string, value: string): void => {
      outputs.push({ label, value })
    }
    const fail = (message: string): ToolExecutionResult => ({ ok: false, error: message })

    const zl = parseZ(ctx.getString(payload, 'zl'))
    if (zl === null) return fail('ZL 格式：纯阻 300 或复数 100-j50（支持 1k、4m7 这类工程计数法）')
    const z0Parsed = parseQty(ctx.getString(payload, 'z0', '50'))
    if (z0Parsed === null || !Number.isFinite(z0Parsed) || z0Parsed <= 0) return fail('Z0 需为正的实数系统阻抗（如 50、75）')
    const z0 = z0Parsed
    const fParsed = parseQty(ctx.getString(payload, 'f'))
    const fHz = fParsed !== null && Number.isFinite(fParsed) && fParsed > 0 ? fParsed : Number.NaN
    const hasF = Number.isFinite(fHz)
    const omega = hasF ? TAU * fHz : Number.NaN

    add(
      '负载 ZL',
      Math.abs(zl.im) < 1e-9
        ? fmtOhm(zl.re) + '（纯阻）'
        : fmtOhm(zl.re) + (zl.im >= 0 ? ' + j' : ' − j') + fmtOhm(Math.abs(zl.im))
    )
    add('系统阻抗 Z0', fmtOhm(z0))

    const seriesText = (x: number): string =>
      Math.abs(x) < 1e-9
        ? '串联臂为 0（直连即可）'
        : '串 X=' +
          fmtOhm(x) +
          (hasF
            ? x > 0
              ? '（电感 L=' + fmtHenry(x / omega) + '）'
              : '（电容 C=' + fmtFarad(-1 / (omega * x)) + '）'
            : '（电抗值，填 f 后换算 L/C）')
    const shuntText = (b: number): string =>
      Math.abs(b) < 1e-9
        ? '并联臂为 0（可开路不放元件）'
        : '并 B=' +
          fmtQty(b, 'S') +
          (hasF
            ? b > 0
              ? '（电容 C=' + fmtFarad(b / omega) + '）'
              : '（电感 L=' + fmtHenry(-1 / (omega * b)) + '）'
            : '（电纳值，填 f 后换算 L/C）')

    /** stub/qtr 共用：εr(eff) 无效的按 1 处理；缺 f 返回 null */
    const wavelength = (): { er: number; lambda: number } | null => {
      if (!hasF) return null
      const erParsed = parseQty(ctx.getString(payload, 'er', '1'))
      const er = erParsed !== null && Number.isFinite(erParsed) && erParsed > 0 ? erParsed : 1
      return { er, lambda: 3e8 / fHz / Math.sqrt(er) }
    }
    /** 电长度（rad）转角度文本 */
    const electrical = (rad: number): string => ((rad * 180) / Math.PI).toFixed(1)
    const pureResistive = (limit: number): boolean =>
      Math.abs(zl.im) <= 1e-6 * Math.max(1, limit)

    switch (mode) {
      case 'lmatch': {
        const fwd = solveL(zl, z0)
        if (fwd) {
          add('接法', '正向：负载侧先并联，再串联到源')
          fwd.forEach((s, i) => {
            add('解 ' + (i + 1) + (s.bShunt >= 0 ? '（+B）' : '（−B）'), shuntText(s.bShunt) + '；' + seriesText(s.xSeries))
          })
          const maxX = Math.max(...fwd.map((s) => Math.abs(s.xSeries)))
          add('网络 Q', (maxX / z0).toFixed(2) + '（= |X串|/Z0）')
          notes.push('正向口径（Analog Devices 匹配计算器）：Y_L=G+jB_L，G≤1/Z0 时先在负载侧并 B_tot=±√(G/Z0−G²)，再串 −Im(Z1)。')
        } else {
          const rev = zl.re > 0 ? solveL({ re: z0, im: 0 }, zl.re) : null
          if (!rev) return fail('该负载需先抵消虚部或用π型/双支节，当前单L不可解')
          add('接法', '反向接法：并联臂在源侧（负载电导 G > 1/Z0，先串后并）')
          rev.forEach((s, i) => {
            add(
              '解 ' + (i + 1) + (s.bShunt >= 0 ? '（+B）' : '（−B）'),
              shuntText(s.bShunt) + '（并于源侧）；' + seriesText(s.xSeries - zl.im) + '（已抵消负载虚部 −X_L）'
            )
          })
          const maxX = Math.max(...rev.map((s) => Math.abs(s.xSeries)))
          add('网络 Q', (maxX / zl.re).toFixed(2) + '（= |X′|/R_L）')
          notes.push('反向接法：把 Z0 与 ZL（取实部）互换角色调用同一正向算法；串联臂总电抗 X_串 = X′ − X_L，负载虚部由串联臂一并吸收。')
        }
        if (!hasF) notes.push('L 型电抗/电纳只在该频点对应唯一 L、C 值：填入工作频率 f 后自动换算（L 用 nH、C 用 pF 量级显示）。')
        notes.push('L 型是窄带单频解，元件值只在所填频点成立；± 两组解分别偏向低通（并 L 串 C）与高通（并 C 串 L）。')
        break
      }

      case 'pi': {
        if (!pureResistive(zl.re)) return fail('π 型按纯阻负载计算，请把虚部先抵消')
        if (!(zl.re > 0)) return fail('负载必须为正电阻')
        const rBig = Math.max(zl.re, z0)
        const rSmall = Math.min(zl.re, z0)
        const q0 = Math.sqrt(Math.max(0, rBig / rSmall - 1))
        const qParsed = parseQty(ctx.getString(payload, 'q'))
        if (qParsed === null || !Number.isFinite(qParsed) || qParsed <= 0) {
          return fail('填 π 型有载品质因数 Q：该阻比的最小 Q0 = ' + q0.toFixed(2) + '（√(R大/R小−1)），常用 5~15')
        }
        if (qParsed < q0) return fail('Q 须 ≥ ' + q0.toFixed(2) + '（该阻比的最小 Q）')
        const rv = rBig / (1 + qParsed * qParsed)
        const qLoad = Math.sqrt(Math.max(0, zl.re / rv - 1))
        const qSrc = Math.sqrt(Math.max(0, z0 / rv - 1))
        const xSeries = (qLoad + qSrc) * rv
        const bLoad = qLoad / zl.re
        const bSrc = qSrc / z0
        add('虚电阻 Rv', fmtOhm(rv) + '（中间虚阻抗）')
        add('串联臂', 'X=' + fmtOhm(xSeries) + (hasF ? ' 电感 L=' + fmtHenry(xSeries / omega) : '（电抗值，填 f 换算 L）'))
        add('负载侧并联臂', 'B=' + fmtQty(bLoad, 'S') + (hasF ? ' 电容 C=' + fmtFarad(bLoad / omega) : '（电纳值，填 f 换算 C）'))
        add('源侧并联臂', 'B=' + fmtQty(bSrc, 'S') + (hasF ? ' 电容 C=' + fmtFarad(bSrc / omega) : '（电纳值，填 f 换算 C）'))
        add('两侧 Q', qLoad.toFixed(2) + ' / ' + qSrc.toFixed(2) + '（有载 Q=' + qParsed.toFixed(2) + '）')
        notes.push('虚电阻法（everythingrf）：Rv=R大/(1+Q²)，每侧 Qi=√(Ri/Rv−1)；串臂 X=(Q1+Q2)·Rv 为电感，两并臂 Bi=Qi/Ri 为电容。')
        notes.push('默认低通结构：两并 C、一串 L；高通变体把串 L 换成串 C、并 C 换成并 L，电抗/电纳数值不变（同一 ω 换算）。')
        if (qParsed - q0 < 1e-9) notes.push('Q=Q0 时一侧 Qi≈0，π 型退化为 L 型；Q 越大带宽越窄、元件值越极端。')
        break
      }

      case 'stub': {
        if (!hasF) return fail('单支节需要工作频率算波长')
        const wl = wavelength()
        if (!wl) return fail('单支节需要工作频率算波长')
        const mag2 = zl.re * zl.re + zl.im * zl.im
        if (mag2 === 0) return fail('ZL 不能为 0（短路负载无法用支节匹配）')
        const beta = TAU / wl.lambda
        const half = wl.lambda / 2
        const g = (z0 * zl.re) / mag2
        const b = (-z0 * zl.im) / mag2
        add('归一导纳 y=Z0/ZL', g.toFixed(4) + (b >= 0 ? ' + j' : ' − j') + Math.abs(b).toFixed(4))
        add('波长 λ', fmtQty(wl.lambda * 1000, 'mm') + '（εr(eff)=' + wl.er + '）')
        if (zl.re <= 0) return fail('纯电抗/负阻负载（|Γ|=1）单支节不可匹配：请先串/并电抗抵消虚部，或改用双支节/L/π 型')
        const A = g - b * b - g * g
        const B = 2 * b
        const C = g - 1
        let roots: number[]
        if (Math.abs(A) < 1e-12) {
          roots = Math.abs(B) < 1e-12 ? (Math.abs(C) < 1e-9 ? [0] : []) : [-C / B]
          if (roots.length === 0) return fail('归一负载落在退化位置（g=1 圆附近无实根），请改用双支节或 L/π 型')
        } else {
          const disc = B * B - 4 * A * C
          if (disc < 0) return fail('归一负载在史密斯图 g=1 圆外（失配过大），单支节不可解，请改用双支节或 L/π 型')
          roots = [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)]
        }
        if (roots.length === 2 && Math.abs(roots[0] - roots[1]) < 1e-9) roots = [roots[0]]
        const stubEnd = ctx.getString(payload, 'stubend', 'short')
        roots.forEach((t, i) => {
          let d = Math.atan(t) / beta
          if (d < 0) d += half
          const dr = 1 - b * t
          const di = g * t
          const dn = dr * dr + di * di
          const bIn = dn === 0 ? 0 : ((b + t) * dr - g * di) / dn
          let l =
            stubEnd === 'open'
              ? Math.atan(-bIn) / beta
              : Math.abs(bIn) < 1e-9
                ? half / 2
                : Math.atan(1 / bIn) / beta
          l = ((l % half) + half) % half
          add(
            '解 ' + (i + 1),
            'd=' + fmtQty(d * 1000, 'mm') + '（' + electrical(beta * d) + '°） · ' +
              (stubEnd === 'open' ? '开路' : '短路') + '支节 l=' + fmtQty(l * 1000, 'mm') + '（' + electrical(beta * l) + '°） · b_in=' + bIn.toFixed(4)
          )
        })
        notes.push('Pozar 单支节：解 (g−b²−g²)t²+2bt+(g−1)=0（t=tanβd，A≈0 时退化一次方程），在距负载 d 处并接支节抵消电纳 b_in。')
        notes.push('短支节 tanβl=1/b_in（b_in=0 时取 λ/4），开支节 tanβl=−b_in；l 均对 λ/2 取模。d 可沿远离负载方向平移 ±n·λ/2 仍成立。')
        notes.push('微带实现用 εr(eff) 近似波长 λ=λ0/√εr(eff)；两个解都列出，按需选结构更短或更易布板的一组。')
        break
      }

      case 'qtr': {
        if (!pureResistive(zl.re)) return fail('λ/4 变换按纯阻负载计算，请把虚部先抵消')
        if (!(zl.re > 0)) return fail('负载必须为正电阻')
        const z1 = Math.sqrt(z0 * zl.re)
        const gamma = Math.abs(zl.re - z0) / (zl.re + z0)
        add('λ/4 线特性阻抗 Z1', fmtOhm(z1) + '（= √(Z0·ZL)）')
        add('失配 |Γ|', gamma.toFixed(4) + '（VSWR ' + ((1 + gamma) / (1 - gamma)).toFixed(2) + '）')
        if (gamma < 1e-9) {
          add('匹配带宽', '≈100%：ZL 已等于 Z0，宽带不成问题')
        } else {
          const rho = 0.2
          if (rho >= 2 * gamma) {
            add('匹配带宽（ρ=0.2 纹波设计）', '≥100%：按单节公式已覆盖全频段，宽带不成问题')
          } else {
            const bw = (4 / Math.PI) * Math.asin(Math.min(1, rho / (2 * gamma)))
            add('匹配带宽（ρ=0.2 纹波设计）', '分数带宽 ' + (bw * 100).toFixed(1) + '%')
            if (hasF) add('带宽范围', fmtHz(fHz * (1 - bw / 2)) + ' ~ ' + fmtHz(fHz * (1 + bw / 2)) + '（中心 ' + fmtHz(fHz) + '）')
          }
        }
        const wl = wavelength()
        if (wl) add('λ/4 长度', fmtQty((wl.lambda / 4) * 1000, 'mm') + '（εr(eff)=' + wl.er + '，λ=' + fmtQty(wl.lambda * 1000, 'mm') + '）')
        else notes.push('填工作频率 f（可再填 εr(eff)）后给出 λ/4 物理长度；缺 f 时只给 Z1 与带宽。')
        notes.push('单节 λ/4（Pozar 口径）：Z1=√(Z0·RL)，带宽按最大反射纹波 ρ=0.2、FBW=(4/π)·asin(ρ/(2|Γ|)) 估算；更宽带改用多节（二项式/切比雪夫）。')
        break
      }

      default:
        return fail('未知匹配类型：' + mode)
    }

    const summary = outputs.length > 0 ? outputs[0].label + ' = ' + outputs[0].value : '已计算'
    const preview = [summary, ...outputs.slice(1).map((item) => item.label + '：' + item.value), '', ...notes].join('\n')
    return { ok: true, resultSummary: summary, outputs, preview }
  }
}
