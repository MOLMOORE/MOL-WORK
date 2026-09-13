// 领域模型：三层（任务中枢 / 工具集 / 统计复盘）共用的类型定义

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type ProjectKind = 'course' | 'project'
export type NoteKind = 'note' | 'material' | 'flashcard'
export type EventType = 'task' | 'review' | 'reminder' | 'focus'
export type ReviewStatus = 'active' | 'suspended' | 'mastered'
/** 0=重来 1=困难 2=一般 3=简单 */
export type ReviewRating = 0 | 1 | 2 | 3
export type ToolCategory = 'image' | 'audio' | 'video' | 'doc' | 'download' | 'extract' | 'calc' | 'flashcard'
export type DependencyId = 'pandoc' | 'ffmpeg' | 'yt-dlp' | 'playwright'
export type ThemeMode = 'dark' | 'light' | 'system'
export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak'
/** 时钟样式：flip=翻页大字，minimal=极简纯数字，ring=秒环，mono=终端等宽，stacked=日期在上 */
export type ClockStyle = 'flip' | 'minimal' | 'ring' | 'mono' | 'stacked'

export interface Project {
  id: number
  name: string
  color: string
  kind: ProjectKind
  description: string
  archived: boolean
  createdAt: string
  taskCount?: number
  doneCount?: number
  focusMinutes?: number
}

export interface ProjectInput {
  id?: number
  name: string
  color?: string
  kind?: ProjectKind
  description?: string
  archived?: boolean
}

