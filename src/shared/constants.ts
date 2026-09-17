import type {
  AppSettings,
  ClockDateFormat,
  ClockLayout,
  ClockStyle,
  DependencyId,
  FontSize,
  NoteKind,
  ProjectKind,
  TaskStatus,
  ToolCategory,
  EventType,
  ThemePreset,
  ThemeSkin
} from './types/domain'

/** 软件名：侧边栏字标、窗口标题、托盘提示与系统通知统一使用 */
export const APP_NAME = 'MOL-WORK'

export type ThemeGroup = 'palette' | 'style'

/**
 * 主题皮肤（顶层）：与「默认主题」下的风格并列，每种皮肤会重排界面结构。
 * layout 描述导航与模块摆放，shape 决定设置页预览缩略图的圆角语言。
 */
export const THEME_SKINS: {
  key: ThemeSkin
  label: string
  hint: string
  /** 该皮肤原本的深浅色底，用于「跟随系统」与预览 */
  nativeMode: 'dark' | 'light'
  layout: string
  shape: 'soft' | 'sharp' | 'pill'
  swatch: { dark: [string, string, string]; light: [string, string, string] }
}[] = [
  {
    key: 'default',
    label: '默认主题',
    hint: '左侧栏 + 顶栏 + 卡片看板。选它之后可在下方继续挑 18 种风格（配色 / 观感）',
    nativeMode: 'light',
    layout: '侧边导航 · 卡片看板',
    shape: 'soft',
    swatch: { light: ['#F9FAFB', '#FFFFFF', '#1D7EED'], dark: ['#141619', '#1D2024', '#559EF1'] }
  },
  {
    key: 'magazine',
    label: '纸间杂志',
    hint: '导航抬到顶部变成刊头，卡片去掉描边改用细线与留白，正文换衬线字并首字下沉，像翻一本杂志',
    nativeMode: 'light',
    layout: '顶部刊头 · 分栏正文',
    shape: 'sharp',
    swatch: { light: ['#F7F4EE', '#FFFFFF', '#9C3B2C'], dark: ['#191713', '#211E19', '#E0795F'] }
  },
  {
    key: 'glass',
    label: '琉璃极光',
    hint: '侧栏浮起成胶囊，卡片改半透明毛玻璃，页面底是缓慢流动的极光渐变，圆角与柔影整体放大',
    nativeMode: 'dark',
    layout: '悬浮胶囊侧栏 · 毛玻璃卡片',
    shape: 'pill',
    swatch: { light: ['#EEF3FB', '#FFFFFF', '#5B6CFF'], dark: ['#12141F', '#1B1F33', '#8AA0FF'] }
  },
  {
    key: 'terminal',
    label: '荧光终端',
    hint: '全等宽字体、ASCII 双线面板、底部状态行与扫描线，荧光绿磷光，整个软件变成一台终端',
    nativeMode: 'dark',
    layout: '终端侧栏 · 底部状态行',
    shape: 'sharp',
    swatch: { light: ['#F4F6F2', '#FFFFFF', '#0A6B3A'], dark: ['#050906', '#0A1410', '#3DDC84'] }
  },
  {
    key: 'brutalism',
    label: '粗野主义',
    hint: '导航改成顶部块状标签，3px 实描边 + 6px 硬投影，标题全部大写加粗，色块直接铺在页面上',
    nativeMode: 'light',
    layout: '顶部块状标签 · 硬投影色块',
    shape: 'sharp',
    swatch: { light: ['#F3F0E7', '#FFFFFF', '#FF3D00'], dark: ['#141414', '#1F1F1F', '#FFD400'] }
  },
  {
    key: 'hud',
    label: '数据驾驶舱',
    hint: '直角面板配四角括号与细准线，页面铺网格，标签改窄体大写字距，底部一条遥测状态栏',
    nativeMode: 'dark',
    layout: '窄图标侧栏 · 遥测状态栏',
    shape: 'sharp',
    swatch: { light: ['#F1F5F9', '#FFFFFF', '#0369A1'], dark: ['#060C15', '#0B1523', '#22D3EE'] }
  },
  {
    key: 'soft',
    label: '奶油拟物',
    hint: '描边全部消失，改用一明一暗双向柔光把模块「顶」出奶油底，控件一律胶囊形，配色降饱和',
    nativeMode: 'light',
    layout: '内嵌侧栏 · 浮雕卡片',
    shape: 'pill',
    swatch: { light: ['#EFEAE4', '#F6F2ED', '#B4846C'], dark: ['#211E1C', '#2A2624', '#D6A489'] }
  },
  {
    key: 'retro',
    label: '复古桌面',
    hint: '每张卡片长出蓝色渐变标题栏，窗口式立体斜边与方块滚动条，顶栏变成标题栏，底部一排状态格',
    nativeMode: 'light',
    layout: '标题栏卡片 · 分格状态栏',
    shape: 'sharp',
    swatch: { light: ['#C8C8C4', '#E6E6E2', '#0A2A8C'], dark: ['#1C1C1E', '#2A2A2E', '#7EA2FF'] }
  }
]

