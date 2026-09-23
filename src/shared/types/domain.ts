// 领域模型：三层（任务中枢 / 工具集 / 统计复盘）共用的类型定义

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type ProjectKind = 'course' | 'project'
export type NoteKind = 'note' | 'material' | 'flashcard'
/**
 * 笔记的阅读模式（导入时按文件格式自动判定）：
 * - text   可编辑文本：Markdown / 纯文本 / 代码 / CSV 等，进阅读器后可以改
 * - pages  只读书页：PDF、Word、PPT、Excel 等，按原文件版式逐页显示（含图片与排版）
 * - rich   只读富文本：网页与 EPUB，按原 HTML 排版分页显示
 */
export type NoteViewMode = 'text' | 'pages' | 'rich'
/** 书库里的渲染文件类型（没有渲染件时为 null） */
export type NoteDocKind = 'pdf' | 'html' | null
/** 读书笔记标记：书签 / 重点页 / 注释 */
export type NoteMarkKind = 'bookmark' | 'star' | 'note' | 'highlight'
export type EventType = 'task' | 'review' | 'reminder' | 'focus'
export type ReviewStatus = 'active' | 'suspended' | 'mastered'
/** 0=重来 1=困难 2=一般 3=简单 */
export type ReviewRating = 0 | 1 | 2 | 3
export type ToolCategory = 'image' | 'audio' | 'video' | 'doc' | 'download' | 'extract' | 'calc' | 'flashcard'
export type DependencyId = 'pandoc' | 'ffmpeg' | 'yt-dlp' | 'playwright'
export type ThemeMode = 'dark' | 'light' | 'system'
/**
 * 「默认主题」下的风格（配色 / 观感）清单，共 18 种。
 * 1.2.4 起历史上那些独立命名的主题全部收编为默认主题的风格：
 * 选中「默认主题」后才能挑风格；风格只改颜色与观感，不改界面结构。
 * 全部风格与深浅色正交，任意风格都能在深色 / 浅色下使用。
 */
export type ThemePreset =
  /* 默认主题的 10 种配色 */
  | 'minimal'
  | 'mono'
  | 'paper'
  | 'ocean'
  | 'moss'
  | 'sand'
  | 'graphite'
  | 'midnight'
  | 'plum'
  | 'forest'
  /* 独立风格主题 */
  | 'nord'
  | 'dracula'
  | 'gruvbox'
  | 'catppuccin'
  | 'tokyonight'
  | 'synthwave'
  | 'brutalism'
  | 'terminal'
/**
 * 主题皮肤（顶层）。与「默认主题」下的风格并列，皮肤会重排界面结构：
 * 侧栏位置、导航形态、卡片造型、字体、页面底纹与状态栏一起变。
 * - default   默认主题：左侧栏 + 顶栏 + 卡片看板，风格由 themePreset 决定
 * - magazine  纸间杂志：导航抬到顶部成刊头，卡片改细线留白，正文衬线 + 首字下沉
 * - glass     琉璃极光：悬浮胶囊侧栏 + 毛玻璃卡片 + 极光渐变底
 * - terminal  荧光终端：全等宽字体 + ASCII 面板 + 底部状态行 + 扫描线
 * - brutalism 粗野主义：顶部块状标签导航 + 3px 描边 + 硬投影
 * - hud       数据驾驶舱：直角面板 + 四角括号 + 网格底纹 + 遥测状态栏
 * - soft      奶油拟物：无描边 + 双向柔光浮雕 + 全圆角
 * - retro     复古桌面：卡片带窗口标题栏 + 立体斜边 + 分格状态栏
 */
export type ThemeSkin =
  | 'default'
  | 'magazine'
  | 'glass'
  | 'terminal'
  | 'brutalism'
  | 'hud'
  | 'soft'
  | 'retro'
export type FontSize = 'sm' | 'md' | 'lg' | 'xl'
export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak'
/**
 * 时钟风格（只描述“时间怎么显示”）：flip=翻页大字，minimal=极简纯数字，ring=秒环，mono=终端等宽。
 * stacked 为 1.1.15 及更早的遗留值（等价于 flip + 日期在上），读取时自动归一化，不再作为可选项。
 */
