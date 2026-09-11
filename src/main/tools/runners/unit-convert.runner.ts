import type { ToolDefinition } from '../types'

interface UnitDef {
  category: string
  label: string
  toBase: (value: number) => number
  fromBase: (value: number) => number
}

function linear(factor: number): Pick<UnitDef, 'toBase' | 'fromBase'> {
  return { toBase: (v) => v * factor, fromBase: (v) => v / factor }
}

const CELSIUS: Pick<UnitDef, 'toBase' | 'fromBase'> = {
  toBase: (c) => c + 273.15,
  fromBase: (k) => k - 273.15
}
const FAHRENHEIT: Pick<UnitDef, 'toBase' | 'fromBase'> = {
  toBase: (f) => (f - 32) / 1.8 + 273.15,
  fromBase: (k) => (k - 273.15) * 1.8 + 32
}

export const UNITS: Record<string, UnitDef> = {
  m: { category: '长度', label: '米 (m)', ...linear(1) },
  km: { category: '长度', label: '千米 (km)', ...linear(1000) },
  cm: { category: '长度', label: '厘米 (cm)', ...linear(0.01) },
  mm: { category: '长度', label: '毫米 (mm)', ...linear(0.001) },
  um: { category: '长度', label: '微米 (µm)', ...linear(1e-6) },
  nm: { category: '长度', label: '纳米 (nm)', ...linear(1e-9) },
  mi: { category: '长度', label: '英里 (mi)', ...linear(1609.344) },
  yd: { category: '长度', label: '码 (yd)', ...linear(0.9144) },
  ft: { category: '长度', label: '英尺 (ft)', ...linear(0.3048) },
  inch: { category: '长度', label: '英寸 (in)', ...linear(0.0254) },
  nmi: { category: '长度', label: '海里 (nmi)', ...linear(1852) },
  li: { category: '长度', label: '里', ...linear(500) },

  kg: { category: '质量', label: '千克 (kg)', ...linear(1) },
  g: { category: '质量', label: '克 (g)', ...linear(0.001) },
  mg: { category: '质量', label: '毫克 (mg)', ...linear(1e-6) },
  t: { category: '质量', label: '吨 (t)', ...linear(1000) },
  lb: { category: '质量', label: '磅 (lb)', ...linear(0.45359237) },
  oz: { category: '质量', label: '盎司 (oz)', ...linear(0.028349523) },
  jin: { category: '质量', label: '斤', ...linear(0.5) },

  'm2': { category: '面积', label: '平方米 (m²)', ...linear(1) },
  'km2': { category: '面积', label: '平方千米 (km²)', ...linear(1e6) },
  'cm2': { category: '面积', label: '平方厘米 (cm²)', ...linear(1e-4) },
  ha: { category: '面积', label: '公顷 (ha)', ...linear(10000) },
  mu: { category: '面积', label: '亩', ...linear(666.6667) },
  acre: { category: '面积', label: '英亩 (acre)', ...linear(4046.8564) },
  'ft2': { category: '面积', label: '平方英尺 (ft²)', ...linear(0.092903) },

  L: { category: '体积', label: '升 (L)', ...linear(1) },
  mL: { category: '体积', label: '毫升 (mL)', ...linear(0.001) },
  'm3': { category: '体积', label: '立方米 (m³)', ...linear(1000) },
  gal: { category: '体积', label: '美制加仑 (gal)', ...linear(3.7854118) },
  qt: { category: '体积', label: '夸脱 (qt)', ...linear(0.9463529) },
  floz: { category: '体积', label: '液体盎司 (fl oz)', ...linear(0.0295735) },

  mps: { category: '速度', label: '米/秒 (m/s)', ...linear(1) },
  kmph: { category: '速度', label: '千米/时 (km/h)', ...linear(0.2777778) },
  mph: { category: '速度', label: '英里/时 (mph)', ...linear(0.44704) },
  kn: { category: '速度', label: '节 (kn)', ...linear(0.5144444) },

  B: { category: '数据量', label: '字节 (B)', ...linear(1) },
  KB: { category: '数据量', label: '千字节 (KB)', ...linear(1024) },
  MB: { category: '数据量', label: '兆字节 (MB)', ...linear(1048576) },
  GB: { category: '数据量', label: '吉字节 (GB)', ...linear(1073741824) },
  TB: { category: '数据量', label: '太字节 (TB)', ...linear(1099511627776) },
  bit: { category: '数据量', label: '比特 (bit)', ...linear(0.125) },

  ms: { category: '时间', label: '毫秒 (ms)', ...linear(0.001) },
  s: { category: '时间', label: '秒 (s)', ...linear(1) },
  min: { category: '时间', label: '分钟 (min)', ...linear(60) },
  h: { category: '时间', label: '小时 (h)', ...linear(3600) },
  day: { category: '时间', label: '天 (d)', ...linear(86400) },
  week: { category: '时间', label: '周', ...linear(604800) },

  Pa: { category: '压强', label: '帕斯卡 (Pa)', ...linear(1) },
  kPa: { category: '压强', label: '千帕 (kPa)', ...linear(1000) },
  MPa: { category: '压强', label: '兆帕 (MPa)', ...linear(1e6) },
  bar: { category: '压强', label: '巴 (bar)', ...linear(1e5) },
  atm: { category: '压强', label: '标准大气压 (atm)', ...linear(101325) },
  mmHg: { category: '压强', label: '毫米汞柱 (mmHg)', ...linear(133.3224) },
  psi: { category: '压强', label: '磅力/平方英寸 (psi)', ...linear(6894.757) },

  J: { category: '能量', label: '焦耳 (J)', ...linear(1) },
  kJ: { category: '能量', label: '千焦 (kJ)', ...linear(1000) },
  cal: { category: '能量', label: '卡 (cal)', ...linear(4.184) },
  kcal: { category: '能量', label: '千卡 (kcal)', ...linear(4184) },
  Wh: { category: '能量', label: '瓦时 (Wh)', ...linear(3600) },
  kWh: { category: '能量', label: '千瓦时 (kWh)', ...linear(3.6e6) },

  Hz: { category: '频率', label: '赫兹 (Hz)', ...linear(1) },
  kHz: { category: '频率', label: '千赫 (kHz)', ...linear(1000) },
  MHz: { category: '频率', label: '兆赫 (MHz)', ...linear(1e6) },
  GHz: { category: '频率', label: '吉赫 (GHz)', ...linear(1e9) },

  deg: { category: '角度', label: '度 (°)', ...linear(1) },
  rad: { category: '角度', label: '弧度 (rad)', ...linear(57.29577951) },
  grad: { category: '角度', label: '百分度 (grad)', ...linear(0.9) },

  C: { category: '温度', label: '摄氏度 (°C)', ...CELSIUS },
  F: { category: '温度', label: '华氏度 (°F)', ...FAHRENHEIT },
  K: { category: '温度', label: '开尔文 (K)', ...linear(1) }
}

