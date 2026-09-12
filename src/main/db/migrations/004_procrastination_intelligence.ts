/**
 * v4：拖延量化
 * - memory_logs 增加 delay_minutes：本次拖延时长（分钟）
 *   · kind=defer：新截止 - 原截止（计划被推后的时长）
 *   · kind=due：进入逾期时已经超时的时长
 * - memory_logs 增加 due_at：事件发生时所对应的截止时间，便于回溯与对账
 * - 增加 kind 索引，支撑按事件类型聚合统计
 */
export const PROCRASTINATION_INTELLIGENCE_SQL = `
ALTER TABLE memory_logs ADD COLUMN delay_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_logs ADD COLUMN due_at TEXT;
CREATE INDEX IF NOT EXISTS idx_memory_kind ON memory_logs(kind);
`
