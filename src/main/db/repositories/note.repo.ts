import type { Note, NoteInput } from '@shared/types/domain'
import { all, insert, run } from '../query'
import type { SqlParam } from '../query'
import { joinTags, mapNote, type NoteRow } from '../mappers'
import { nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'
import { getTask } from './task.repo'

const NOTE_SELECT = `
SELECT n.*, t.title AS task_title
FROM notes n
LEFT JOIN tasks t ON t.id = n.task_id
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
    conditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)')
    params.push(like, like, like)
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
    `INSERT INTO notes (task_id, project_id, title, kind, content, file_path, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    input.projectId ?? task?.projectId ?? null,
    input.title.trim(),
    input.kind ?? 'note',
    input.content ?? '',
    input.filePath ?? null,
    joinTags(input.tags),
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
  if (patch.filePath !== undefined) {
    fields.push('file_path = ?')
    params.push(patch.filePath ?? null)
  }
  if (patch.tags !== undefined) {
    fields.push('tags = ?')
    params.push(joinTags(patch.tags))
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
  run('DELETE FROM notes WHERE id = ?', id)
  removeEntity('note', id)
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
    meta: `${note.kind === 'note' ? '笔记' : note.kind === 'material' ? '资料' : '卡片'} · ${note.taskTitle ?? '未关联任务'}`
  })
}

export function rebuildSearchIndex(): void {
  const rows = all<{ id: number }>('SELECT id FROM notes')
  for (const row of rows) syncSearch(Number(row.id))
}
