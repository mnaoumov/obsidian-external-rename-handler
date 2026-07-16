# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

External Rename Handler is an Obsidian plugin that handles renames made outside of Obsidian (e.g. from the OS file explorer or another app), keeping links and aliases up to date. It is built on `obsidian-dev-utils`.

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
  - `plugin.ts` — `Plugin` extends `PluginBase`; in `onloadImpl` wires up the settings component/tab, the dev-utils `RenameDeleteHandlerComponent` (link/alias updates), and the `ExternalRenameHandlerComponent`; asserts the vault adapter is a `FileSystemAdapter`
  - `external-rename-handler-component.ts` — core `LayoutReadyComponent`; builds/cleans the path↔inode map on layout ready, watches the vault dir with `chokidar`, and translates filesystem add/unlink events into Obsidian rename/delete handling (with a configurable deletion-vs-rename timeout)
  - `path-ino-map.ts` — `PathInoMap`, a two-way path↔inode map persisted in IndexedDB (debounced writes) to detect renames across sessions
  - `dot-file.ts` — `isDotFile` helper (treats any path segment starting with `.` as a dot file to ignore)
  - `plugin-settings.ts` — `PluginSettings` data class (`shouldUpdateLinks`, `pollingIntervalInMilliseconds`, `deletionRenameDetectionTimeoutInMilliseconds`)
  - `plugin-settings-component.ts` — `PluginSettingsComponent` extending the dev-utils `PluginSettingsComponentBase`
  - `plugin-settings-tab.ts` — `PluginSettingsTab` rendering the settings UI via `SettingEx`
  - `patches/file-system-adapter-on-file-change-patch-component.ts` — `MonkeyAroundComponent` that patches `FileSystemAdapter.onFileChange` to suppress dot-file events and capture the original method for the handler to invoke
- **`main` field** points to `src/main.ts` (Obsidian plugin source entry; built artifact is `dist/build/main.js`, not published to npm).
