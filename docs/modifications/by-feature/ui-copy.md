# 界面提示文案线（tooltip / 占位 / 空态 / 段落说明）

> 功能线速查：`src/shared/constants.ts`（皮肤与风格 hint、TOOL_CATEGORY_META、DEPENDENCY_META）+ 各页面 `SectionHeader description` / `EmptyState description` / `title=` / `placeholder=`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-10 · v1.2.7 第 1 轮（第二轮全应用精简）
- 需求：提示只为描述某处功能的作用，不加入无用说明与思考过程。
- 做法：按互不重叠的三个写入集并行扫（`components/**` / `pages/**`+`main/tools/**` / `shared`+`SettingsPage`），逐条走上一轮定下的「删 / 压 / 留」。本轮新识别出的四类必删：
  - **设计动机句**：「皮肤会重排界面结构，不只换颜色」「两者都与深浅色互不影响」「避免旧风格的规则串台」「风格、摆放、形状档位彼此独立」；
  - **复述标题 / 按钮的 description**：ToolsPage 3 处、NotesPage 2 处、统计面板 3 处、两个回收站弹窗、GridBoard 的 title；
  - **营销与拟人尾句**：「保持节奏即可」「继续保持」「最贴合本站气质」「开始规划」「留下记忆」「便于复盘 / 便于后续识别」；
  - **工具 description 里的引擎名与实现背景**：FFmpeg / Pandoc / yt-dlp / Playwright / 开源 MNA 引擎。
- 结果：`hint-scan.mjs` 口径下 ≥18 字的提示 65 → 45 条，剩下的全是格式清单、URL / 路径示例、快捷键与不可逆后果警告。
- 位置：`components/**` 16 文件、`pages/**` 7 文件、`main/tools/runners/**` 7 文件、`shared/constants.ts`、`SettingsPage.tsx`。
- 验证：`node work/patch/hint-scan.mjs` 复扫计数；`work/patch/v127-verify.mjs` 把 diff 里的中文剥离后逐文件比对，确认无一处非文案改动；tsc + build 通过。
- 遗留：`ReaderPage` 缩略图书签角标的 tooltip 写「书签与重点」但点击只切书签（角标本身按 书签 ∪ 重点 显示），属文案与行为不一致，要改建议拆 `bookmarkPages` 单独给角标用；本轮按「只改文案」未动。

## 2026-10-10 · v1.2.6 第 3 轮（全应用提示重写）
- 需求：面向用户的提示全部重写精简；不得写入 agent 的思考过程，也不得整段照抄用户的修改要求；每处先判断是否真的需要提示，不需要就不写，一切以精简为第一要义。
- 做法：`work/patch/hint-scan.mjs` 扫 `description / hint / subtitle / placeholder / label` 中 ≥18 字的字符串出清单（100 条，按长度排序），逐条判断「删 / 压 / 留」：
  - **删**：悬停已能看到的重复说明、卡片标题已表达的内容、与顶栏副标题同义的句子、纯铺陈的「闭环 / 防误触 / 留下记忆」式措辞；
  - **压**：确实需要但写长了的（任务页拖拽 85 字 → 28 字；设置页调试模式 76 字 → 26 字；皮肤 hint 47 字 → 20 字内）；
  - **留**：格式清单（源可为 png / jpg / …）、输入示例（URL、路径、`10k`、`4m7`）、快捷键与不可见的隐藏行为（双击标题栏最大化）。
- 结果：≥18 字的提示条目 100 → 65，剩下的基本是清单与示例。
- 规矩（今后每轮照做）：
  1. 提示只回答「这里能做什么 / 输入什么格式 / 会有什么后果」，不解释软件的设计思路，不复述需求原文；
  2. 一句话能说清就不写两句，能用一个占位符示范的不再加正文；
  3. 简单控件（确定 / 取消 / 关闭 / 搜索）不配提示；
  4. 新写提示前先问：用户不看这句话会不会做错事？不会就不写。
- 验证：`npm run build`；改动清单见 `by-version/v1.2.6-r3.md`。