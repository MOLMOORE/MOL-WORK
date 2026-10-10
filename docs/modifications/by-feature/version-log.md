# 版本信息 · 双写点与发版流程

> 功能线速查：CHANGELOG.md + SettingsPage.tsx 的 CHANGELOG 常量 + package.json version
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-10 · v1.2.6 发布（三轮合并收尾）
- 版本构成：v1.2.6 内三轮提交（`ffe3a95` / `3ac6da2` / `d6efc4d`），标签 `v1.2.6` 每轮移动，最终停在第三轮；一个版本号一篇 `by-version/v1.2.6-rN.md`，收尾另写 `v1.2.6-release.md`。
- 双写点：CHANGELOG.md 的 v1.2.6 段按「笔记与资料 / 番茄钟 / 工具集 / 主题与提示 / 窗口外壳」五个小标题逐轮追加；SettingsPage.tsx 的 items 同步加组前缀条目，date 统一 2026-10-10。
- 发版顺序照 v1.2.5 的教训执行：**dist 放在最后一次改动源码之后**，之后只 commit / tag，就不需要 `--clobber` 重传；快进合并 main → 推 main / develop / tag → `gh release create --latest` 只附 Setup.exe。
- 核验：GitHub 资产 digest 与本地 `Get-FileHash` 逐位一致（sha256 6d5893a1…ff015e2，101,796,569 B），exe FileVersion 1.2.6，asar 内含新依赖 analog-filter-designer。
- 详见 `by-version/v1.2.6-release.md`。
## 2026-09-24 · v1.2.5 发布（更新扼要精简）
- 需求：发版前把 v1.2.5 的更新扼要压缩，更简洁鲜明。
- 改法：CHANGELOG.md 的 v1.2.5 段 122 行 → 30 行，按「阅读模式 / 批注 / 笔记与界面」三组一条一行；SettingsPage.tsx 的 items 65 条 → 17 条并加组前缀，date 统一 2026-09-24；细节改指向 docs/modifications/by-version/。历史版本段不动。
- 坑：PowerShell Set-Content 写出的 node 脚本本身是 LF，脚本里的模板字符串因此只带 LF，直接按 CRLF split/join 会把 LF 混进仓库 —— 写完必须再跑一遍行尾检查（本轮 CHANGELOG.md 一度 210 crlf / 237 lf）。
- 验证：tsc + build + dist + asar 回读；详见 by-version/v1.2.5-release.md。

## 固定动作（AGENTS.md 第 1、3 节 + 版本发布固定流程）
1. `package.json` version；2. `CHANGELOG.md` 顶部追加；3. `SettingsPage.tsx` 的 `CHANGELOG` 数组顶部追加同一条；4. `npm run dist`；5. commit（+ 通过后 tag/merge/release）。
- 注意：v1.2.5 是「一个版本号内多轮提交」，每轮在 CHANGELOG 的 v1.2.5 段里追加小标题，并在 `docs/modifications/by-version/` 单独写一篇 rN。
- 发版打包两条硬经验（v1.2.5 发布当天踩到）：
  1. 用户很可能正开着 `release/win-unpacked/个人工作站.exe` 绿色版，会锁住整个目录让 electron-builder 的 EnsureEmptyDir 报 Access is denied。先看进程再打包；**不要为了打包去关用户的窗口**，宁可 `--config.directories.output=release-tmp` 另地打包再把 exe / blockmap / latest.yml 挪回 `release/`。
  2. 发版后若又改了任何进包的内容（比如精简 CHANGELOG），必须重跑一次 dist 并 `gh release upload v{ver} <exe> --clobber` 重传，再核对 `gh api .../releases/tags/v{ver}` 的 `digest` 与本地 `Get-FileHash` 一致 —— 两次构建的 NSIS 容器字节会差几十字节，光看大小看不出来。