export type ClockStyle =
  | 'flip'
  | 'minimal'
  | 'ring'
  | 'mono'
  | 'analog'
  | 'dot'
  | 'stack'
  | 'stacked'
/** 时钟摆放（只描述“日期相对时间的位置”）：可与任意风格自由组合 */
export type ClockLayout = 'date-top' | 'date-bottom' | 'date-left' | 'date-right'
/** 时钟日期行的显示格式 */
export type ClockDateFormat = 'cn' | 'slash' | 'dash' | 'dot' | 'en'

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
  /** 资料简介：导入文件时由用户填写，可后补（不再展示自动抽取的正文） */
  summary: string
  filePath: string | null
  tags: string[]
  /** 阅读模式：文本可编辑，书页 / 富文本只看 */
  viewMode: NoteViewMode
  /** 书库渲染文件类型 */
  docKind: NoteDocKind
  /** 书库渲染文件的绝对路径（<userData>/library/<noteId>/document.xxx） */
  docPath: string | null
  /** 书页总页数（文本笔记为 0） */
  pageCount: number
  /** 上次读到的页码，重新打开时回到这里 */
  lastPage: number
  /** 来源格式，如 PDF / PPTX / EPUB */
  sourceFormat: string | null
  /** 是否只读（导入的资料默认只读，文本类可解除） */
  readonly: boolean
  /** 手动排序序号：列表里拖拽排序后落库，越小越靠前（0 表示未参与过手动排序） */
  sortOrder: number
  createdAt: string
  updatedAt: string
  taskTitle?: string | null
  /** 归属项目 / 课程名（关联到项目而不是任务时用于列表与详情显示） */
  projectName?: string | null
  /** 已累计的阅读时长（分钟），由阅读界面按分钟落库后聚合得出 */
  readingMinutes?: number
  review?: ReviewItem | null
}

export interface NoteInput {
  id?: number
  taskId?: number | null
  projectId?: number | null
  title: string
  kind?: NoteKind
  content?: string
  /** 资料简介（导入时询问用户填写） */
  summary?: string
  filePath?: string | null
  tags?: string[]
  /** 是否生成/更新遗忘曲线复习条目 */
  enableReview?: boolean
  viewMode?: NoteViewMode
  docKind?: NoteDocKind
  docPath?: string | null
  pageCount?: number
  lastPage?: number
  sourceFormat?: string | null
  readonly?: boolean
}

/** 读书笔记：书签 / 重点页 / 页内注释，统一挂在笔记的某一页上 */
export interface NoteMark {
  id: number
  noteId: number
  kind: NoteMarkKind
  /** 所在页码；文本类笔记没有分页，固定为 0 */
  page: number
  /** 书签 / 重点页的显示名 */
  label: string
  /** 摘录原文（注释可从「本页文字」里选中文本带入） */
  quote: string
  /** 注释正文 */
  body: string
  /** 标记颜色（留空走强调色） */
  color: string
  /** 批注定位信息：圈画是归一化到页面的 {kind,points}，文字页的行内标记是 {kind:range,start,end}，空串 = 整页注释 */
  region: string
  createdAt: string
}

export interface NoteMarkInput {
  id?: number
  noteId: number
  kind: NoteMarkKind
  page?: number
  label?: string
  quote?: string
  body?: string
  color?: string
  region?: string
}

/** 阅读器需要的文档信息：渲染件类型 + 页数 + 上次阅读位置 */
/** 页面提取：把任意几页拼成一份新资料（v1.2.5） */
export interface NoteExtractInput {
  noteId: number
  /** 1 起的页码，可乱序，内部会去重并按原文顺序排 */
  pages: number[]
  title?: string
  /** 传了就同时另存一份 PDF 到该路径 */
  saveTo?: string
}

export interface NoteExtractResult {
  note: Note
  savedPath: string | null
}

export interface NoteDocInfo {
  note: Note
  viewMode: NoteViewMode
  docKind: NoteDocKind
  pageCount: number
  /** PDF 字节（viewMode=pages 且 docKind=pdf） */
  data: Uint8Array | null
  /** 自包含 HTML（viewMode=rich） */
  html: string | null
  /** 文本模式的正文 */
  text: string
  sourcePath: string | null
  sourceFormat: string | null
  readonly: boolean
}

