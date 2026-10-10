# 主题 · 皮肤与配色风格线

> 功能线速查：`src/shared/constants.ts`（THEME_SKINS / THEME_PRESETS / THEME_GROUP_META）+ `stores/appStore.ts#applyTheme` + `styles/index.css` 的 `[data-preset]` / `html[data-skin]`
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-10 · v1.2.6 第 3 轮（配色风格只留 5 种）
- 需求：默认主题的「配色风格」只保留前 5 个，其余全删。
- 改法：删 `THEME_PRESETS` 里 palette 组后 5 条（暮沙 / 石墨 / 午夜靛蓝 / 紫棠 / 墨绿夜色）+ `ThemePreset` 联合对应成员 + `index.css` 里五段 `[data-preset=...]`（50 行）；8 种观感风格与 8 款皮肤不动。
- 位置：`src/shared/constants.ts`、`src/shared/types/domain.ts`、`src/renderer/src/styles/index.css` 第一节。
- 验证：`npm run build`；`grep` 确认全仓无残留引用；旧设置里存着被删值时 `applyTheme` 写出的 `data-preset` 没有对应规则 → 落回基础配色，设置页显示「素白简约」，不报错。
- 遗留：用户需要自己再点一次才会把新值写回设置。

## 2026-09-20 以前 · 皮肤 / 风格两层结构基线
- 皮肤（`data-skin`）是顶层，会重排界面结构；风格（`data-preset`）只在默认主题下生效，切皮肤时临时归一到 minimal，回到默认即恢复。
- 新增组件样式一律走主题令牌 `hsl(var(--...))`，写死颜色会破坏 19 套深浅色与皮肤的适配。