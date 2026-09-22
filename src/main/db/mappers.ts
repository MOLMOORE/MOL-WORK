import { toNumber } from './connection'
import type {
  EventType,
  FocusSession,
  Note,
  NoteKind,
  NoteMark,
  Project,
  ProjectKind,
  ReviewItem,
  ReviewStatus,
  ScheduleEvent,
  Task,
  TaskStatus,
  ToolCategory,
  ToolRunRecord
} from '@shared/types/domain'

export function parseTags(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return []
  return value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export function joinTags(tags?: string[] | null): string {
  if (!tags || tags.length === 0) return ''
  const unique = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))
  return unique.join(',')
}

export function toBool(value: unknown): boolean {
  return toNumber(value) === 1
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export interface ProjectRow {
  id: number | bigint
  name: string
  color: string
  kind: string
  description: string
  archived: number | bigint
  created_at: string
  task_count?: number | bigint
  done_count?: number | bigint
  focus_minutes?: number | bigint
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: toNumber(row.id),
    name: str(row.name),
    color: str(row.color, '#6366F1'),
    kind: (str(row.kind, 'course') as ProjectKind) ?? 'course',
    description: str(row.description),
    archived: toBool(row.archived),
    createdAt: str(row.created_at),
    taskCount: row.task_count === undefined ? undefined : toNumber(row.task_count),
    doneCount: row.done_count === undefined ? undefined : toNumber(row.done_count),
    focusMinutes: row.focus_minutes === undefined ? undefined : toNumber(row.focus_minutes)
  }
}

export interface TaskRow {
  id: number | bigint
  project_id: number | bigint | null
  project_name?: string | null
  project_color?: string | null
  title: string
  detail: string
  status: string
  is_priority: number | bigint
  is_overdue?: number | bigint
  sort_order: number | bigint
  progress: number | bigint
  due_at: string | null
  estimate_minutes: number | bigint
  tags: string
  created_at: string
  updated_at: string
  completed_at: string | null
  deleted_at?: string | null
  focus_minutes?: number | bigint
  note_count?: number | bigint
  pending_reviews?: number | bigint
  schedule_count?: number | bigint
}

export function mapTask(row: TaskRow): Task {
  return {
    id: toNumber(row.id),
    projectId: row.project_id === null || row.project_id === undefined ? null : toNumber(row.project_id),
    projectName: nullableStr(row.project_name),
    projectColor: nullableStr(row.project_color),
    title: str(row.title),
    detail: str(row.detail),
    status: str(row.status, 'todo') as TaskStatus,
    isPriority: toBool(row.is_priority),
    isOverdue: toBool(row.is_overdue),
    sortOrder: toNumber(row.sort_order),
    progress: toNumber(row.progress),
    dueAt: nullableStr(row.due_at),
    estimateMinutes: toNumber(row.estimate_minutes),
    tags: parseTags(row.tags),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    completedAt: nullableStr(row.completed_at),
    deletedAt: nullableStr(row.deleted_at),
    focusMinutes: row.focus_minutes === undefined ? undefined : toNumber(row.focus_minutes),
    noteCount: row.note_count === undefined ? undefined : toNumber(row.note_count),
    pendingReviews: row.pending_reviews === undefined ? undefined : toNumber(row.pending_reviews),
    scheduleCount: row.schedule_count === undefined ? undefined : toNumber(row.schedule_count)
  }
}

export interface NoteRow {
  id: number | bigint
  task_id: number | bigint | null
  project_id: number | bigint | null
  title: string
  kind: string
  content: string
  summary?: string | null
  file_path: string | null
  tags: string
  view_mode?: string | null
  doc_kind?: string | null
  doc_path?: string | null
  page_count?: number | bigint | null
  last_page?: number | bigint | null
  source_format?: string | null
  readonly?: number | bigint | null
  sort_order?: number | bigint | null
  created_at: string
  updated_at: string
  task_title?: string | null
  project_name?: string | null
  reading_minutes?: number | bigint | null
}

export function mapNote(row: NoteRow): Note {
  return {
    id: toNumber(row.id),
    taskId: row.task_id === null || row.task_id === undefined ? null : toNumber(row.task_id),
    projectId: row.project_id === null || row.project_id === undefined ? null : toNumber(row.project_id),
    title: str(row.title),
    kind: str(row.kind, 'note') as NoteKind,
    content: str(row.content),
    summary: str(row.summary ?? ''),
    filePath: nullableStr(row.file_path),
    tags: parseTags(row.tags),
    viewMode: (str(row.view_mode, 'text') as Note['viewMode']) === 'pages' || str(row.view_mode, 'text') === 'rich'
      ? (str(row.view_mode, 'text') as Note['viewMode'])
      : 'text',
    docKind: (nullableStr(row.doc_kind) ?? null) as Note['docKind'],
    docPath: nullableStr(row.doc_path),
    pageCount: toNumber(row.page_count ?? 0),
    lastPage: toNumber(row.last_page ?? 1, 1),
    sourceFormat: nullableStr(row.source_format),
    readonly: toNumber(row.readonly ?? 0) > 0,
    sortOrder: toNumber(row.sort_order ?? 0),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    taskTitle: nullableStr(row.task_title),
    projectName: nullableStr(row.project_name),
    readingMinutes: toNumber(row.reading_minutes ?? 0)
  }
}