const OPTIONS = Object.entries(UNITS).map(([value, def]) => ({ label: def.label, value }))

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) return value.toExponential(6)
  return String(Number(value.toPrecision(10)))
}

export const unitConvertTool: ToolDefinition = {
  manifest: {
    id: 'unit-convert',
    name: '单位换算',
    category: 'calc',
    description:
      '覆盖长度、质量、面积、体积、速度、数据量、时间、压强、能量、频率、角度、温度共 12 类常用单位，自动识别单位所属类别并校验一致性。',
    icon: 'Ruler',
    requires: [],
    builtin: true,
    fields: [
      { name: 'value', label: '数值', type: 'number', required: true, defaultValue: 1 },
      { name: 'fromUnit', label: '原单位', type: 'select', required: true, defaultValue: 'km', options: OPTIONS },
      { name: 'toUnit', label: '目标单位', type: 'select', required: true, defaultValue: 'm', options: OPTIONS }
    ]
  },

  async run(payload, ctx) {
    const value = ctx.getNumber(payload, 'value', Number.NaN)
    const fromUnit = ctx.getString(payload, 'fromUnit', 'm')
    const toUnit = ctx.getString(payload, 'toUnit', 'm')

    if (!Number.isFinite(value)) return { ok: false, error: '请填写有效的数值' }
    const from = UNITS[fromUnit]
    const to = UNITS[toUnit]
    if (!from || !to) return { ok: false, error: `未知单位：${!from ? fromUnit : toUnit}` }
    if (from.category !== to.category) {
      return { ok: false, error: `单位类别不一致：${fromUnit} 属于「${from.category}」，${toUnit} 属于「${to.category}」` }
    }

    const converted = to.fromBase(from.toBase(value))
    const readable = formatNumber(converted)
    return {
      ok: true,
      resultSummary: `${formatNumber(value)} ${fromUnit} = ${readable} ${toUnit}`,
      outputs: [
        { label: '单位类别', value: from.category },
        { label: '输入', value: `${formatNumber(value)} ${from.label}` },
        { label: '结果', value: `${readable} ${to.label}` }
      ],
      preview: `${formatNumber(value)} ${fromUnit} = ${readable} ${toUnit}`
    }
  }
}
