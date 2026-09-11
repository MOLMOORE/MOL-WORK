/**
 * v2：任务模型调整
 * - 移除多级优先级，改为「优先事项」布尔标记（日程中标红）
 * - 新增同日内排序权重 sort_order，支持拖拽排序
 * 旧的 priority=1（高）迁移为优先事项。
 */
export const TASK_PRIORITY_ORDER_SQL = `
ALTER TABLE tasks ADD COLUMN is_priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET is_priority = 1 WHERE priority = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order);
`
