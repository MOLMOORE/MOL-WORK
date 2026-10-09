import type {
  AppSettings,
  DailyReport,
  DailyStats,
  DependencyStatus,
  FocusSession,
  Note,
  NoteDocInfo,
  NoteExtractInput,
  NoteExtractResult,
  NoteImportOptions,
  NoteImportProgress,
  NoteImportSummary,
  NoteInput,
  NoteMark,
  NoteMarkInput,
  NoteMovePatch,
  OverviewData,
  ProcrastinationItem,
  ProcrastinationReport,
  Project,
  ProjectInput,
  ProjectTime,
  ReadingLogInput,
  ReviewItem,
  ReviewRating,
  ScheduleEvent,
  ScheduleInput,
  SearchHit,
  Task,
  TaskDetail,
  TaskFilter,
  TaskInput,
  ToolManifest,
  ToolRunRecord,
  ToolRunResult,
  TrendPoint
} from './domain'

/** 主进程 -> 渲染进程的推送事件 */
export const IPC_EVENTS = {
  reminder: 'event:reminder',
  dataChanged: 'event:data-changed',
  reviewAutoScheduled: 'event:review-auto-scheduled',
  closeRequest: 'event:close-request',
  noteImport: 'event:note-import-progress',
  windowState: 'event:window-state'
} as const

export interface ReminderPayload {
  eventId: number
  title: string
  body: string
  type: string
  startAt: string
}

export interface CloseRequestPayload {
  at: string
}

/** 无边框窗口的自绘标题栏需要的窗口状态 */
export interface WindowStatePayload {
  maximized: boolean
  fullscreen: boolean
}

