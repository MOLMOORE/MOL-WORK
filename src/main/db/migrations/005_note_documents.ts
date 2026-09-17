/**
 * v1.2.4 笔记书库：导入的文档不再一律转成 Markdown，
 * 而是按格式区分「可编辑文本 / 只读书页 / 只读富文本」三种阅读模式，
 * 并新增书签、重点页与页内注释三类读书笔记。
 */
export const NOTE_DOCUMENTS_SQL = `
ALTER TABLE notes ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'text';
ALTER TABLE notes ADD COLUMN doc_kind TEXT;
ALTER TABLE notes ADD COLUMN doc_path TEXT;
ALTER TABLE notes ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN last_page INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN source_format TEXT;
ALTER TABLE notes ADD COLUMN readonly INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS note_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  page INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_marks_note ON note_marks(note_id, kind, page);
`