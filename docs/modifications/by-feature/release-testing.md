# 打包测试位置

> 功能线：`electron-builder.yml` 的 `win-unpacked` 产物、`Desktop/testarea` 测试目录与发版清理流程。

## 2026-11-16 · v1.2.9（第 1 轮）
- 需求：直接在项目 `release/win-unpacked/` 运行会触发 Electron 初始化异常；后续把可运行解包版固定放到 `C:\Users\15008\Desktop\testarea\`。
- 根因：同一套文件在 `testarea` 或普通 D 盘目录可正常启动，但项目工作区目录继承 Codex 安全 ACL；直接在该目录运行会在写应用日志前以 `EXCEPTION_BREAKPOINT` 退出，不是 `app.asar` 损坏。
- 改法：打包后把 `win-unpacked/` 内容复制到 `testarea` 做真实启动烟测；通过后删除 `release/win-unpacked/` 和旧重复解包目录。`release/` 只保留安装包、blockmap 与 `latest.yml`。
- 位置：`AGENTS.md` 第 4 节、`README.md` 目录结构与打包说明、`docs/feature-index.md` 版本资产条目。
- 参考：实测当前工作区副本退出码 `0x80000003`；相同哈希文件复制到普通目录可正常显示主窗口。
- 验证：`testarea` 复制 293 个文件，EXE SHA-256 与原包一致；从新位置启动后日志记录主窗口已显示并持续运行。
- 遗留：未修改工作区 ACL，也未关闭火绒或 Windows 安全功能。
