/**
 * v1.2.5：笔记列表支持自由拖拽排序
 * notes.sort_order 手动排序序号，越小越靠前；默认 0，
 * 老数据不需要回填（列表按 sort_order ASC, updated_at DESC 排，
 * 全 0 时就等于原来的「按修改日期倒序」）。
 */
export const NOTE_SORT_ORDER_SQL = `
ALTER TABLE notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
`