/** 皮肤 key -> 中文名 */
export function themeSkinLabel(skin: ThemeSkin | undefined): string {
  return THEME_SKINS.find((item) => item.key === (skin ?? 'default'))?.label ?? '默认主题'
}

/**
 * 预设主题清单。
 * 这 18 种全部属于「默认主题」，只有选中默认主题时才可选：
 * - group='palette'（配色风格）：10 种，只改颜色旋钮，版式与默认完全一致；
 * - group='style'（观感风格）：8 种，在配色之外还改圆角 / 描边 / 阴影 / 字体 / 页面底纹，
 *   配色值取自各风格的官方规范（Nord、Dracula、Gruvbox、Catppuccin、Tokyo Night 等）。
 * preview 三元组 = [页面底, 卡片底, 强调色]，由 styles/index.css 里的同名旋钮换算而来。
 */
export const THEME_PRESETS: {
  key: ThemePreset
  label: string
  hint: string
  group: ThemeGroup
  /** 该主题原本的深浅色底色，用于「跟随系统」与预览 */
  nativeMode: 'dark' | 'light'
  preview: { dark: [string, string, string]; light: [string, string, string] }
}[] = [
  {
    key: 'minimal',
    label: '素白简约',
    hint: '冷中性灰白 + 克制的蓝，细描边、无渐变无光晕，默认主题',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#F9FAFB', '#FFFFFF', '#1D7EED'], dark: ['#141619', '#1D2024', '#559EF1'] }
  },
  {
    key: 'mono',
    label: '极简黑白',
    hint: '完全去色，只靠明度与描边分层，最克制的一套',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#FAFAFA', '#FFFFFF', '#242424'], dark: ['#141414', '#1F1F1F', '#F5F5F5'] }
  },
  {
    key: 'paper',
    label: '宣纸暖白',
    hint: '暖米色纸底 + 松绿，长时间阅读不刺眼',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#F9F8F6', '#FFFFFF', '#2F7E61'], dark: ['#1F1B13', '#24201A', '#4FBF95'] }
  },
  {
    key: 'ocean',
    label: '靛青',
    hint: '清冷青蓝，适合信息密度高的工作台',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#FAFCFD', '#FFFFFF', '#0E88B8'], dark: ['#141819', '#1D2224', '#3EB6DE'] }
  },
  {
    key: 'moss',
    label: '苔原',
    hint: '草绿强调 + 微绿中性，最省眼的一套',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#F9FBF9', '#FFFFFF', '#2E834F'], dark: ['#141815', '#1D221E', '#5CC08A'] }
  },
  {
    key: 'sand',
    label: '暮沙',
    hint: '暖沙底 + 赤陶橙，纸质暖调',
    group: 'palette',
    nativeMode: 'light',
    preview: { light: ['#FAF7F3', '#FFFFFF', '#D25A17'], dark: ['#1A1611', '#211C17', '#E8813F'] }
  },
  {
    key: 'graphite',
    label: '石墨',
    hint: '纯中性深灰，强调色只用亮灰，工业感',
    group: 'palette',
    nativeMode: 'dark',
    preview: { light: ['#F7F8F9', '#FFFFFF', '#4A5158'], dark: ['#1A1C1E', '#222528', '#CFD4D8'] }
  },
  {
    key: 'midnight',
    label: '午夜靛蓝',
    hint: '深蓝夜色 + 亮靛强调，夜间久用',
    group: 'palette',
    nativeMode: 'dark',
    preview: { light: ['#F7F8FD', '#FFFFFF', '#4A6EF5'], dark: ['#0F1119', '#1B1F2B', '#567AF0'] }
  },
  {
    key: 'plum',
    label: '紫棠',
    hint: '暗紫底 + 兰紫强调，冷艳但不刺眼',
    group: 'palette',
    nativeMode: 'dark',
    preview: { light: ['#FAF7FD', '#FFFFFF', '#8A2BE2'], dark: ['#151018', '#1F1924', '#A65CF0'] }
  },
  {
    key: 'forest',
    label: '墨绿夜色',
    hint: '近黑的墨绿底 + 草绿强调，深色里偏暖的选择',
    group: 'palette',
    nativeMode: 'dark',
    preview: { light: ['#F6FAF8', '#FFFFFF', '#2F8A63'], dark: ['#0D1512', '#141E1A', '#60C797'] }
  },
  {
    key: 'nord',
    label: '北欧极光',
    hint: 'Polar Night 深蓝灰 + Frost 冰蓝，扁平无投影（Nord 官方配色）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#ECEFF4', '#E5E9F0', '#5E81AC'], dark: ['#2E3440', '#3B4252', '#88C0D0'] }
  },
  {
    key: 'dracula',
    label: '德古拉',
    hint: '暗紫灰底 + 粉 / 紫 / 青三色，卡片带霓虹描边（Dracula 官方配色）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#F8F8F2', '#FFFFFF', '#BD93F9'], dark: ['#282A36', '#343746', '#FF79C6'] }
  },
  {
    key: 'gruvbox',
    label: '复古木纹',
    hint: '暖褐底 + 姜黄赭红，直角与双线描边，像旧终端打印（Gruvbox 官方配色）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#FBF1C7', '#F2E5BC', '#AF3A00'], dark: ['#282828', '#3C3836', '#FABD2F'] }
  },
  {
    key: 'catppuccin',
    label: '卡布奇诺',
    hint: '豆沙紫中性 + 大圆角软阴影，最柔和的一套（Catppuccin Mocha / Latte）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#EFF1F5', '#F5F6FC', '#8839EF'], dark: ['#1E1E2E', '#313244', '#CBA6F7'] }
  },
  {
    key: 'tokyonight',
    label: '东京夜色',
    hint: '墨蓝底 + 靛青紫，卡片顶部一道渐变光带（Tokyo Night 官方配色）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#EAF1F8', '#FFFFFF', '#1A5CAB'], dark: ['#1A1B26', '#24283B', '#7AA2F7'] }
  },
  {
    key: 'synthwave',
    label: '赛博霓虹',
    hint: '渐变夜色页面底 + 半透明卡片与霓虹辉光（SynthWave ’84 风格）',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#FDE7F3', '#FFFFFF', '#D4267E'], dark: ['#1A1029', '#2A1B45', '#FF7EDB'] }
  },
  {
    key: 'brutalism',
    label: '粗野主义',
    hint: '2px 黑描边 + 硬投影 + 直角大写标题（Neo-brutalism 风格）',
    group: 'style',
    nativeMode: 'light',
    preview: { light: ['#FFF9E6', '#FFFFFF', '#FFD400'], dark: ['#111111', '#1B1B1B', '#FFD400'] }
  },
  {
    key: 'terminal',
    label: '荧光终端',
    hint: '纯黑底 + 荧光绿等宽字与扫描线，整站 CRT 终端观感',
    group: 'style',
    nativeMode: 'dark',
    preview: { light: ['#F2F5F2', '#FFFFFF', '#0A6B34'], dark: ['#050D07', '#0A1810', '#33FF66'] }
  }
]