/** 导入外部文档为笔记时的选项 */
export interface NoteImportOptions {
  /** 归属任务（不传则不关联） */
  taskId?: number | null
  /** 归属项目，缺省时跟随任务 */
  projectId?: number | null
  /** 资料简介：导入前询问用户填写，留空即不填 */
  summary?: string
  /** 导入为哪种类型，默认「资料」 */
  kind?: NoteKind
  /** 是否按一级标题把长文档拆成多条笔记 */
  splitByHeading?: boolean
}

/** 单个文件的导入结果 */
export interface NoteImportItem {
  file: string
  ok: boolean
  /** 失败原因（ok=false 时有值） */
  reason?: string
  /** 成功时生成的笔记 id（拆分后可能多条） */
  noteIds?: number[]
  format?: string
  chars?: number
  engine?: string
  /** 导入后采用的阅读模式 */
  viewMode?: NoteViewMode
  /** 书页页数（PDF 已知时给出） */
  pageCount?: number
  /** 正文抽取不完整时的提示 */
  warning?: string
}

export interface NoteImportSummary {
  created: Note[]
  items: NoteImportItem[]
}

/** 导入进度：主进程逐文件推送，渲染层据此画进度条 */
export interface NoteImportProgress {
  /** 本批文件总数 */
  total: number
  /** 已完成的文件数 */
  done: number
  /** 当前文件名 */
  file: string
  /** 当前阶段 */
  stage: 'queue' | 'parse' | 'render' | 'store' | 'done'
  /** 0-100 总进度 */
  percent: number
  /** 已用时（毫秒） */
  elapsed: number
  /** 预计剩余（毫秒，按均速估算） */
  eta: number
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
  /** 直接归属的项目 / 课程：没有关联任务时，专注与阅读时间记在项目上 */
  projectId: number | null
  /** 阅读时长来源的笔记（专注会话为 null） */
  noteId: number | null
  startedAt: string
  endedAt: string | null
  durationMinutes: number
  note: string
  createdAt: string
  taskTitle?: string | null
  projectName?: string | null
  noteTitle?: string | null
}

/** 阅读计时落库的入参：把一段阅读时间记到笔记关联的任务 / 项目上 */
export interface ReadingLogInput {
  noteId: number
  taskId?: number | null
  projectId?: number | null
  minutes: number
  label?: string
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
  /** 主题皮肤（顶层）；只有在「默认主题」下才由 themePreset 决定风格 */
  themeSkin: ThemeSkin
  /** 「默认主题」下的风格（配色 / 观感） */
  themePreset: ThemePreset
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
  /** 页面时钟风格（时间显示方式） */
  clockStyle: ClockStyle
  /** 页面时钟摆放（日期相对时间的位置），与风格相互独立 */
  clockLayout: ClockLayout
  /** 时钟字号（px）；0 = 随时块尺寸自适应，取值限定在 CLOCK_SIZE_TIERS 档位内 */
  clockFontSize: number
  /** 时钟笔画粗细，取值限定在 CLOCK_WEIGHT_TIERS 档位内 */
  clockFontWeight: number
  /** 时钟横向拉伸（%），取值限定在 CLOCK_WIDTH_TIERS 档位内 */
  clockWidthScale: number
  /** 时钟纵向拉伸（%），取值限定在 CLOCK_HEIGHT_TIERS 档位内 */
  clockHeightScale: number
  /** 时钟字距（0.01em，可为负值收紧），取值限定在 CLOCK_SPACING_TIERS 档位内 */
  clockLetterSpacing: number
  /** 时钟日期行是否显示 */
  clockShowDate: boolean
  /** 时钟日期格式 */
  clockDateFormat: ClockDateFormat
  /** 时钟日期是否附带星期 */
  clockShowWeekday: boolean
  /** 时钟日期字号（px），取值限定在 CLOCK_DATE_SIZE_TIERS 档位内 */
  clockDateSize: number
  /** 调试模式：开启后关闭窗口直接退出，不弹出「进入后台 / 真正关闭」确认 */
  debugMode: boolean
  /** 点击窗口关闭按钮的行为：ask=每次询问 background=进入后台 exit=直接退出 */
  closeAction: 'ask' | 'background' | 'exit'
  dataDir: string
}
