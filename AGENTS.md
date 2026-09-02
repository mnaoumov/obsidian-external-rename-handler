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
| Commit (wizard)   | `npm run commit`           |

## Architecture

- **Root config files** are thin re-exports — actual logic lives in `scripts/` (`eslint.config.mts` → `scripts/eslint-config.ts`, `commitlint.config.ts` → `scripts/commitlint-config.ts`, etc.).
- **`src/`** — plugin source:
  - `main.ts` — Obsidian entry point (default-exports the `Plugin` class from `plugin.ts`)
  - `plugin.ts` — `Plugin` extends `PluginBase`; in `onloadImpl` wires up the settings component/tab, the dev-utils `PluginSuggestionComponent` (suggesting Advanced Rename and Delete Handler), the `ExternalRenameHandlerComponent`, and the `RenameDeleteHandlerMigrationComponent`; asserts the vault adapter is a `FileSystemAdapter`. It constructs **no** `RenameDeleteHandlerComponent` — two handlers acting on one rename corrupt links, and the suggested plugin is the vault's single owner
  - `external-rename-handler-component.ts` — core `LayoutReadyComponent`; builds/cleans the path↔inode map on layout ready, starts the `chokidar` watcher on the vault dir, and translates filesystem add/unlink events into Obsidian rename/delete handling (with a configurable deletion-vs-rename timeout). The watcher is started directly on layout ready — the `loadSettings` / `saveSettings` handlers only re-register it when the polling interval changes, because the settings are already loaded by the time the layout is ready and the initial `loadSettings` event has therefore been missed
  - `path-ino-map.ts` — `PathInoMap`, a two-way path↔inode map persisted in IndexedDB (debounced writes) to detect renames across sessions
  - `dot-file.ts` — `isDotFile` helper (treats any path segment starting with `.` as a dot file to ignore)
  - `plugin-settings.ts` — `PluginSettings` data class (`pollingIntervalInMilliseconds`, `deletionRenameDetectionTimeoutInMilliseconds`, plus two handover bookkeeping keys: `isAdvancedRenameAndDeleteHandlerSuggestionDeclined` and `proposedShouldHandleRenames`, the pending offer — `null` means nothing to offer, which is also what a fresh install has)
  - `plugin-settings-component.ts` — `PluginSettingsComponent` extending the dev-utils `PluginSettingsComponentBase`; its legacy-settings converter is what carries a pre-4.0.0 `shouldUpdateLinks` into `proposedShouldHandleRenames` before the first save rebuilds `data.json` from the declared properties alone
  - `rename-delete-handler-migration-component.ts` — watches for Advanced Rename and Delete Handler's `^1` API and offers the pending value through its `migrateSettings`. Two things it must keep doing, both found only by driving the real binary: never gate the watch on the pending value in `onload` (the settings component is a sibling still loading, so `settings` holds the defaults there — wire the api-ref `change` and the `loadSettings` edges and re-read inside the propose path), and retire the value with `editAndSave`, never `setProperty`, so the retirement outlives a reload
  - `advanced-rename-and-delete-handler.ts` — the suggested plugin's id and display name, written once and shared by the suggestion and the migration
  - `plugin-settings-tab.ts` — `PluginSettingsTab` rendering the settings UI via `SettingEx`
  - `patches/file-system-adapter-on-file-change-patch-component.ts` — `MonkeyAroundComponent` that patches `FileSystemAdapter.onFileChange` to suppress Obsidian's own notifications for everything except dot files (dot files still fall through to the original), and to capture the original method for the handler to invoke. Because this suppression is unconditional, the `chokidar` watcher is the *only* thing left that reaches the UI — if it fails to start, no external change is ever reflected
- **`main` field** points to `src/main.ts` (Obsidian plugin source entry; built artifact is `dist/build/main.js`, not published to npm).
