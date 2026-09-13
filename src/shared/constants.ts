import type {
  AppSettings,
  ClockLayout,
  ClockStyle,
  DependencyId,
  FontSize,
  NoteKind,
  ProjectKind,
  TaskStatus,
  ToolCategory,
  EventType
} from './types/domain'

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

/** 艾宾浩斯固定复习间隔（天），作为 SM-2 的回退方案 */
export const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30, 60, 120]

/** SM-2 默认参数 */
export const SM2_DEFAULT_EASE = 2.5
export const SM2_MIN_EASE = 1.3
export const SM2_MAX_EASE = 3.2
export const SM2_MAX_INTERVAL_DAYS = 365

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
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