export interface NoteMarkRow {
  id: number | bigint
  note_id: number | bigint
  kind: string
  page: number | bigint
  label: string
  quote: string
  body: string
  color: string
  region?: string
  created_at: string
}

export function mapNoteMark(row: NoteMarkRow): NoteMark {
  return {
    id: toNumber(row.id),
    noteId: toNumber(row.note_id),
    kind: row.kind as NoteMark['kind'],
    page: toNumber(row.page),
    label: str(row.label),
    quote: str(row.quote),
    body: str(row.body),
    color: str(row.color),
    region: str(row.region ?? ''),
    createdAt: str(row.created_at)
  }
}

export interface ReviewRow {
  id: number | bigint
  note_id: number | bigint
  task_id: number | bigint | null
  title: string
  ease: number
  interval_days: number | bigint
  repetitions: number | bigint
  lapses: number | bigint
  due_at: string
  last_reviewed_at: string | null
  stage: number | bigint
  last_rating: number | bigint | null
  status: string
  created_at: string
  note_title?: string | null
  project_name?: string | null
}

export function mapReview(row: ReviewRow): ReviewItem {
  return {
    id: toNumber(row.id),
    noteId: toNumber(row.note_id),
    taskId: row.task_id === null || row.task_id === undefined ? null : toNumber(row.task_id),
    title: str(row.title),
    ease: Number(row.ease ?? 2.5),
    intervalDays: toNumber(row.interval_days),
    repetitions: toNumber(row.repetitions),
    lapses: toNumber(row.lapses),
    dueAt: str(row.due_at),
    lastReviewedAt: nullableStr(row.last_reviewed_at),
    stage: toNumber(row.stage),
    lastRating: row.last_rating === null || row.last_rating === undefined ? null : toNumber(row.last_rating),
    status: str(row.status, 'active') as ReviewStatus,
    createdAt: str(row.created_at),
    noteTitle: nullableStr(row.note_title),
    projectName: nullableStr(row.project_name)
  }
}

export interface EventRow {
  id: number | bigint
  task_id: number | bigint | null
  review_item_id: number | bigint | null
  title: string
  type: string
  start_at: string
  end_at: string
  all_day: number | bigint
  reminder_at: string | null
  reminded: number | bigint
  note: string
  created_at: string
  task_status?: string | null
  project_name?: string | null
}

export function mapEvent(row: EventRow): ScheduleEvent {
  return {
    id: toNumber(row.id),
    taskId: row.task_id === null || row.task_id === undefined ? null : toNumber(row.task_id),
    reviewItemId:
      row.review_item_id === null || row.review_item_id === undefined ? null : toNumber(row.review_item_id),
    title: str(row.title),
    type: str(row.type, 'task') as EventType,
    startAt: str(row.start_at),
    endAt: str(row.end_at),
    allDay: toBool(row.all_day),
    reminderAt: nullableStr(row.reminder_at),
    reminded: toBool(row.reminded),
    note: str(row.note),
    createdAt: str(row.created_at),
    taskStatus: (nullableStr(row.task_status) as TaskStatus | null) ?? null,
    projectName: nullableStr(row.project_name)
  }
}

export interface FocusRow {
  id: number | bigint
  task_id: number | bigint | null
  project_id?: number | bigint | null
  note_id?: number | bigint | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | bigint
  note: string
  created_at: string
  task_title?: string | null
  project_name?: string | null
  note_title?: string | null
}

export function mapFocus(row: FocusRow): FocusSession {
  return {
    id: toNumber(row.id),
    taskId: row.task_id === null || row.task_id === undefined ? null : toNumber(row.task_id),
    projectId: row.project_id === null || row.project_id === undefined ? null : toNumber(row.project_id),
    noteId: row.note_id === null || row.note_id === undefined ? null : toNumber(row.note_id),
    startedAt: str(row.started_at),
    endedAt: nullableStr(row.ended_at),
    durationMinutes: toNumber(row.duration_minutes),
    note: str(row.note),
    createdAt: str(row.created_at),
    taskTitle: nullableStr(row.task_title),
    projectName: nullableStr(row.project_name),
    noteTitle: nullableStr(row.note_title)
  }
}

export interface ToolRunRow {
  id: number | bigint
  tool_id: string
  tool_name: string
  category: string
  input_summary: string
  status: string
  duration_ms: number | bigint
  result_path: string | null
  result_summary: string | null
  error: string | null
  created_at: string
}

export function mapToolRun(row: ToolRunRow): ToolRunRecord {
  return {
    id: toNumber(row.id),
    toolId: str(row.tool_id),
    toolName: str(row.tool_name),
    category: str(row.category, 'calc') as ToolCategory,
    inputSummary: str(row.input_summary),
    status: str(row.status, 'success') === 'failed' ? 'failed' : 'success',
    durationMs: toNumber(row.duration_ms),
    resultPath: nullableStr(row.result_path),
    resultSummary: nullableStr(row.result_summary),
    error: nullableStr(row.error),
    createdAt: str(row.created_at)
  }
}
