/**
 * 工程量解析与格式化，供计算类工具共用。
 * 输入接受工程计数法：10k、4m7、100n、1u、2p2、1e-9、1,000，可带单位字母（F / H / R / ohm / Hz）。
 * 频率写法里的 m 按「兆」处理（100mhz = 1e8），其余量级严格区分大小写（m=毫，M=兆）。
 */

/** 量级字母 -> 10 的幂；用幂而不是乘数，避免 100 * 1e-9 这类浮点残渣 */
const PREFIX_EXP: Record<string, number> = {
  a: -18,
  f: -15,
  p: -12,
  n: -9,
  u: -6,
  m: -3,
  k: 3,
  K: 3,
  M: 6,
  G: 9,
  T: 12
}

/** 解析成基准单位数值；解析不出来返回 null */
export function parseQty(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let text = String(raw ?? '').trim().replace(/[,\s]/g, '').replace(/[µμ]/g, 'u')
  if (text === '') return null
  let hz = false
  if (/hz$/i.test(text)) {
    hz = true
    text = text.slice(0, -2)
  } else if (/ohm$/i.test(text)) {
    text = text.slice(0, -3)
  } else if (/[ωΩ]$/.test(text)) {
    text = text.slice(0, -1)
  }
  if (/^[-+]?[0-9.]+e[-+]?[0-9]+$/i.test(text)) {
    const direct = Number(text)
    return Number.isFinite(direct) ? direct : null
  }
  const match = /^([-+]?[0-9]*\.?[0-9]+)([a-zA-Z]*)([0-9]*)$/.exec(text)
  if (!match) return null
  const head = match[1]
  const letters = match[2]
  const tail = match[3]
  let exponent = 0
  if (letters !== '') {
    const found = PREFIX_EXP[letters[0]]
    exponent = found ?? 0
    if (hz && letters[0] === 'm') exponent = 6
  }
  // 4m7 这类写法：量级字母后的数字接在小数点之后；已带小数点的（4.5m）忽略尾数
  const mantissa = tail === '' || head.includes('.') ? head : head + '.' + tail
  const value = Number(`${mantissa}e${exponent}`)
  return Number.isFinite(value) ? value : null
}

const LADDER: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f']
]

/** 自动挑量级前缀，把数值写成 4.7 kΩ 这种形式 */
export function fmtQty(value: number, unit = '', digits = 4): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return `0${unit ? ` ${unit}` : ''}`
  const abs = Math.abs(value)
  let step = LADDER[LADDER.length - 1]
  for (const candidate of LADDER) {
    if (abs >= candidate[0]) {
      step = candidate
      break
    }
  }
  const scaled = value / step[0]
  const text = Number(scaled.toPrecision(digits)).toString()
  return `${text}${step[1]}${unit ? ` ${unit}` : ''}`
}

export const fmtHz = (value: number): string => fmtQty(value, 'Hz')
export const fmtOhm = (value: number): string => fmtQty(value, 'Ω')
export const fmtFarad = (value: number): string => fmtQty(value, 'F')
export const fmtHenry = (value: number): string => fmtQty(value, 'H')
export const fmtVolt = (value: number): string => fmtQty(value, 'V')
export const fmtWatt = (value: number): string => fmtQty(value, 'W')

export function fmtSeconds(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 60) return `${Number((value / 60).toPrecision(4))} min`
  return fmtQty(value, 's')
}

/** E24（电阻常用）、E12、E6（电容常用）三个标准系列的首数 */
export const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 33, 39, 47, 56, 68, 82, 91]
export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82]
export const E6 = [10, 15, 22, 33, 47, 68]

/** 就近取标准系列值，返回该值与偏差百分比 */
export function nearestSeries(value: number, series: number[]): { value: number; error: number } | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const decade = Math.floor(Math.log10(value))
  let best: { value: number; error: number } | null = null
  for (const shift of [-1, 0, 1]) {
    for (const base of series) {
      const candidate = (base / 10) * Math.pow(10, decade + shift)
      const error = ((candidate - value) / value) * 100
      if (best === null || Math.abs(error) < Math.abs(best.error)) best = { value: candidate, error }
    }
  }
  return best
}

/** 就近标准值一行文案：4.63 kΩ → 4.7 kΩ（+1.5%） */
export function standardText(value: number, unit: string, series: number[]): string {
  const nearest = nearestSeries(value, series)
  if (!nearest) return '—'
  return `${fmtQty(nearest.value, unit)}（${nearest.error >= 0 ? '+' : ''}${nearest.error.toFixed(1)}%）`
}

export const TAU = 2 * Math.PI