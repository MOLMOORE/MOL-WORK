# 笔记列表 · 排序 / 拖拽 / 文案 / 回收站

> 功能线速查：NotesPage.tsx（NOTE_SORTS/DEFAULT_DIRS/sortNotes/chooseSort/toggleSortDir/applyReorder/stageImport/confirmImport/openDetail + selectMode/toggleSelect/confirmBatchDelete/applyMove）+ components/note/NoteRecycleBinModal.tsx + note.repo.ts(reorderNotes/trashNote/restoreNote/listDeletedNotes) + noteStore.ts + DB v7 notes.sort_order / v9 notes.deleted_at
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-09 · v1.2.6 第 2 轮（逐行删除键 + 多选改归属）
- 需求：每一行资料都要有快速删除小键；「快速删除」键改成「多选」，要能批量移动资料、改归属，也能批量删。
- 根因：逐行删只能进详情或开批量模式（两次点击）；`selectMode` 当初只服务删除，按钮、配色、文案全用 danger 红，装不下「移动 / 改归属」这类中性操作。
- 改法：卡片操作区在编辑键前加一颗 `Trash2` 小键，直接 `setConfirmId(note.id)` 复用既有二次确认 + 回收站链路（多选模式下隐藏）；
  多选键与选中态、勾选框统一改走 primary 主色，红色只留给删除；操作条加三个下拉（移到任务 / 移到项目 / 换类型），
  各带一项「无所属…」清空归属，原生 select 只能传字符串，用 `'none'` 哨兵换算 null，`value=""` 常量让选完自动复位。
  数据侧新增 IPC `note:move-many`（三处同步）→ `note.service#moveNotes` → `note.repo#moveNotes`：
  只改 patch 里出现过的键（`'taskId' in patch`，才能传清空用的 null），带 `AND deleted_at IS NULL`，改完逐条 `syncSearch`（搜索 meta 里有任务 / 项目名）。
- 位置：`NotesPage.tsx`（逐行删除键、多选条、`applyMove`）、`noteStore.ts`（`moveNotes`）、`note.repo.ts` / `note.service.ts` / `note.ipc.ts`、`shared/types/{ipc,domain}.ts`（`NoteMovePatch`）、`preload/index.ts`。
- 验证：tsc 两端 0 错、build 通过；`work/patch/v126r2-dbprobe.mjs` 在 001→009 的临时库上跑三种 patch，
  确认回收站里的行不被改动、`{projectId: null}` 真能清空、空 patch 改动 0 条；顺带发现 `notes.task_id` 外键是开着的，编造 id 会被 SQLite 拒。
- 遗留：`note:move-many` 不校验任务 / 项目存在性（靠外键兜底）；换类型不动复习计划；撤销 toast 仍没有。

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