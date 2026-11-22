# External Dependency Downloader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add an in-app dependency download manager with per-item selection and progress.

**Architecture:** A main-process service resolves official download URLs, streams files to user data, verifies/extracts portable tools, and emits IPC progress. A shared renderer component is used by both Tools and Settings.

**Tech Stack:** Electron 37, TypeScript 5, React 18, Node fetch, JSZip, SQLite-backed app.

**Spec:** `docs/superpowers/specs/2026-11-22-dependency-downloader-design.md`

## Global Constraints

- Do not auto-install LibreOffice or modify the system Python environment.
- Download only after an explicit user click.
- Keep existing dependency discovery order unchanged.
- Portable tools install under `<userData>/bin`.
- No Git commit or GitHub operation.

### Task 1: Download types and shared metadata

**Files:**
- Modify: `src/shared/types/domain.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/shared/constants.ts`

**Interfaces:**
- Produces: `DependencyDownloadPhase`, `DependencyDownloadStatus`, and download metadata in `DEPENDENCY_META`.

- [ ] Add typed download status and IPC methods.
- [ ] Add portable/installer/manual metadata.
- [ ] Run TypeScript checks.

### Task 2: Main download service

**Files:**
- Create: `src/main/services/dependency-download.helpers.ts`
- Create: `src/main/services/dependency-download.service.ts`

**Interfaces:**
- Consumes: `DependencyId`, `managedBinDir`, `playwrightBrowsersPath`.
- Produces: `downloadDependency(id)`, `cancelDependencyDownload(id)`, `dependencyDownloadStatuses()`.

- [ ] Add archive matching and semver selection helpers.
- [ ] Implement streamed download, checksum, extraction, and Playwright install.
- [ ] Publish `event:dependency-download` state transitions.
- [ ] Test helpers and local download behavior.

### Task 3: IPC and preload bridge

**Files:**
- Modify: `src/main/ipc/app.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types/ipc.ts`

**Interfaces:**
- Produces: `api.app.getDependencyDownloads()`, `api.app.downloadDependency(id)`, `api.app.cancelDependencyDownload(id)`, `api.app.openExternal(url)`, and `api.onDependencyDownload(cb)`.

- [ ] Register handlers.
- [ ] Expose methods through contextBridge.
- [ ] Run main/preload build.

### Task 4: Shared dependency manager UI

**Files:**
- Create: `src/renderer/src/components/tool/DependencyManager.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Modify: `src/renderer/src/pages/ToolsPage.tsx`

**Interfaces:**
- Consumes: dependency statuses, progress event, refresh callback.
- Produces: selectable download controls, progress rows, installer actions, and manual guide actions.

- [ ] Add the shared component.
- [ ] Replace duplicated dependency row markup.
- [ ] Run renderer TypeScript/build.

### Task 5: Verification and assignment sync

**Files:**
- Create: `scripts/check-dependency-downloads.mjs`
- Modify: `docs/feature-index.md`
- Modify: relevant `docs/modifications/by-feature` and `by-version`
- Copy changed source/tests to assignment folders after verification.

- [ ] Run helper/network smoke tests.
- [ ] Run `npm run build` and `npm run check-tools`.
- [ ] Update docs and sync assignment copies.
