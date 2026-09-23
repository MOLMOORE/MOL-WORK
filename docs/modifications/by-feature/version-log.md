# 版本信息 · 双写点与发版流程

> 功能线速查：CHANGELOG.md + SettingsPage.tsx 的 CHANGELOG 常量 + package.json version
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 固定动作（AGENTS.md 第 1、3 节 + 版本发布固定流程）
1. `package.json` version；2. `CHANGELOG.md` 顶部追加；3. `SettingsPage.tsx` 的 `CHANGELOG` 数组顶部追加同一条；4. `npm run dist`；5. commit（+ 通过后 tag/merge/release）。
- 注意：v1.2.5 是「一个版本号内多轮提交」，每轮在 CHANGELOG 的 v1.2.5 段里追加小标题，并在 `docs/modifications/by-version/` 单独写一篇 rN。