export const THEME_GROUP_META: Record<ThemeGroup, { label: string; description: string }> = {
  palette: {
    label: '配色风格',
    description: '界面结构与默认主题完全一致，只换中性色与强调色'
  },
  style: {
    label: '观感风格',
    description: '在配色之外一起换圆角、描边、阴影、字体与页面底纹，观感差异明显'
  }
}

export function themePresetsOf(group: ThemeGroup): typeof THEME_PRESETS {
  return THEME_PRESETS.filter((item) => item.group === group)
}
/** 主题预览取哪套底色：跟随当前生效的深浅色 */
export function themePreview(preset: ThemePreset, mode: 'dark' | 'light'): [string, string, string] {
  const meta = THEME_PRESETS.find((item) => item.key === preset) ?? THEME_PRESETS[0]
  return meta.preview[mode]
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string; description: string }> = {
  todo: { label: '待开始', color: '#94A3B8', description: '已收集但尚未排入计划' },
  doing: { label: '进行中', color: '#6366F1', description: '正在推进的任务' },
  blocked: { label: '受阻', color: '#F59E0B', description: '被外部条件阻塞，需要等待或求助' },
  done: { label: '已完成', color: '#22C55E', description: '已经结束的任务' }
}

export const FONT_SIZE_META: Record<FontSize, { label: string; root: string }> = {
  sm: { label: '小', root: '14px' },
  md: { label: '标准', root: '16px' },
  lg: { label: '大', root: '18px' },
  xl: { label: '特大', root: '20px' }
}

