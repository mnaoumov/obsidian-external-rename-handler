# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

External Rename Handler is an Obsidian plugin that recognizes renames made outside of Obsidian (e.g. from the OS file explorer or another app) and reports them to Obsidian as real renames, so the file keeps its identity instead of arriving as an unrelated delete plus create. It is built on `obsidian-dev-utils`.

Since **4.0.0** it does **not** rewrite links itself. Rename and delete handling — the `RenameDeleteHandlerComponent` this plugin used to construct — belongs to the separate **Advanced Rename and Delete Handler** plugin (`advanced-rename-and-delete-handler`), which owns it for the whole vault; four sibling plugins made the same handover. This plugin suggests installing it and offers its legacy `shouldUpdateLinks` value across through that plugin's `migrateSettings` API.

## Commands

| Task              | Command                    |
|-------------------|----------------------------|
| TypeScript check  | `npm run build:compile`    |
| Build             | `npm run build`            |
| Dev (watch)       | `npm run dev`              |
| Lint              | `npm run lint`             |
| Lint (fix)        | `npm run lint:fix`         |
| Format            | `npm run format`           |
| Format (check)    | `npm run format:check`     |
| Spellcheck        | `npm run spellcheck`       |
| Markdown lint     | `npm run lint:md`          |
| Markdown lint fix | `npm run lint:md:fix`      |
| Unit tests        | `npm test`                 |
| Coverage          | `npm run test:coverage`    |
| Integration tests | `npm run test:integration` |
| Branch gate       | `npm run gate`             |
| Commit (wizard)   | `npm run commit`           |

## Architecture

- **Root config files** are thin re-exports — actual logic lives in `scripts/` (`eslint.config.mts` → `scripts/eslint-config.ts`, `commitlint.config.ts` → `scripts/commitlint-config.ts`, etc.).
- **`src/`** — plugin source:
  - `main.ts` — Obsidian entry point (default-exports the `Plugin` class from `plugin.ts`)
  - `plugin.ts` — `Plugin` extends `PluginBase`; in `onloadImpl` wires up the settings component/tab, the dev-utils `PluginSuggestionComponent` (suggesting Advanced Rename and Delete Handler), the `ExternalRenameHandlerComponent`, and the dev-utils `SettingsMigrationComponent`; asserts the vault adapter is a `FileSystemAdapter`. It constructs **no** `RenameDeleteHandlerComponent` — two handlers acting on one rename corrupt links, and the suggested plugin is the vault's single owner
  - `desktop-external-rename-handler-component.ts` — core `LayoutReadyComponent`; builds/cleans the path↔inode map on layout ready, starts the `chokidar` watcher on the vault dir, and translates filesystem add/unlink events into Obsidian rename/delete handling (with a configurable deletion-vs-rename timeout). The watcher is started directly on layout ready — the `loadSettings` / `saveSettings` handlers only re-register it when the polling interval changes, because the settings are already loaded by the time the layout is ready and the initial `loadSettings` event has therefore been missed. **The `desktop-` prefix is load-bearing, not descriptive** — `obsidian-dev-utils`' shared ESLint config exempts `src/**/desktop-*.ts` from `import-x/no-nodejs-modules` and `obsidianmd/no-nodejs-modules`, which is what lets this file import `node:fs` and `node:fs/promises` with no disable comment. Rename it without the prefix and both rules report again, and the `obsidianmd` twin cannot be waived at all, because the community-directory runner sets `eslint-comments/no-restricted-disable` over `obsidianmd/*`. This plugin is `isDesktopOnly` as a whole, so the prefix names a property of the plugin rather than of the file; the alternative — teaching the shared config to read the manifest flag — was weighed and rejected, to keep one exemption axis rather than two. `onLayoutReady` **disposes the `PathInoMap` it is about to replace and registers the new one via `ComponentEx.registerDisposable`**, and both halves are needed: a reload of this component registers a *second* workspace layout-ready callback, so the method can run again over a map that already owns an open connection and an armed flush, and without the registration nothing closes the connection on unload at all
  - `path-ino-map.ts` — `PathInoMap`, a two-way path↔inode map persisted in IndexedDB (debounced writes) to detect renames across sessions. Three lifetime facts, all of them load-bearing and each one a defect that was live until 4.0.1: it opens on **`window`, never `activeWindow`** — the store is keyed by `app.appId` so it belongs to the vault, and binding it to a focused popout means closing that popout closes the connection under a still-loaded plugin; it implements **`Disposable`**, and `[Symbol.dispose]` cancels the debouncer, *flushes* what is queued and closes the connection, because a cancel alone still drops the pending writes; and `processStoreActions` drops the queued actions **only after `commit()` returns**, reporting a failure through `printError` instead of letting it escape the debounce callback as an uncaught error. The component is what ties that teardown to a lifetime — see the entry below
  - `dot-file.ts` — `isDotFile` helper (treats any path segment starting with `.` as a dot file to ignore)
  - `plugin-settings.ts` — `PluginSettings` data class (`pollingIntervalInMilliseconds`, `deletionRenameDetectionTimeoutInMilliseconds`, plus two handover bookkeeping keys: `isAdvancedRenameAndDeleteHandlerSuggestionDeclined` and `proposedShouldHandleRenames`, the pending offer — `null` means nothing to offer, which is also what a fresh install has)
  - `plugin-settings-component.ts` — `PluginSettingsComponent` extending the dev-utils `PluginSettingsComponentBase`; its legacy-settings converter is what carries a pre-4.0.0 `shouldUpdateLinks` into `proposedShouldHandleRenames` before the first save rebuilds `data.json` from the declared properties alone
  - the settings handover itself is the dev-utils `SettingsMigrationComponent`, constructed in `plugin.ts`: it watches for Advanced Rename and Delete Handler's `^1` API and offers the pending value through its `migrateSettings`. This plugin supplies only the two closures — `getProposedSettings`, which wraps `proposedShouldHandleRenames` into a payload (and returns `null` when nothing is pending), and `retireProposedSettings`. Two things the shared component guarantees, both originally found by driving the real binary and each worth knowing before anyone reaches for a hand-rolled variant again: it never gates the watch on the pending value in `onload` (the settings component is a sibling still loading, so `settings` holds the defaults there — it wires the api-ref `change` and the `loadSettings` edges and re-reads inside the propose path), and this plugin's `retireProposedSettings` must use `editAndSave`, never `setProperty`, so the retirement outlives a reload
  - `advanced-rename-and-delete-handler.ts` — the suggested plugin's id and display name, written once and shared by the suggestion and the migration, plus `MigratableSettings`, the payload half of the handover contract (its envelope — `migrateSettings`, the proposer, the applied flag — comes from dev-utils' `settings-migration-api`)
  - `plugin-settings-tab.ts` — `PluginSettingsTab` rendering the settings UI via `SettingEx`
  - `patches/file-system-adapter-on-file-change-patch-component.ts` — `MonkeyAroundComponent` that patches `FileSystemAdapter.onFileChange` to suppress Obsidian's own notifications for everything except dot files (dot files still fall through to the original), and to capture the original method for the handler to invoke. Because this suppression is unconditional, the `chokidar` watcher is the *only* thing left that reaches the UI — if it fails to start, no external change is ever reflected
- **`main` field** points to `src/main.ts` (Obsidian plugin source entry; built artifact is `dist/build/main.js`, not published to npm).
