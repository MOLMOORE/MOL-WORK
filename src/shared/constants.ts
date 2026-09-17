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
  ThemePreset
} from './types/domain'

/** 软件名：侧边栏字标、窗口标题、托盘提示与系统通知统一使用 */
export const APP_NAME = 'MOL-WORK'

/**
 * 预设主题（配色方案）。
 * 每个主题的具体颜色写在 src/renderer/src/styles/index.css 的 [data-preset='xxx'] 旋钮块里，
 * 这里只登记名称、说明与预览色卡（预览色卡由 CSS 同源的 HSL 值换算而来）。
 */
export const THEME_PRESETS: {
  key: ThemePreset
  label: string
  hint: string
  /** 该主题原本的深浅色底色，用于「跟随系统」与预览 */
  nativeMode: 'dark' | 'light'
  preview: { dark: [string, string, string]; light: [string, string, string] }
}[] = [
  {
    key: 'minimal',
    label: '素白简约',
    hint: '冷中性灰白 + 克制的蓝，细描边、无渐变无光晕，默认主题',
    nativeMode: 'light',
    preview: { light: ['#F9FAFB', '#FFFFFF', '#1D7EED'], dark: ['#141619', '#1D2024', '#559EF1'] }
  },
  {
    key: 'mono',
    label: '极简黑白',
    hint: '完全去色，只靠明度与描边分层，最克制的排版',
    nativeMode: 'light',
    preview: { light: ['#FAFAFA', '#FFFFFF', '#242424'], dark: ['#141414', '#1F1F1F', '#F5F5F5'] }
  },
  {
    key: 'paper',
    label: '宣纸暖白',
    hint: '暖米色纸底 + 松绿，长时间阅读不刺眼',
    nativeMode: 'light',
    preview: { light: ['#F9F8F6', '#FFFFFF', '#2F7E61'], dark: ['#1F1B13', '#24201A', '#4FBF95'] }
  },
  {
    key: 'ocean',
    label: '靛青',
    hint: '清冷蓝绿，适合信息密度高的工作台',
    nativeMode: 'light',
    preview: { light: ['#FAFCFD', '#FFFFFF', '#178BB6'], dark: ['#141819', '#1D2224', '#3EB6DE'] }
  },
  {
    key: 'moss',
    label: '苔原',
    hint: '低饱和草绿，最省眼的一套',
    nativeMode: 'light',
    preview: { light: ['#F9FBF9', '#FFFFFF', '#307D52'], dark: ['#141815', '#1D221E', '#5CC08A'] }
  },
  {
    key: 'sand',
    label: '暮沙',
    hint: '暖沙底 + 赤陶橙，偏纸质暖调',
    nativeMode: 'light',
    preview: { light: ['#FAF7F3', '#FFFFFF', '#CC5E1F'], dark: ['#1A1611', '#211C17', '#E8813F'] }
  },
  {
    key: 'graphite',
    label: '石墨',
    hint: '纯中性深灰，强调色只用亮灰，克制的工业感',
    nativeMode: 'dark',
    preview: { light: ['#F7F8F9', '#FFFFFF', '#4A5158'], dark: ['#1A1C1E', '#222528', '#CFD4D8'] }
  },
  {
    key: 'midnight',
    label: '午夜靛蓝',
    hint: '深蓝夜色 + 亮靛强调，夜间久用',
    nativeMode: 'dark',
    preview: { light: ['#F7F8FD', '#FFFFFF', '#567AF0'], dark: ['#0F1119', '#1B1F2B', '#567AF0'] }
  },
  {
    key: 'plum',
    label: '紫棠',
    hint: '暗紫底 + 兰紫强调，保留上一版的紫色气质',
    nativeMode: 'dark',
    preview: { light: ['#FAF7FD', '#FFFFFF', '#7A2BD4'], dark: ['#151018', '#1F1924', '#7A2BD4'] }
  },
  {
    key: 'forest',
    label: '墨绿夜色',
    hint: '近黑的墨绿底 + 草绿强调，深色里的暖一点的选择',
    nativeMode: 'dark',
    preview: { light: ['#F6FAF8', '#FFFFFF', '#2F8A63'], dark: ['#0D1512', '#141E1A', '#60C797'] }
  }
]

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
  { key: 'en', label: '英文', sample: 'Sep 17, 2026' }
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

/** 艾宾浩斯固定复习间隔（天），作为 SM-2 的回退方案 */
export const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30, 60, 120]

/** SM-2 默认参数 */
export const SM2_DEFAULT_EASE = 2.5
export const SM2_MIN_EASE = 1.3
export const SM2_MAX_EASE = 3.2
export const SM2_MAX_INTERVAL_DAYS = 365

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
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

export const SEARCH_MIN_TRIGRAM_LENGTH = 3
