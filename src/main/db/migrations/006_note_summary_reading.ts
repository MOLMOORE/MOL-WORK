/**
 * v1.2.4 第五轮：笔记与项目 / 课程直连 + 阅读计时
 * - notes.summary：导入文件时询问用户填写的资料简介（不再在详情里展示自动抽取的文字）
 * - focus_sessions.project_id / note_id：阅读资料的时间可以直接记到项目 / 课程上，
 *   没有关联任务时也能归属，统计页的「项目用时」因此包含阅读时间
 */
export const NOTE_SUMMARY_READING_SQL = `
ALTER TABLE notes ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE focus_sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE focus_sessions ADD COLUMN note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_focus_project ON focus_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_focus_note ON focus_sessions(note_id);
`
