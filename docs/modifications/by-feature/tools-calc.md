# 工具集 · 计算与转换工具线

> 功能线速查：`src/main/tools/`（registry + runners + engineering.ts + mna.ts）+ `pages/ToolsPage.tsx` + `components/tool/*`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

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