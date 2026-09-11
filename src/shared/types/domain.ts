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
  dataDir: string
}