export const PROJECT_KIND_META: Record<ProjectKind, string> = {
  course: '课程',
  project: '项目'
}

export const NOTE_KIND_META: Record<NoteKind, string> = {
  note: '笔记',
  material: '资料',
  flashcard: '卡片'
}

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string }> = {
  task: { label: '任务', color: '#6366F1' },
  review: { label: '复习', color: '#22D3EE' },
  reminder: { label: '提醒', color: '#F59E0B' },
  focus: { label: '专注', color: '#22C55E' }
}

export const TOOL_CATEGORY_META: Record<ToolCategory, { label: string; color: string; description: string }> = {
  image: { label: '图片转换', color: '#F472B6', description: '图片格式互转与压缩' },
  audio: { label: '音频转换', color: '#22D3EE', description: '音频格式互转与转码' },
  video: { label: '视频转换', color: '#6366F1', description: '视频格式互转与音轨提取' },
  doc: { label: '文档转换', color: '#A855F7', description: '文档格式互转（Pandoc）' },
  download: { label: '下载整理', color: '#22C55E', description: '资源下载与归档' },
  extract: { label: '提取', color: '#38BDF8', description: '网页与截图内容抽取' },
  calc: { label: '计算', color: '#F59E0B', description: '单位换算与电路计算' },
  flashcard: { label: '卡片', color: '#C084FC', description: '学习卡片制作' }
}

export const DEPENDENCY_META: Record<DependencyId, { label: string; installHint: string }> = {
  pandoc: {
    label: 'Pandoc',
    installHint: '文档格式转换引擎。Windows 可执行：winget install --id JohnMacFarlane.Pandoc'
  },
  ffmpeg: {
    label: 'FFmpeg',
    installHint: '音视频转换与截帧引擎。Windows 可执行：winget install --id Gyan.FFmpeg'
  },
  'yt-dlp': {
    label: 'yt-dlp',
    installHint: '资源下载引擎。Windows 可执行：winget install --id yt-dlp.yt-dlp'
  },
  playwright: {
    label: 'Playwright',
    installHint: '网页渲染与截图引擎。安装后需执行：npx playwright install chromium'
  }
}

/**
 * 时钟形状档位：全部改成「点一下就是一个确定值」的预设档位，
 * 不再用滑块（滑块在拖动时会出现某一段不响应、数值卡住的问题）。
 * 每个档位都直接写入原来的数值字段，老数据无需迁移。
 */
export const CLOCK_SIZE_TIERS: { value: number; label: string }[] = [
  { value: 0, label: '自适应' },
  { value: 40, label: '超小' },
  { value: 56, label: '小' },
  { value: 72, label: '中' },
  { value: 96, label: '大' },
  { value: 128, label: '特大' }
]