export interface Task {
  id: number
  projectId: number | null
  projectName?: string | null
  projectColor?: string | null
  title: string
  detail: string
  status: TaskStatus
  /** 优先事项：日程中红标显示，排序最高 */
  isPriority: boolean
  /** 逾期事项：截止已到且未延期，优先级仅低于优先事项 */
  isOverdue: boolean
  /** 同一日期内的排序权重，越小越靠前 */
  sortOrder: number
  progress: number
  dueAt: string | null
  estimateMinutes: number
  tags: string[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  /** 回收站：删除时间（null 表示正常存在） */
  deletedAt?: string | null
  focusMinutes?: number
  noteCount?: number
  pendingReviews?: number
  scheduleCount?: number
}

export interface TaskInput {
  id?: number
  projectId?: number | null
  title: string
  detail?: string
  status?: TaskStatus
  isPriority?: boolean
  sortOrder?: number
  progress?: number
  dueAt?: string | null
  estimateMinutes?: number
  tags?: string[]
}

export interface TaskFilter {
  projectId?: number | null
  status?: TaskStatus | 'all'
  keyword?: string
  dueWithinDays?: number
  onlyOverdue?: boolean
  onlyPriority?: boolean
  limit?: number
}

export interface TaskDetail {
  task: Task
  schedules: ScheduleEvent[]
  notes: Note[]
  reviews: ReviewItem[]
  focusSessions: FocusSession[]
}

export interface Note {
  id: number
  taskId: number | null
  projectId: number | null
  title: string
  kind: NoteKind
  content: string
  filePath: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  taskTitle?: string | null
  review?: ReviewItem | null
}

export interface NoteInput {
  id?: number
  taskId?: number | null
  projectId?: number | null
  title: string
  kind?: NoteKind
  content?: string
  filePath?: string | null
  tags?: string[]
  /** 是否生成/更新遗忘曲线复习条目 */
  enableReview?: boolean
}

export interface ScheduleEvent {
  id: number
  taskId: number | null
  reviewItemId: number | null
  title: string
  type: EventType
  startAt: string
  endAt: string
  allDay: boolean
  reminderAt: string | null
  reminded: boolean
  note: string
  createdAt: string
  taskStatus?: TaskStatus | null
  projectName?: string | null
}

export interface ScheduleInput {
  id?: number
  taskId?: number | null
  reviewItemId?: number | null
  title: string
  type?: EventType
  startAt: string
  endAt: string
  allDay?: boolean
  reminderAt?: string | null
  note?: string
}

export interface ReviewItem {
  id: number
  noteId: number
  taskId: number | null
  title: string
  ease: number
  intervalDays: number
  repetitions: number
  lapses: number
  dueAt: string
  lastReviewedAt: string | null
  stage: number
  lastRating: number | null
  status: ReviewStatus
  createdAt: string
  noteTitle?: string | null
  projectName?: string | null
}

export interface FocusSession {
  id: number
  taskId: number | null
  startedAt: string
  endedAt: string | null
  durationMinutes: number
  note: string
  createdAt: string
  taskTitle?: string | null
}

export type ToolFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'path' | 'rating'

export interface ToolField {
  name: string
  label: string
  type: ToolFieldType
  placeholder?: string
  required?: boolean
  options?: { label: string; value: string }[]
  /** 动态选项来源，由主进程在返回清单前填充 */
  optionsSource?: 'tasks' | 'projects'
  defaultValue?: string | number | boolean
  hint?: string
  /** type=path 时用于调用系统选择对话框的形式 */
  pathKind?: 'file' | 'directory'
}

export interface ToolManifest {
  id: string
  name: string
  category: ToolCategory
  description: string
  icon: string
  fields: ToolField[]
  requires: DependencyId[]
  builtin: boolean
  enabled: boolean
  /** 是否仍被安装（false 表示用户已移除） */
  installed: boolean
  dependencyStatus?: DependencyStatus[]
}

export interface ToolRunRecord {
  id: number
  toolId: string
  toolName: string
  category: ToolCategory
  inputSummary: string
  status: 'success' | 'failed'
  durationMs: number
  resultPath: string | null
  resultSummary: string | null
  error: string | null
  createdAt: string
}

export interface ToolRunOutput {
  label: string
  value: string
}

export interface ToolRunResult {
  ok: boolean
  run: ToolRunRecord
  outputs: ToolRunOutput[]
  preview?: string
}

export interface DependencyStatus {
  id: DependencyId
  label: string
  available: boolean
  version: string | null
  installHint: string
  /** 实际解析到的可执行文件路径（未安装时为 null） */
  resolvedPath?: string | null
}

export interface ProjectTime {
  projectId: number | null
  projectName: string
  color: string
  focusMinutes: number
  taskCount: number
  doneCount: number
}

export interface TimelineEntry {
  id: string
  kind: 'focus' | 'tool' | 'task' | 'review' | 'memory'
  title: string
  at: string
  durationMinutes: number
  detail: string
}

export interface HourlyBucket {
  hour: string
  focusMinutes: number
  toolRuns: number
}

export interface DailyStats {
  date: string
  tasksCreated: number
  tasksCompleted: number
  focusMinutes: number
  toolRuns: number
  toolMinutes: number
  reviewsDone: number
  reviewsDue: number
  eventsCount: number
  projects: ProjectTime[]
  hourly: HourlyBucket[]
  timeline: TimelineEntry[]
}

export interface TrendPoint {
  date: string
  focusMinutes: number
  toolMinutes: number
  completed: number
  reviews: number
  toolRuns: number
}

export interface ProcrastinationItem {
  task: Task
  stalledDays: number
  overdueDays: number
  reason: string
  severity: 'high' | 'medium' | 'low'
  /** 该事项累计拖延次数（延期 + 逾期 + 完成时已逾期） */
  delayCount: number
  /** 该事项累计拖延时长（分钟） */
  delayMinutes: number
  /** 当前是否仍在逾期在途（未完成且已过截止） */
  activeOverdue: boolean
  /** 当前在途逾期时长（分钟），未在途时为 0 */
  activeDelayMinutes: number
  /** 综合拖延程度 0-100（仅由次数与单次时长决定） */
  degree: number
}

/** 拖延事件类型：defer=延期继续推迟，due=进入逾期状态，complete=完成时已超时 */
export type ProcrastinationEventKind = 'defer' | 'due' | 'complete'

/** 单条拖延事件（记忆流水） */
export interface ProcrastinationEvent {
  id: string
  taskId: number | null
  taskTitle: string
  kind: ProcrastinationEventKind
  /** 该次拖延时长（分钟） */
  delayMinutes: number
  /** 事件发生时间 */
  at: string
  note: string
}

export type ProcrastinationLevel = 'low' | 'medium' | 'high'

/** 单个周期（日 / 周 / 月）的拖延概览，用于横向对比 */
export interface ProcrastinationPeriod {
  key: 'day' | 'week' | 'month'
  label: string
  rangeFrom: string
  rangeTo: string
  /** 区间内拖延次数 */
  events: number
  /** 区间内累计拖延时长（分钟） */
  delayMinutes: number
  /** 单次平均拖延时长（分钟） */
  avgDelayMinutes: number
  /** 拖延程度 0-100 */
  degree: number
  level: ProcrastinationLevel
  /** 与本周期上一段相比的变化百分比（正数=恶化），无对比基准时为 null */
  changePercent: number | null
}

/** 序列聚合点（按天 / 周 / 月聚合），用于走势对比图 */
export interface ProcrastinationPoint {
  /** 天：yyyy-MM-dd；周：该周周一；月：yyyy-MM */
  key: string
  label: string
  events: number
  delayMinutes: number
  degree: number
}

export interface ProcrastinationReport {
  generatedAt: string
  /** 全量累计：拖延次数 / 拖延时长（分钟） */
  totalEvents: number
  totalDelayMinutes: number
  avgDelayMinutes: number
  /** 当前仍未完成的逾期事项数量与累计拖欠时长（分钟） */
  activeOverdueCount: number
  activeDelayMinutes: number
  /** 当前周期综合拖延程度 0-100 与等级 */
  degree: number
  level: ProcrastinationLevel
  /** 日 / 周 / 月 三个周期对比 */
  periods: ProcrastinationPeriod[]
  /** 走势序列 */
  daily: ProcrastinationPoint[]
  weekly: ProcrastinationPoint[]
  monthly: ProcrastinationPoint[]
  /** 最近的拖延记忆事件 */
  recentEvents: ProcrastinationEvent[]
  /** 拖延提醒文案 */
  advice: string[]
}

export interface DailyReport {
  date: string
  generatedAt: string
  summary: string
  highlights: string[]
  suggestions: string[]
  stats: DailyStats
}

export interface SearchHit {
  kind: 'task' | 'note' | 'tool' | 'event' | 'project' | 'review'
  refId: number | string
  title: string
  snippet: string
  meta: string
  score: number
}

export interface OverviewData {
  date: string
  todayTasks: Task[]
  dueReviews: ReviewItem[]
  upcomingEvents: ScheduleEvent[]
  todayFocusMinutes: number
  todayToolRuns: number
  todayCompleted: number
  pendingCount: number
  overdueCount: number
  estimateMinutes: number
  recentNotes: Note[]
}

export interface AppSettings {
  theme: ThemeMode
  fontSize: FontSize
  userName: string
  reviewAlgorithm: 'sm2' | 'ebbinghaus'
  dailyReviewLimit: number
  notifyLeadMinutes: number
  autoScheduleNextDay: boolean
  autoScheduleHour: number
  workStartHour: number
  workEndHour: number
  defaultFocusMinutes: number
  /** 番茄钟：短休息时长（分钟） */
  pomodoroShortMinutes: number
  /** 番茄钟：长休息时长（分钟） */
  pomodoroLongMinutes: number
  /** 番茄钟：每完成多少个专注进入一次长休息 */
  pomodoroRoundsPerLong: number
  /** 番茄钟：专注结束后自动进入休息 */
  pomodoroAutoStartNext: boolean
  /** 番茄钟：结束时声音提醒 */
  pomodoroSound: boolean
  /** 回收站保留天数：1=一天 7=一周 30=一个月 */
  recycleBinDays: number
  /** 弹窗出现时是否播放提示音 */
  dialogSound: boolean
  /** 页面时钟样式 */
  clockStyle: ClockStyle
  /** 点击窗口关闭按钮的行为：ask=每次询问 background=进入后台 exit=直接退出 */
  closeAction: 'ask' | 'background' | 'exit'
  dataDir: string
}
