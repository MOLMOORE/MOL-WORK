# MOL-WORK 文档入口

先按任务类型选择一个入口，避免一次加载整套历史。

| 需要做什么 | 读取位置 |
| --- | --- |
| 找功能对应的文件和符号 | `docs/feature-index.md` |
| 查某项功能为什么这样实现 | `docs/modifications/by-feature/<功能线>.md` |
| 查某个版本逐轮改了什么 | `docs/modifications/by-version/` |
| 查 Issue / 领域文档约定 | `docs/agents/` |
| 查项目长期协作规则 | 根目录 `AGENTS.md` |

## 维护顺序

1. 改代码前，从 `feature-index.md` 定位文件和功能线。
2. 只读本次相关的一到两篇 `by-feature` 记录。
3. 改动完成后，先更新 `by-version`，再更新 `by-feature`，最后校准 `feature-index`。
4. 提交前运行 `npm run check-docs`；换行异常可先运行 `npm run fix-docs`。

## 唯一事实来源

- 当前功能入口：`feature-index.md`
- 当前功能决策与风险：`by-feature/`
- 某次改动过程与当时验证：`by-version/`
- 面向用户的功能说明：根目录 `README.md`
- 面向用户的版本更新：`CHANGELOG.md` 与应用内版本日志

历史记录保留当时的“未发布”“待验收”等状态；当前状态由最新 `by-feature` 条目和 Release 记录表达。
