import type {
  AppSettings,
  DailyReport,
  DailyStats,
  DependencyStatus,
  FocusSession,
  Note,
  NoteInput,
  OverviewData,
  ProcrastinationItem,
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
  reviewAutoScheduled: 'event:review-auto-scheduled'
} as const

export interface ReminderPayload {
  eventId: number
  title: string
  body: string
  type: string
  startAt: string
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
    remove(id: number): Promise<void>
    toggle(id: number): Promise<Task>
    /** 拖拽到指定日期 */
    move(id: number, dayKey: string): Promise<Task>
    /** 重排同一日期内的任务顺序 */
    reorder(orderedIds: number[]): Promise<void>
    /** 截止时间已到的待办（用于弹窗警示） */
    due(referenceIso?: string): Promise<Task[]>
  }
  note: {
    list(taskId?: number | null): Promise<Note[]>
    get(id: number): Promise<Note>
    save(input: NoteInput): Promise<Note>
    remove(id: number): Promise<void>
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
    report(date: string): Promise<DailyReport>
    reportMarkdown(date: string): Promise<string>
  }
  search: {
    query(keyword: string, limit?: number): Promise<SearchHit[]>
  }
  onReminder(callback: (payload: ReminderPayload) => void): () => void
  onDataChanged(callback: (scope: string) => void): () => void
}
