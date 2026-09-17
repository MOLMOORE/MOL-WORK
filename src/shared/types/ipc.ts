import type {
  AppSettings,
  DailyReport,
  DailyStats,
  DependencyStatus,
  FocusSession,
  Note,
  NoteImportOptions,
  NoteImportSummary,
  NoteInput,
  OverviewData,
  ProcrastinationItem,
  ProcrastinationReport,
  Project,
  ProjectInput,
  ProjectTime,
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
  closeRequest: 'event:close-request'
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
    remove(id: number): Promise<void>
    /** 弹出系统文件选择框（可多选）并导入 */
    importPick(options?: NoteImportOptions): Promise<NoteImportSummary>
    /** 导入指定路径的文件（拖拽进窗口时用） */
    importFiles(paths: string[], options?: NoteImportOptions): Promise<NoteImportSummary>
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
}
