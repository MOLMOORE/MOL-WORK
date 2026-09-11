import type { Project, ProjectInput } from '@shared/types/domain'
import { count, insert, all, run } from '../query'
import { mapProject, type ProjectRow } from '../mappers'
import { nowIso } from '../../utils/time'
import { indexEntity, removeEntity } from './search.repo'

const PROJECT_SELECT = `
SELECT p.*,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done' AND t.deleted_at IS NULL) AS done_count,
  COALESCE((SELECT SUM(f.duration_minutes) FROM focus_sessions f
            JOIN tasks t2 ON t2.id = f.task_id WHERE t2.project_id = p.id AND t2.deleted_at IS NULL), 0) AS focus_minutes
FROM projects p
`

export function listProjects(): Project[] {
  return all<ProjectRow>(`${PROJECT_SELECT} ORDER BY p.archived ASC, p.id ASC`).map(mapProject)
}

export function getProject(id: number): Project | undefined {
  const row = all<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = ?`, id)[0]
  return row ? mapProject(row) : undefined
}

export function createProject(input: ProjectInput): Project {
  const createdAt = nowIso()
  const id = insert(
    `INSERT INTO projects (name, color, kind, description, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.name.trim(),
    input.color ?? '#6366F1',
    input.kind ?? 'course',
    input.description ?? '',
    input.archived ? 1 : 0,
    createdAt
  )
  syncSearch(id)
  return getProject(id) as Project
}

export function updateProject(id: number, patch: Partial<ProjectInput>): Project {
  const fields: string[] = []
  const params: (string | number)[] = []
  if (patch.name !== undefined) {
    fields.push('name = ?')
    params.push(patch.name.trim())
  }
  if (patch.color !== undefined) {
    fields.push('color = ?')
    params.push(patch.color)
  }
  if (patch.kind !== undefined) {
    fields.push('kind = ?')
    params.push(patch.kind)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    params.push(patch.description)
  }
  if (patch.archived !== undefined) {
    fields.push('archived = ?')
    params.push(patch.archived ? 1 : 0)
  }
  if (fields.length > 0) {
    run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, ...params, id)
    syncSearch(id)
  }
  return getProject(id) as Project
}

export function removeProject(id: number): void {
  run('DELETE FROM projects WHERE id = ?', id)
  removeEntity('project', id)
}

export function projectTaskCount(id: number): number {
  return count('SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?', id)
}

export function syncSearch(id: number): void {
  const project = getProject(id)
  if (!project) return
  indexEntity({
    kind: 'project',
    refId: id,
    title: project.name,
    body: `${project.description} ${project.kind === 'course' ? '课程' : '项目'}`,
    meta: `${project.taskCount ?? 0} 个任务`
  })
}

export function rebuildSearchIndex(): void {
  for (const project of listProjects()) syncSearch(project.id)
}
