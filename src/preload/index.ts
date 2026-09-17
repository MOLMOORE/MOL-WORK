import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_EVENTS } from '@shared/types/ipc'
import type { CloseRequestPayload, ReminderPayload, WorkstationApi } from '@shared/types/ipc'
import type {
  AppSettings,
  DailyReport,
  DailyStats,
  DependencyStatus,
  FocusSession,
  Note,
  NoteDocInfo,
  NoteImportOptions,
  NoteImportProgress,
  NoteImportSummary,
  NoteInput,
  NoteMark,
  NoteMarkInput,
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
} from '@shared/types/domain'

interface IpcEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const envelope = (await ipcRenderer.invoke(channel, ...args)) as IpcEnvelope<T>
  if (!envelope || envelope.ok !== true) {
    throw new Error(envelope?.error ?? `调用 ${channel} 失败`)
  }
  return envelope.data as T
}

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WorkstationApi = {
  app: {
    getSettings: () => invoke<AppSettings>('app:get-settings'),
    updateSettings: (patch) => invoke<AppSettings>('app:update-settings', patch),
    getOverview: () => invoke<OverviewData>('app:overview'),
    getDataDir: () => invoke<string>('app:data-dir'),
    openPath: (target) => invoke<boolean>('app:open-path', target),
    showItemInFolder: (target) => invoke<boolean>('app:show-item', target),
    pickPath: (mode) => invoke<string | null>('app:pick-path', mode),
    checkDependencies: (force?: boolean) => invoke<DependencyStatus[]>('app:check-deps', force),
    exportReport: (date) => invoke<{ path: string; content: string }>('app:export-report', date),
    seedDemo: () => invoke<{ created: boolean }>('app:seed-demo'),
    notify: (title: string, body: string) => invoke<void>('app:notify', title, body),
    hideWindow: () => invoke<void>('app:hide-window'),
    quitApp: () => invoke<void>('app:quit-app'),
    diagnostics: () => invoke<Record<string, string>>('app:diagnostics')
  },
  project: {
    list: () => invoke<Project[]>('project:list'),
    save: (input: ProjectInput) => invoke<Project>('project:save', input),
    remove: (id: number) => invoke<void>('project:remove', id)
  },
  task: {
    list: (filter?: TaskFilter) => invoke<Task[]>('task:list', filter),
    get: (id: number) => invoke<TaskDetail>('task:get', id),
    create: (input: TaskInput) => invoke<Task>('task:create', input),
    update: (id: number, patch: Partial<TaskInput>) => invoke<Task>('task:update', id, patch),
    remove: (id: number) => invoke<void>('task:remove', id),
    toggle: (id: number) => invoke<Task>('task:toggle', id),
    move: (id: number, dayKey: string) => invoke<Task>('task:move', id, dayKey),
    reorder: (orderedIds: number[]) => invoke<void>('task:reorder', orderedIds),
    due: (referenceIso?: string) => invoke<Task[]>('task:due', referenceIso),
    restore: (id: number) => invoke<void>('task:restore', id),
    purge: (id: number) => invoke<void>('task:purge', id),
    listDeleted: () => invoke<Task[]>('task:list-deleted'),
    purgeExpired: (retentionDays: number) => invoke<number>('task:purge-expired', retentionDays),
    listOverdue: () => invoke<Task[]>('task:list-overdue'),
    markOverdue: (id: number) => invoke<Task>('task:mark-overdue', id),
    defer: (id: number, seconds: number) => invoke<Task>('task:defer', id, seconds)
  },
  note: {
    list: (taskId?: number | null) => invoke<Note[]>('note:list', taskId ?? null),
    get: (id: number) => invoke<Note>('note:get', id),
    save: (input: NoteInput) => invoke<Note>('note:save', input),
    remove: (id: number) => invoke<void>('note:remove', id),
    importPick: (options?: NoteImportOptions) => invoke<NoteImportSummary>('note:import-pick', options),
    importFiles: (paths: string[], options?: NoteImportOptions) =>
      invoke<NoteImportSummary>('note:import-files', paths, options),
    doc: (id: number) => invoke<NoteDocInfo>('note:doc', id),
    progress: (id: number, page: number, pageCount?: number) =>
      invoke<Note>('note:progress', id, page, pageCount),
    marks: (noteId: number) => invoke<NoteMark[]>('note:marks', noteId),
    saveMark: (input: NoteMarkInput) => invoke<NoteMark>('note:mark-save', input),
    removeMark: (id: number) => invoke<void>('note:mark-remove', id),
    openSource: (id: number) => invoke<string>('note:open-source', id),
    revealSource: (id: number) => invoke<void>('note:reveal-source', id),
    pdfAsset: (kind: 'cmaps' | 'standard_fonts', name: string) =>
      invoke<Uint8Array | null>('note:pdf-asset', kind, name)
  },
  schedule: {
    range: (from: string, to: string) => invoke<ScheduleEvent[]>('schedule:range', from, to),
    create: (input: ScheduleInput) => invoke<ScheduleEvent>('schedule:create', input),
    update: (id: number, patch: Partial<ScheduleInput>) => invoke<ScheduleEvent>('schedule:update', id, patch),
    remove: (id: number) => invoke<void>('schedule:remove', id),
    planTask: (taskId: number, startAt: string, minutes: number) =>
      invoke<ScheduleEvent>('schedule:plan-task', taskId, startAt, minutes),
    enqueueReviews: (date: string) => invoke<number>('schedule:enqueue-reviews', date),
    deferReviews: () => invoke<number>('schedule:defer-reviews'),
    pendingTasks: () => invoke<Task[]>('schedule:pending-tasks')
  },
  review: {
    due: (date?: string) => invoke<ReviewItem[]>('review:due', date),
    list: () => invoke<ReviewItem[]>('review:list'),
    grade: (id: number, rating: ReviewRating) => invoke<ReviewItem>('review:grade', id, rating),
    plan: (id: number, date: string) => invoke<ScheduleEvent>('review:plan', id, date)
  },
  focus: {
    start: (taskId: number | null, note?: string) => invoke<FocusSession>('focus:start', taskId, note),
    stop: (id: number) => invoke<FocusSession>('focus:stop', id),
    active: () => invoke<FocusSession | null>('focus:active'),
    listByTask: (taskId: number) => invoke<FocusSession[]>('focus:list-by-task', taskId),
    listRange: (from: string, to: string) => invoke<FocusSession[]>('focus:list-range', from, to),
    log: (taskId: number | null, minutes: number, note?: string) =>
      invoke<FocusSession>('focus:log', taskId, minutes, note)
  },
  tool: {
    list: () => invoke<ToolManifest[]>('tool:list'),
    toggle: (id: string, enabled: boolean) => invoke<void>('tool:toggle', id, enabled),
    run: (id: string, payload: Record<string, unknown>) => invoke<ToolRunResult>('tool:run', id, payload),
    history: (limit?: number) => invoke<ToolRunRecord[]>('tool:history', limit),
    remove: (id: string) => invoke<void>('tool:remove', id),
    restoreBuiltins: () => invoke<ToolManifest[]>('tool:restore')
  },
  stats: {
    daily: (date: string) => invoke<DailyStats>('stats:daily', date),
    trend: (from: string, to: string) => invoke<TrendPoint[]>('stats:trend', from, to),
    byProject: (from: string, to: string) => invoke<ProjectTime[]>('stats:by-project', from, to),
    procrastination: () => invoke<ProcrastinationItem[]>('stats:procrastination'),
    procrastinationReport: (anchor: string, days?: number) =>
      invoke<ProcrastinationReport>('stats:procrastination-report', anchor, days),
    report: (date: string) => invoke<DailyReport>('stats:report', date),
    reportMarkdown: (date: string) => invoke<string>('stats:report-markdown', date)
  },
  search: {
    query: (keyword: string, limit?: number) => invoke<SearchHit[]>('search:query', keyword, limit)
  },
  onNoteImportProgress: (callback: (payload: NoteImportProgress) => void) =>
    subscribe<NoteImportProgress>(IPC_EVENTS.noteImport, callback),
  onReminder: (callback: (payload: ReminderPayload) => void) => subscribe<ReminderPayload>(IPC_EVENTS.reminder, callback),
  onDataChanged: (callback: (scope: string) => void) => subscribe<string>(IPC_EVENTS.dataChanged, callback),
  onCloseRequest: (callback: (payload: CloseRequestPayload) => void) =>
    subscribe<CloseRequestPayload>(IPC_EVENTS.closeRequest, callback)
}

contextBridge.exposeInMainWorld('api', api)

/** 拖拽导入用：Electron 32 起 File.path 已移除，只能由 preload 通过 webUtils 取绝对路径 */
contextBridge.exposeInMainWorld('nativeFiles', {
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  }
})
contextBridge.exposeInMainWorld('__workstationEvents', {
  reviewAutoScheduled: (callback: (payload: { date: string; count: number }) => void) =>
    subscribe<{ date: string; count: number }>(IPC_EVENTS.reviewAutoScheduled, callback)
})
