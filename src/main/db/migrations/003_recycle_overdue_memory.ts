/**
 * v3：回收站 + 逾期事项 + 记忆日志
 * - tasks 增加 deleted_at（软删除，进入回收站）与 is_overdue（截止已到且未延期，排序仅低于优先事项）
 * - 新增 memory_logs：记录事项截止与延期事件，归类为「记忆」进入统计时间线
 */
export const TASK_RECYCLE_OVERDUE_MEMORY_SQL = `
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
ALTER TABLE tasks ADD COLUMN is_overdue INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted_at);

CREATE TABLE IF NOT EXISTS memory_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  task_title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'defer',
  minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_logs(created_at);
`
