import type {
  AppSettings,
  DependencyId,
  NoteKind,
  Priority,
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

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  1: { label: '高', color: '#EF4444' },
  2: { label: '中', color: '#F59E0B' },
  3: { label: '低', color: '#38BDF8' }
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
  convert: { label: '格式转换', color: '#6366F1', description: '文档/媒体格式互转' },
  download: { label: '下载整理', color: '#22C55E', description: '资源下载与归档' },
  extract: { label: '提取', color: '#22D3EE', description: '网页与截图内容抽取' },
  calc: { label: '计算', color: '#F59E0B', description: '单位换算与电路计算' },
  flashcard: { label: '卡片', color: '#A855F7', description: '学习卡片制作' }
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
  userName: '学习者',
  reviewAlgorithm: 'sm2',
  dailyReviewLimit: 20,
  notifyLeadMinutes: 10,
  autoScheduleNextDay: true,
  autoScheduleHour: 9,
  workStartHour: 8,
  workEndHour: 22,
  defaultFocusMinutes: 25,
  dataDir: ''
}

export const SEARCH_MIN_TRIGRAM_LENGTH = 3
