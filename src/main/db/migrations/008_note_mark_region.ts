/**
 * v1.2.5：阅读注释支持「圈画局部 + 边上批注」。
 * note_marks.region 存圈注区域的 JSON（归一化到页面自身坐标，0~1），
 * 空串表示这是一条整页注释 —— 老数据不用回填，默认即整页。
 */
export const NOTE_MARK_REGION_SQL = `
ALTER TABLE note_marks ADD COLUMN region TEXT NOT NULL DEFAULT '';
`
