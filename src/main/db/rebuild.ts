import { rebuildSearchIndex as rebuildProjects } from './repositories/project.repo'
import { rebuildSearchIndex as rebuildTasks } from './repositories/task.repo'
import { rebuildSearchIndex as rebuildNotes } from './repositories/note.repo'
import { rebuildSearchIndex as rebuildReviews } from './repositories/review.repo'
import { rebuildSearchIndex as rebuildEvents } from './repositories/schedule.repo'
import { clearIndex } from './repositories/search.repo'

/** 统一的全量索引重建入口，避免各处直接引用具体 repo */
export function taskRepoRebuild(): void {
  rebuildTasks()
}

export function noteRepoRebuild(): void {
  rebuildNotes()
}

export function reviewRepoRebuild(): void {
  rebuildReviews()
}

export function scheduleRepoRebuild(): void {
  rebuildEvents()
}

export function projectRepoRebuild(): void {
  rebuildProjects()
}

export function resetIndexForRebuild(): void {
  clearIndex()
}
