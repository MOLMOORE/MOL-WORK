# 文档 · 功能索引与修改记录本身

> 功能线速查：`AGENTS.md` 第 0 / 6 节、`docs/feature-index.md`、`docs/modifications/`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-09-23 · v1.2.5 第 4 轮（建立）
- 需求：① 自查之前几轮有没有按 AGENTS.md 执行（尤其「先查参考并核验再动手」），没有就记进记忆；② 建一份功能→文件索引；③ 建一个存修改记录的文件夹（按版本 + 按功能两套），并把这套做法写进 AGENTS.md。
- 自查：第 5 节只在部分改动上做到位（翻页动效 / fixed 包含块 / Tailwind preflight 查过规范；批注锚定、对比层级、文字视图是凭推断改的，同一块返工三次）。第 4 节检查分级一直合规。
- 落地：
  - `AGENTS.md` 新增第 0 节「开工先读」（读什么、按什么顺序、禁止全目录遍历）与第 6 节「功能索引与修改记录」；
  - 全局 `~/.codex/AGENTS.md` 新增「Project rule docs first」，让这条规矩跨项目、跨对话、换模型都生效；
  - `docs/feature-index.md`：按模块列出功能 → 文件 → 符号；
  - `docs/modifications/README.md`：目录分工 + 查找规矩 + 统一小标题；`by-version/` 存 v1.2.5 r1-r4；`by-feature/` 按功能线。
- 注意：`AGENTS.md` 在 .gitignore 里（本地记忆，不随仓库走），`docs/` 下的索引与记录是提交进仓库的。