export interface WorkstationApi {
  app: {
    getSettings(): Promise<AppSettings>
    updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
    getOverview(): Promise<OverviewData>
    getDataDir(): Promise<string>
    openPath(target: string): Promise<boolean>
    showItemInFolder(target: string): Promise<boolean>
    pickPath(mode: 'file' | 'directory'): Promise<string | null>
    checkDependencies(force?: boolean): Promise<DependencyStatus[]>
    exportReport(date: string): Promise<{ path: string; content: string }>
    seedDemo(): Promise<{ created: boolean }>
    /** 系统级弹窗提醒（后台可见，点击聚焦窗口） */
    notify(title: string, body: string): Promise<void>
    /** 隐藏窗口进入后台（托盘保持运行） */
    hideWindow(): Promise<void>
    /** 真正退出应用 */
    quitApp(): Promise<void>
    /** 运行诊断信息（含应用版本号，用于版本检查） */
    diagnostics(): Promise<Record<string, string>>
  }
  project: {
    list(): Promise<Project[]>
    save(input: ProjectInput): Promise<Project>
    remove(id: number): Promise<void>
  }
  task: {
    list(filter?: TaskFilter): Promise<Task[]>
    get(id: number): Promise<TaskDetail>
    create(input: TaskInput): Promise<Task>
    update(id: number, patch: Partial<TaskInput>): Promise<Task>
    /** 删除任务（进入回收站，软删除） */
    remove(id: number): Promise<void>
    toggle(id: number): Promise<Task>
    /** 拖拽到指定日期 */
    move(id: number, dayKey: string): Promise<Task>
    /** 重排同一日期内的任务顺序 */
    reorder(orderedIds: number[]): Promise<void>
    /** 截止时间已到的待办（用于弹窗警示） */
    due(referenceIso?: string): Promise<Task[]>
    /** 从回收站恢复 */
    restore(id: number): Promise<void>
    /** 彻底删除（不可恢复） */
    purge(id: number): Promise<void>
    /** 回收站列表 */
    listDeleted(): Promise<Task[]>
    /** 清理超过保留期的回收站任务 */
    purgeExpired(retentionDays: number): Promise<number>
    /** 逾期事项列表（升级后每 5 分钟重提醒） */
    listOverdue(): Promise<Task[]>
    /** 保持截止时间：升级为逾期事项 */
    markOverdue(id: number): Promise<Task>
    /** 延期：从当前时刻延后 N 秒 */
    defer(id: number, seconds: number): Promise<Task>
  }
  note: {
    list(taskId?: number | null): Promise<Note[]>
    get(id: number): Promise<Note>
    save(input: NoteInput): Promise<Note>
    /** 删除 = 移入回收站（软删除），保留期内可恢复 */
    remove(id: number): Promise<void>
    /** 快速删除模式：批量移入回收站，返回真正删掉的条数 */
    removeMany(ids: number[]): Promise<number>
    /** 多选模式：批量改归属（任务 / 项目 / 类型），返回改动条数 */
    moveMany(ids: number[], patch: NoteMovePatch): Promise<number>
    /** 回收站列表（按删除时间倒序） */
    listDeleted(): Promise<Note[]>
    /** 从回收站恢复，条目不存在时回 null */
    restore(id: number): Promise<Note | null>
    /** 彻底删除（不可恢复），同时清掉复习计划与书库渲染件 */
    purge(id: number): Promise<void>
    /** 清理超过保留期的回收站条目，返回数量 */
    purgeExpired(retentionDays: number): Promise<number>
    /** 弹出系统文件选择框（可多选）并导入 */
    importPick(options?: NoteImportOptions): Promise<NoteImportSummary>
    /** 只弹选择框拿路径，不导入：导入前先问用户填简介与关联（v1.2.4 第五轮） */
    pickPaths(): Promise<string[]>
    /** 导入指定路径的文件（拖拽进窗口时用） */
    importFiles(paths: string[], options?: NoteImportOptions): Promise<NoteImportSummary>
    /** 阅读器取文档：PDF 字节 / 自包含 HTML / 纯文本 */
    doc(id: number): Promise<NoteDocInfo>
    /** 记录阅读进度（页码），首次打开时顺带回填页数 */
    progress(id: number, page: number, pageCount?: number): Promise<Note>
    /** 读书笔记：书签 / 重点页 / 注释 */
    marks(noteId: number): Promise<NoteMark[]>
    saveMark(input: NoteMarkInput): Promise<NoteMark>
    removeMark(id: number): Promise<void>
    /** 用系统默认程序打开原始文件 */
    openSource(id: number): Promise<string>
    /** 在资源管理器里定位原始文件 */
    revealSource(id: number): Promise<void>
    /** 取 pdf.js 的字形映射 / 标准字体字节（渲染进程读不到 asar 内的文件） */
    pdfAsset(kind: 'cmaps' | 'standard_fonts', name: string): Promise<Uint8Array | null>
    /** 列表拖拽排序后落库：按数组顺序重写 sort_order */
    reorder(ids: number[]): Promise<void>
    /** 页面提取：任意几页拼成一份新资料，可同时另存为 PDF 文件 */
    extractPages(input: NoteExtractInput): Promise<NoteExtractResult>
    /** 弹「另存为」对话框拿一个写入路径，取消返回空串 */
    pickSavePath(defaultName: string): Promise<string>
  }
  schedule: {
    range(from: string, to: string): Promise<ScheduleEvent[]>
    create(input: ScheduleInput): Promise<ScheduleEvent>
    update(id: number, patch: Partial<ScheduleInput>): Promise<ScheduleEvent>
    remove(id: number): Promise<void>
    planTask(taskId: number, startAt: string, minutes: number): Promise<ScheduleEvent>
    enqueueReviews(date: string): Promise<number>
    deferReviews(): Promise<number>
    pendingTasks(): Promise<Task[]>
  }
  review: {
    due(date?: string): Promise<ReviewItem[]>
    list(): Promise<ReviewItem[]>
    grade(id: number, rating: ReviewRating): Promise<ReviewItem>
    plan(id: number, date: string): Promise<ScheduleEvent>
  }
  focus: {
    start(taskId: number | null, note?: string): Promise<FocusSession>
    stop(id: number): Promise<FocusSession>
    active(): Promise<FocusSession | null>
    listByTask(taskId: number): Promise<FocusSession[]>
    listRange(from: string, to: string): Promise<FocusSession[]>
    /** 记录一段已完成的专注（番茄钟） */
    log(taskId: number | null, minutes: number, note?: string): Promise<FocusSession>
    /** 阅读计时：把一段阅读时间记到笔记关联的任务 / 项目 / 课程上 */
    logReading(input: ReadingLogInput): Promise<FocusSession | null>
    /** 某条笔记已累计的阅读分钟数 */
    readingMinutes(noteId: number): Promise<number>
  }
  /** 无边框窗口的自绘标题栏：窗口控制与全屏 */
  win: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    /** 走与原生关闭按钮相同的拦截逻辑（进入后台 / 询问 / 退出） */
    close(): Promise<void>
    /** 切换全屏；不传参数表示取反 */
    setFullscreen(on?: boolean): Promise<WindowStatePayload>
    getState(): Promise<WindowStatePayload>
  }
  tool: {
    list(): Promise<ToolManifest[]>
    toggle(id: string, enabled: boolean): Promise<void>
    run(id: string, payload: Record<string, unknown>): Promise<ToolRunResult>
    history(limit?: number): Promise<ToolRunRecord[]>
    remove(id: string): Promise<void>
    restoreBuiltins(): Promise<ToolManifest[]>
  }
  stats: {
    daily(date: string): Promise<DailyStats>
    trend(from: string, to: string): Promise<TrendPoint[]>
    byProject(from: string, to: string): Promise<ProjectTime[]>
    procrastination(): Promise<ProcrastinationItem[]>
    /** 拖延量化报告：日 / 周 / 月对比、走势序列与记忆提醒 */
    procrastinationReport(anchor: string, days?: number): Promise<ProcrastinationReport>
    report(date: string): Promise<DailyReport>
    reportMarkdown(date: string): Promise<string>
  }
  search: {
    query(keyword: string, limit?: number): Promise<SearchHit[]>
  }
  onReminder(callback: (payload: ReminderPayload) => void): () => void
  onDataChanged(callback: (scope: string) => void): () => void
  /** 用户点击窗口关闭按钮（主进程已按设置拦截，需要渲染层弹窗询问） */
  onCloseRequest(callback: (payload: CloseRequestPayload) => void): () => void
  /** 文档导入进度（进度条） */
  onNoteImportProgress(callback: (payload: NoteImportProgress) => void): () => void
  /** 窗口状态变化（最大化 / 全屏），自绘标题栏据此更新图标与高度 */
  onWindowState(callback: (payload: WindowStatePayload) => void): () => void
}
