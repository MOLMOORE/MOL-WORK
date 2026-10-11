# 工具集 · 计算与转换工具线

> 功能线速查：`src/main/tools/`（registry + runners + engineering.ts + mna.ts）+ `pages/ToolsPage.tsx` + `components/tool/*`（diagrams/ = 计算工具电路配图）
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-11 · v1.2.7 第 4 轮（工具改为独立运行页）
- 需求：所有工具运行时都进入新页面，不再用右侧抽屉。
- 改法：新建 `pages/ToolRunPage.tsx`（路由 `/tools/:toolId`，套 AppLayout 外壳），内容自原 ToolDetailDrawer 整体移植：停用/依赖缺失提示、表单 + ToolDiagram、重置/执行、最近结果、该工具历史；列表未加载时先 load()，查无此工具给空态返回。ToolsPage 四处 select(tool.id) 与运行记录行改 navigate('/tools/' + id)；GlobalSearch 工具命中从 state 传参（此前无人消费的死路径）改为直跳 /tools/:id；toolStore 的 selectedId/select 退役删除；ToolDetailDrawer.tsx 删除。
- 位置：ToolRunPage.tsx（新建）、ToolsPage.tsx、App.tsx、toolStore.ts、GlobalSearch.tsx；删 components/tool/ToolDetailDrawer.tsx。
- 验证：两端 tsc 0 错 + build；dist 后 asar 回读新页面字符串。
- 遗留：运行页表单值不随路由参数持久化（返回再进会重置，与抽屉原行为一致）；工具被移除时停留在本页会显示「没找到这个工具」空态。

## 2026-10-11 · v1.2.7 第 3 轮（计算工具电路配图）
- 需求：unit-convert / circuit-calc / filter-calc / opamp-calc / filter-sim 五个计算工具都要图片交互；滤波类每种选择（mode / topo / topology）都要显示对应电路图。
- 改法：新增 `components/tool/diagrams/` —— index.tsx#ToolDiagram 按 toolId 分发并套统一外框（「电路示意」卡），五个自包含模块 `<toolId>.diagram.tsx`（纯内联 SVG，按 payload 表单值联动切图）；ToolDetailDrawer 在表单后插一行渲染。符号按规范（电阻锯齿 / 电容双板 / 电感半圆 / 运放三角形 / 接地三横线），位号与表单字段一致，图下标结构名 + 核心公式；颜色只走 currentColor + 主题类，无 hex。
- 覆盖：filter-calc 8 mode（lc 随 topo 三缩略图高亮当前、resonant 随 kind、rolloff 斜率随 n）；filter-sim 9 topology（与 buildNetlist 逐节点核对，梯形图注 sections 级数）；circuit-calc 8 mode；opamp-calc 5 mode（gain 反相 + 同相双图、hysteresis 电路 + 传输曲线）；unit-convert 12 类概念图（fromUnit → 类别）。
- 位置：`src/renderer/src/components/tool/diagrams/` 下 `types.ts`、`index.tsx` 与 `{unit-convert,circuit-calc,opamp-calc,filter-calc,filter-sim}.diagram.tsx` 共 7 个新文件 + ToolDetailDrawer.tsx（一行 import + 一行渲染）。
- 验证：两端 tsc 0 错 + build；整合期修掉 Figure children 类型（JSX.Element→ReactNode）与 rolloff 的 xFC 未定义名（tsc 抓到，运行时会 ReferenceError）。
- 遗留：unit-convert 模块内 UNIT_CATEGORY 表需在 runner 加单位时手动同步；配图为静态示意，不随输入数值改变元件参数标注。

## 2026-10-10 · v1.2.6 第 3 轮（工具页收紧 + 三个电路工具）
- 需求：工具页更简洁紧凑；增删工具并加入滤波电路快速运算；**优先用现成开源程序，不要什么都自己写**。
- 改法：
  - 计算类共用 `src/main/tools/engineering.ts`（工程计数法解析 / 格式化 / E24·E12 就近标准值）；
  - 电路求解站在开源件上：`analog-filter-designer@1.0.1`（MIT，零依赖，复数 MNA + 理想运放 nullor），本项目只写 `mna.ts` 这层「搭网表 + 读曲线」的胶水；选型对比与核验数据见 `by-version/v1.2.6-r3.md`；
  - 新工具：`filter-calc`（速算与设计反算）、`filter-sim`（真实电路扫频 / 极点零点 / 阶跃 + CSV）、`opamp-calc`；删 `flashcard-maker`（与笔记页新建卡片重复）；`circuit-calc` 去掉 rc / lc 两模式；
  - `ToolField.visibleWhen` + `visibleFields()`：多模式计算器只渲染当前模式用得到的输入项，必填校验同样只看可见字段。
- 位置：`ToolsPage.tsx`（`toolbarNode` / 三张指标卡 / 依赖单行列表 / `workstation.grid.tools.v5`）、`components/tool/ToolRunnerForm.tsx#visibleFields`、`runners/filter-*.runner.ts#buildNetlist`。
- 验证：esbuild 把 runner 直接打进 `work/scratch/` 跑真实 `run()`，九种结构全过；RC 159.4 Hz vs 解析 159.155 Hz，带 10k 负载 317.9 Hz vs 318.31 Hz（加载效应入算），双 T 陷波 159.2 Hz / -73.6 dB。
- 遗留：nullor 无 GBW / 压摆率限制，高频大信号偏乐观；节数 ≥4 或高 Q 时极点拟合可能不收敛（已降级为只给扫频）；CSV 不做清理。

## 2026-09-13 以前 · 工具集市基线
- 注册表驱动：runner 进 `registry.ts` 的 `DEFINITIONS` 即出现在集市，表单由 manifest 自动渲染；外部程序经 `utils/binaries.ts#resolveBinary`（托管 bin → PATH → winget → pip → 包内自带二进制）解析，缺依赖时卡片显示「依赖缺失」。