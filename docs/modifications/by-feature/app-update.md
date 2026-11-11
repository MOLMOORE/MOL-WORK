# 自动更新 · GitHub Releases

> 功能线速查：`src/main/services/update.service.ts` + `src/main/ipc/app.ipc.ts` +
> `SettingsPage.tsx#AboutSection` + `electron-builder.yml#publish`
> 新改动追加在本行下方的最前面。

## 2026-11-11 · v1.2.8 第 1 轮（自动检查与一键下载）
- 需求：应用启动后自动检查 GitHub 最新版；设置页显示状态，用户一键下载并重启安装；不做云端备份。
- 根因：v1.2.7 及以前没有更新器依赖、GitHub publish 配置和在线更新 UI；Release 虽生成 `latest.yml`，发布流程却没有上传该元数据。
- 改法：主进程用 `electron-updater` 管理 `unsupported / idle / checking / available / not-available / downloading / downloaded / error` 状态；关闭自动下载和退出安装，下载完成后由“重启并安装”触发。默认 GitHub provider 会访问当前网络不可达的 `github.com/releases.atom`，因此改为自定义 `GitHubApiUpdateProvider`，通过 `api.github.com` 读取 Release 与 `latest.yml`，再从 Release Asset API 下载安装包；差分下载关闭，完整安装包仍由 SHA-512 校验。
- 位置：`services/update.service.ts`、`services/github-api-update.provider.ts`、`ipc/app.ipc.ts`、`main/index.ts#installUpdateAndRestart`、`preload/index.ts`、`shared/types/ipc.ts`、`SettingsPage.tsx#AboutSection`、`electron-builder.yml#publish`。
- 参考：electron-builder v26 Auto Update、`electron-updater@6.8.11` 的 custom provider 与 `quitAndInstall` API、GitHub Releases REST API。
- 验证：node/web tsc 0 错；真实 API 烟测在当前 `v1.2.7` 缺 `latest.yml` 时返回明确业务错误，不再出现 `ERR_CONNECTION_RESET`；隔离 fixture 验证 Release JSON、`latest.yml` 解析、安装资产映射与下载头均正确。
- 遗留：当前安装包未签名，Windows 仍会提示未知发布者；v1.2.7 没有更新器，必须手动安装一次 v1.2.8；真实“v1.2.8 下载并安装后续版本”只能在下一个 Release 产生后做端到端复验。
