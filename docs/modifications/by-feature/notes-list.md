# 笔记列表 · 排序 / 拖拽 / 文案 / 回收站

> 功能线速查：NotesPage.tsx（NOTE_SORTS/DEFAULT_DIRS/sortNotes/chooseSort/toggleSortDir/applyReorder/stageImport/confirmImport/openDetail + selectMode/toggleSelect/confirmBatchDelete）+ components/note/NoteRecycleBinModal.tsx + note.repo.ts(reorderNotes/trashNote/restoreNote/listDeletedNotes) + noteStore.ts + DB v7 notes.sort_order / v9 notes.deleted_at
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-09 · v1.2.6 第 1 轮（快速删除 + 回收站）
- 需求：资料 / 笔记 / 卡片各模块要快速删除模式，删除要二次确认，并配回收站。
- 根因：`deleteNote()` 一步删库 + 删复习计划 + 删 `<userData>/library/<id>/` 渲染件，删完没有任何可恢复的东西。
- 改法：
  - 软删除走 `notes.deleted_at`（v9，与 `tasks.deleted_at` 同一手法）；彻底删除才 `removeNote()` + `removeNoteLibrary()`。
  - 复习计划**挂起而不是删除**（`ReviewStatus` 本来就有 `suspended`），恢复后阶段 / 间隔 / ease 全在，不用重算。
  - 列表口径三处一起收：`listNotes`、`noteCountForTask`、`tasks.note_count` 都加 `deleted_at IS NULL`；
    `syncSearch` 见软删就 `removeEntity`，所以 `rebuildSearchIndex` 也不会把回收站的东西搜回来。
  - 过期清理放服务层（`purgeExpiredNotes` 逐条 `purgeNote`），仓库只出 id —— 否则书库目录会漏删。
  - UI：`selectMode` 下卡片禁用拖拽、点卡片即勾选、编辑与阅读按键隐藏、全选只管当前标签可见项（跨标签累积保留）；
    批量与单条删除都走 `ConfirmDialog`，文案改「移入回收站」；「回收站」按钮带条数，弹窗与任务回收站同一套视觉、共用 `settings.recycleBinDays`。
- 位置：`note.repo.ts`、`note.service.ts`、`review.service.ts`、`ipc/note.ipc.ts`、`shared/types/ipc.ts`、`preload/index.ts`、`main/index.ts#startRecycleBinCleaner`、`noteStore.ts`、`NotesPage.tsx`、`components/note/NoteRecycleBinModal.tsx`。
- 参考：本仓库任务回收站（v3 迁移 + `components/task/RecycleBinModal.tsx`）—— 同一套保留时长 / 恢复 / 彻底删除语义。
- 验证：`work/patch/v126-dbprobe.mjs` 在临时 sqlite 上套 001→009 全通过，并跑通「软删 2 条 → 列表只剩 1 → 回收站 2 → 恢复 → 计数 2」；tsc 两端 0 错；build 通过。
- 遗留：与任务回收站仍是两个弹窗；批量删除没有「撤销」toast；任务 purge 时 `DELETE FROM notes WHERE task_id = ?` 仍会漏清书库目录（既有问题）。

## 2026-09-23 · v1.2.5 第 4 轮（标签一致性）
- Word 家族现在默认按文字读，列表里不能再标「书页 / 按原文件原版式显示」：新增 `isTextualDoc()` 与 `viewModeLabel()`（判据用共享常量 `TEXTUAL_DOC_FORMATS`），卡片角标、摘要与详情弹窗三处统一改走这两个函数。

## 2026-09-22 · v1.2.5 第 1、2 轮
- 需求：卡片自由拖拽排序 + 上方排序按键（修改日期 / 加入日期 / 首字符 / 格式 / 手动）+ 正序倒序。
- 改法：`sortNotes()` 按 key 比较（首字符用 `localeCompare(zh-Hans-CN)` 走拼音）；方向按每种排序各自记（localStorage `workstation.notes.sortdir.v1`）；拖动 `applyReorder()` → IPC `note:reorder` 落 `sort_order` 并自动切回手动排序。
- 文案：详情只留「资料简介」+ 占位「简介填在此处」；拖入遮罩「将文件拖入此处」；导入窗标题「保存资料」。
- 遗留：拖拽排序时被筛选隐藏的条目仍保留旧 sort_order（下次切回手动排序顺序可能不连续，不影响正确性）。