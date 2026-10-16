# 转换工具 · 外部引擎与依赖探测

> 功能线速查：runners/doc-convert.runner.ts + convert-shared.ts + utils/{binaries,dependency-check}.ts + scripts/check-tools.mjs
> 记录格式见 `docs/modifications/README.md`；新改动**追加在本行下方的最前面**。

## 2026-10-16 · v1.2.7 第 9 轮（doc ↔ PDF 互转）
- 需求：文档转换工具支持 doc 与 PDF 互转；用户要求优先站成熟开源实现，不自己写。
- 改法：路由四路 —— pdf 源→pdf2docx（仅 .docx）；pdf 目标→LibreOffice 无头（md/tex/epub 先 pandoc 出中间 docx 再链）；.doc 源→soffice 归一化 docx 后交 pandoc；其余 pandoc 原路径。soffice 带独立 `-env:UserInstallation` profile 防 Windows 实例转交（libreoffice-convert 做法）；产物经 `workspace-tmp/doc-convert` 暂存再 moveInto（EXDEV 回退复制）。
- 新依赖接线固定五处：domain.ts#DependencyId、constants.ts#DEPENDENCY_META、binaries.ts（ToolBinaryId + probeLibreOffice 目录探测）、dependency-check.ts（PROBE_ARGS + checkDependencies 列表）、scripts/check-tools.mjs 镜像。加新引擎五处都要动。
- 位置：详见 `by-version/v1.2.7-r9.md`。
- 验证：check-tools 两项新依赖正确报缺 + 安装命令；scratch 6 组路由断言全过（md→docx 真转）。
- 遗留：本机未装 LibreOffice / pdf2docx，真实转换链待用户装依赖目检；扫描件 PDF 无 OCR。
