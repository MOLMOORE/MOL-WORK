import type { SearchHit } from '@shared/types/domain'
import { search } from '../db/repositories/search.repo'
import { projectRepoRebuild, noteRepoRebuild, reviewRepoRebuild, scheduleRepoRebuild, taskRepoRebuild } from '../db/rebuild'

/** 全局搜索：聚合任务、笔记、复习计划、日程与可用工具 */
export function globalSearch(keyword: string, limit = 20): SearchHit[] {
  return search(keyword, limit)
}

/** 供维护操作使用：重建全部全文索引 */
export function rebuildAllIndexes(): void {
  taskRepoRebuild()
  noteRepoRebuild()
  reviewRepoRebuild()
  scheduleRepoRebuild()
  projectRepoRebuild()
}
