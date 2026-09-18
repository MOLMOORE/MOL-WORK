import type { Note, NoteInput, NoteMark, NoteMarkInput } from '@shared/types/domain'
import { all, insert, run } from '../query'
import type { SqlParam } from '../query'
import { joinTags, mapNote, mapNoteMark, type NoteMarkRow, type NoteRow } from '../mappers'
import { nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'
import { getTask } from './task.repo'

const NOTE_SELECT = `
SELECT n.*, t.title AS task_title, p.name AS project_name,
       (SELECT COALESCE(SUM(f.duration_minutes), 0) FROM focus_sessions f WHERE f.note_id = n.id) AS reading_minutes
FROM notes n
LEFT JOIN tasks t ON t.id = n.task_id
LEFT JOIN projects p ON p.id = n.project_id
`

export function listNotes(taskId?: number | null, keyword?: string): Note[] {
  const conditions: string[] = []
  const params: SqlParam[] = []
  if (taskId !== undefined && taskId !== null) {
    conditions.push('n.task_id = ?')
    params.push(taskId)
  }
  if (keyword && keyword.trim() !== '') {
    const like = `%${keyword.trim()}%`
    conditions.push('(n.title LIKE ? OR n.summary LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)')
    params.push(like, like, like, like)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return all<NoteRow>(`${NOTE_SELECT} ${where} ORDER BY n.updated_at DESC`, ...params).map(mapNote)
}

export function getNote(id: number): Note | undefined {
  const row = all<NoteRow>(`${NOTE_SELECT} WHERE n.id = ?`, id)[0]
  return row ? mapNote(row) : undefined
}

export function createNote(input: NoteInput): Note {
  const timestamp = nowIso()
  const taskId = input.taskId ?? null
  const task = taskId !== null ? getTask(taskId) : undefined
  const id = insert(
    `INSERT INTO notes (task_id, project_id, title, kind, content, summary, file_path, tags,
       view_mode, doc_kind, doc_path, page_count, last_page, source_format, readonly,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    input.projectId ?? task?.projectId ?? null,
    input.title.trim(),
    input.kind ?? 'note',
    input.content ?? '',
    (input.summary ?? '').trim(),
    input.filePath ?? null,
    joinTags(input.tags),
    input.viewMode ?? 'text',
    input.docKind ?? null,
    input.docPath ?? null,
    input.pageCount ?? 0,
    input.lastPage ?? 1,
    input.sourceFormat ?? null,
    input.readonly ? 1 : 0,
    timestamp,
    timestamp
  )
  syncSearch(id)
  return getNote(id) as Note
}

export function updateNote(id: number, patch: Partial<NoteInput>): Note {
  const fields: string[] = []
  const params: SqlParam[] = []
  if (patch.taskId !== undefined) {
    fields.push('task_id = ?')
    params.push(patch.taskId ?? null)
  }
  if (patch.projectId !== undefined) {
    fields.push('project_id = ?')
    params.push(patch.projectId ?? null)
  }
  if (patch.title !== undefined) {
    fields.push('title = ?')
    params.push(patch.title.trim())
  }
  if (patch.kind !== undefined) {
    fields.push('kind = ?')
    params.push(patch.kind)
  }
  if (patch.content !== undefined) {
    fields.push('content = ?')
    params.push(patch.content)
  }
  if (patch.summary !== undefined) {
    fields.push('summary = ?')
    params.push(patch.summary.trim())
  }
  if (patch.filePath !== undefined) {
    fields.push('file_path = ?')
    params.push(patch.filePath ?? null)
  }
  if (patch.tags !== undefined) {
    fields.push('tags = ?')
    params.push(joinTags(patch.tags))
  }
  if (patch.viewMode !== undefined) {
    fields.push('view_mode = ?')
    params.push(patch.viewMode)
  }
  if (patch.docKind !== undefined) {
    fields.push('doc_kind = ?')
    params.push(patch.docKind)
  }
  if (patch.docPath !== undefined) {
    fields.push('doc_path = ?')
    params.push(patch.docPath)
  }
  if (patch.pageCount !== undefined) {
    fields.push('page_count = ?')
    params.push(patch.pageCount)
  }
  if (patch.lastPage !== undefined) {
    fields.push('last_page = ?')
    params.push(patch.lastPage)
  }
  if (patch.sourceFormat !== undefined) {
    fields.push('source_format = ?')
    params.push(patch.sourceFormat)
  }
  if (patch.readonly !== undefined) {
    fields.push('readonly = ?')
    params.push(patch.readonly ? 1 : 0)
  }
  if (fields.length > 0) {
    fields.push('updated_at = ?')
    params.push(nowIso())
    run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
    syncSearch(id)
  }
  return getNote(id) as Note
}

export function removeNote(id: number): void {
  run('DELETE FROM note_marks WHERE note_id = ?', id)
  run('DELETE FROM notes WHERE id = ?', id)
  removeEntity('note', id)
}

/** 记录阅读进度（页码），顺带在首次打开时回填页数 */
export function setNoteProgress(id: number, page: number, pageCount?: number): Note | undefined {
  const fields = ['last_page = ?']
  const params: SqlParam[] = [Math.max(0, Math.floor(page))]
  if (pageCount !== undefined && pageCount > 0) {
    fields.push('page_count = ?')
    params.push(Math.floor(pageCount))
  }
  run(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
  return getNote(id)
}

/** 读书笔记标记：书签 / 重点页 / 注释 */
export function listMarks(noteId: number): NoteMark[] {
  return all<NoteMarkRow>('SELECT * FROM note_marks WHERE note_id = ? ORDER BY page ASC, id ASC', noteId).map(mapNoteMark)
}

export function createMark(input: NoteMarkInput): NoteMark {
  const id = insert(
    `INSERT INTO note_marks (note_id, kind, page, label, quote, body, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.noteId,
    input.kind,
    input.page ?? 0,
    input.label ?? '',
    input.quote ?? '',
    input.body ?? '',
    input.color ?? '',
    nowIso()
  )
  const row = all<NoteMarkRow>('SELECT * FROM note_marks WHERE id = ?', id)[0]
  return mapNoteMark(row)
}

export function updateMark(id: number, patch: Partial<NoteMarkInput>): NoteMark | undefined {
  const fields: string[] = []
  const params: SqlParam[] = []
  for (const key of ['kind', 'page', 'label', 'quote', 'body', 'color'] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`)
      params.push(patch[key] as SqlParam)
    }
  }
  if (fields.length > 0) run(`UPDATE note_marks SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
  const row = all<NoteMarkRow>('SELECT * FROM note_marks WHERE id = ?', id)[0]
  return row ? mapNoteMark(row) : undefined
}

export function deleteMark(id: number): void {
  run('DELETE FROM note_marks WHERE id = ?', id)
}

export function noteCountForTask(taskId: number): number {
  const row = all<{ c: number }>('SELECT COUNT(*) AS c FROM notes WHERE task_id = ?', taskId)[0]
  return row ? Number(row.c) : 0
}

export function syncSearch(id: number): void {
  const note = getNote(id)
  if (!note) return
  indexEntity({
    kind: 'note',
    refId: id,
    title: note.title,
    body: `${note.content} ${note.tags.join(' ')}`,
    meta: `${note.kind === 'note' ? '笔记' : note.kind === 'material' ? '资料' : '卡片'} · ${note.taskTitle ?? note.projectName ?? '未关联任务'}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM notes')
  for (const row of rows) syncSearch(Number(row.id))
}
