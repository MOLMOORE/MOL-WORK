/**
 * v1.2.6：资料 / 笔记 / 卡片进回收站。
 * notes 增加 deleted_at（软删除）：删除先进回收站，保留期内可恢复，
 * 到期由主进程的回收站清理器彻底删除（那时才清复习计划与书库渲染件）。
 */
export const NOTE_RECYCLE_BIN_SQL = `
ALTER TABLE notes ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);
`