export const CLOCK_WEIGHT_TIERS: { value: number; label: string }[] = [
  { value: 300, label: '细' },
  { value: 400, label: '常规' },
  { value: 500, label: '中等' },
  { value: 600, label: '半粗' },
  { value: 700, label: '粗' },
  { value: 800, label: '特粗' }
]

export const CLOCK_WIDTH_TIERS: { value: number; label: string }[] = [
  { value: 80, label: '窄 80%' },
  { value: 90, label: '略窄 90%' },
  { value: 100, label: '标准 100%' },
  { value: 112, label: '略宽 112%' },
  { value: 125, label: '宽 125%' }
]

export const CLOCK_HEIGHT_TIERS: { value: number; label: string }[] = [
  { value: 80, label: '矮 80%' },
  { value: 90, label: '略矮 90%' },
  { value: 100, label: '标准 100%' },
  { value: 112, label: '略高 112%' },
  { value: 125, label: '高 125%' }
]

export const CLOCK_SPACING_TIERS: { value: number; label: string }[] = [
  { value: -4, label: '收紧' },
  { value: 0, label: '常规' },
  { value: 6, label: '宽松' },
  { value: 14, label: '很宽' },
  { value: 24, label: '极宽' }
]

export const CLOCK_DATE_SIZE_TIERS: { value: number; label: string }[] = [
  { value: 11, label: '小' },
  { value: 13, label: '标准' },
  { value: 16, label: '大' },
  { value: 20, label: '特大' }
]

/** 日期行的显示格式（示例都以 2026 年 9 月 17 日星期四为准） */
export const CLOCK_DATE_FORMATS: { key: ClockDateFormat; label: string; sample: string }[] = [
  { key: 'cn', label: '中文', sample: '2026年9月17日' },
  { key: 'slash', label: '斜杠', sample: '2026/9/17' },
  { key: 'dash', label: '短横', sample: '2026-09-17' },
  { key: 'dot', label: '缩写', sample: '09.17' },
  { key: 'en', label: '英文', sample: 'Sep 17, 2026 · Thu' }
]

/** 取最接近的档位：老版本用滑块存下的任意数值，读到时按最近档位显示 */
export function nearestTier(value: number, tiers: { value: number; label: string }[]): number {
  return tiers.reduce(
    (best, tier) => (Math.abs(tier.value - value) < Math.abs(best - value) ? tier.value : best),
    tiers[0].value
  )
}

/** 把日期格式化为设定样式（不含星期） */
export function formatClockDate(date: Date, format: ClockDateFormat): string {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const pad = (value: number): string => String(value).padStart(2, '0')
  switch (format) {
    case 'slash':
      return `${y}/${m}/${d}`
    case 'dash':
      return `${y}-${pad(m)}-${pad(d)}`
    case 'dot':
      return `${pad(m)}.${pad(d)}`
    case 'en':
      return `${MONTH_EN[m - 1]} ${d}, ${y}`
    case 'cn':
    default:
      return `${y}年${m}月${d}日`
  }
}

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_EN_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * 星期文本：日期格式选「英文」时星期同步显示为英文（其余格式仍用「星期X」），
 * 避免出现「Sep 17, 2026 · 星期四」这种中英混排。
 */
export function formatClockWeekday(date: Date, format: ClockDateFormat, full = false): string {
  const index = date.getDay()
  if (format === 'en') return full ? WEEKDAY_EN_FULL[index] : WEEKDAY_EN[index]
  return `星期${WEEKDAY_CN[index]}`
}

/** 艾宾浩斯固定复习间隔（天），作为 SM-2 的回退方案 */
export const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30, 60, 120]

