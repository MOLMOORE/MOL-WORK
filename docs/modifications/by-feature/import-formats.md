# 导入 · 格式解析与阅读模式判定

> 功能线速查：src/main/services/import/index.ts（parseDocument / prepareDocument / TEXT_EXTS / PAGINATED_EXTS / RICH_EXTS / EDITABLE_DOC_EXTS）+ note.service.ts(readNoteDoc)
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 关键事实（改阅读方式前必读）
- `readNoteDoc()` 只看 `docKind`：有 PDF 渲染件就返回 `viewMode: 'pages'`，**库里 notes.view_mode 写什么都不算**。
  所以「doc 当文字版本存」要么改主进程判定（影响已入库的老资料），要么在渲染层按 `sourceFormat` 派生（当前选择：派生，零迁移风险）。
- 转 PDF 走 `import/to-pdf.ts`（LibreOffice / Microsoft Office）；没有转换器时 PAGINATED 回退 `viewMode: 'text'`。
- DOC 家族（.doc/.docx/.rtf/.wps/.odt）在 `EDITABLE_DOC_EXTS` 里 → `readonly: false`，正文抽取入库在 `info.text`。