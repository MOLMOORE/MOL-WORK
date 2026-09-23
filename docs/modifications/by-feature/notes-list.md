# 笔记列表 · 排序 / 拖拽 / 文案

> 功能线速查：NotesPage.tsx（NOTE_SORTS/DEFAULT_DIRS/sortNotes/chooseSort/toggleSortDir/applyReorder/stageImport/confirmImport/openDetail）+ note.repo.ts(reorderNotes) + DB v7 notes.sort_order
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 4 轮（标签一致性）
- Word 家族现在默认按文字读，列表里不能再标「书页 / 按原文件原版式显示」：新增 `isTextualDoc()` 与 `viewModeLabel()`（判据用共享常量 `TEXTUAL_DOC_FORMATS`），卡片角标、摘要与详情弹窗三处统一改走这两个函数。

## 2026-09-22 · v1.2.5 第 1、2 轮
- 需求：卡片自由拖拽排序 + 上方排序按键（修改日期 / 加入日期 / 首字符 / 格式 / 手动）+ 正序倒序。
- 改法：`sortNotes()` 按 key 比较（首字符用 `localeCompare(zh-Hans-CN)` 走拼音）；方向按每种排序各自记（localStorage `workstation.notes.sortdir.v1`）；拖动 `applyReorder()` → IPC `note:reorder` 落 `sort_order` 并自动切回手动排序。
- 文案：详情只留「资料简介」+ 占位「简介填在此处」；拖入遮罩「将文件拖入此处」；导入窗标题「保存资料」。
- 遗留：拖拽排序时被筛选隐藏的条目仍保留旧 sort_order（下次切回手动排序顺序可能不连续，不影响正确性）。