/** SM-2 默认参数 */
export const SM2_DEFAULT_EASE = 2.5
export const SM2_MIN_EASE = 1.3
export const SM2_MAX_EASE = 3.2
export const SM2_MAX_INTERVAL_DAYS = 365

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  themeSkin: 'default',
  themePreset: 'minimal',
  fontSize: 'md',
  userName: 'MOL',
  reviewAlgorithm: 'sm2',
  dailyReviewLimit: 20,
  notifyLeadMinutes: 10,
  autoScheduleNextDay: true,
  autoScheduleHour: 9,
  workStartHour: 8,
  workEndHour: 22,
  defaultFocusMinutes: 25,
  pomodoroShortMinutes: 5,
  pomodoroLongMinutes: 15,
  pomodoroRoundsPerLong: 4,
  pomodoroAutoStartNext: true,
  pomodoroSound: true,
  recycleBinDays: 7,
  dialogSound: true,
  clockStyle: 'flip',
  clockLayout: 'date-bottom',
  clockFontSize: 0,
  clockFontWeight: 700,
  clockWidthScale: 100,
  clockHeightScale: 100,
  clockLetterSpacing: 0,
  clockShowDate: true,
  clockDateFormat: 'cn',
  clockShowWeekday: true,
  clockDateSize: 13,
  debugMode: false,
  closeAction: 'ask',
  dataDir: ''
}

/**
 * 归一化时钟设置（兼容 1.1.15 及更早版本的 stacked 旧值）：
 * stacked 等价于「翻页」风格 + 「日期在上」摆放；其余情况风格与摆放相互独立。
 */
export function resolveClockSettings(
  style: ClockStyle | undefined,
  layout: ClockLayout | undefined
): { style: Exclude<ClockStyle, 'stacked'>; layout: ClockLayout } {
  const safeLayout: ClockLayout = layout ?? 'date-bottom'
  if (style === undefined || style === 'stacked') {
    // 旧值 stacked：摆放保持默认「日期在下」时按原本的「日期在上」呈现，用户改过摆放则尊重其选择
    const layoutForLegacy: ClockLayout = style === 'stacked' && safeLayout === 'date-bottom' ? 'date-top' : safeLayout
    return { style: 'flip', layout: layoutForLegacy }
  }
  return { style, layout: safeLayout }
}

/** 笔记导入支持的扩展名：文件选择框、拖拽判定与格式说明共用同一份清单 */
export const IMPORT_EXTENSIONS: string[] = [
  '.pdf', '.docx', '.doc', '.odt', '.rtf', '.wps',
  '.pptx', '.ppt', '.odp',
  '.xlsx', '.xlsm', '.xls', '.csv', '.tsv',
  '.html', '.htm', '.xhtml', '.shtml', '.epub',
  '.md', '.markdown', '.mdown', '.mkd', '.txt', '.text', '.log',
  '.json', '.xml', '.yml', '.yaml', '.toml', '.ini', '.sql',
  '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bat', '.ps1',
  '.rst', '.org', '.tex', '.latex', '.opml', '.docbook', '.dbk', '.mediawiki', '.twiki', '.dokuwiki',
  '.creole', '.txt2tags', '.bib', '.ipynb', '.pps', '.pot'
]

/** 导入格式分组说明（设置页与笔记导入弹窗展示） */
export const IMPORT_FORMAT_GROUPS: { label: string; formats: string; mode: string }[] = [
  { label: '文档', formats: 'PDF · DOCX · DOC · ODT · RTF · WPS', mode: '原版式书页，只读' },
  { label: '演示', formats: 'PPTX · PPT · ODP', mode: '原版式书页（含图示与备注），只读' },
  { label: '表格', formats: 'XLSX · XLS · CSV · TSV', mode: '原版式书页 / 表格文字，只读' },
  { label: '网页与电子书', formats: 'HTML · EPUB · XML', mode: '原排版成书（图片内联），只读' },
  { label: '纯文本与代码', formats: 'MD · TXT · JSON · YAML · LOG · 源代码', mode: '可编辑正文' },
  { label: '需本机 Pandoc', formats: 'RST · ORG · TEX · IPYNB · DOCBOOK', mode: '转成可编辑文字' }
]

/** 拖拽 / 选择文件时用的 accept 串 */
export const IMPORT_ACCEPT_ATTR = IMPORT_EXTENSIONS.join(',')

export const SEARCH_MIN_TRIGRAM_LENGTH = 3
