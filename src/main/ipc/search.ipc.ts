import type { SearchHit } from '@shared/types/domain'
import { handle } from './handle'
import { globalSearch } from '../services/search.service'

export function registerSearchIpc(): void {
  handle<SearchHit[]>('search:query', (keyword: string, limit?: number) => globalSearch(keyword, limit ?? 20))
}
