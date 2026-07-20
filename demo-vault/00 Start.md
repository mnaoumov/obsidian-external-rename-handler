Welcome to the [External Rename Handler](https://github.com/mnaoumov/obsidian-external-rename-handler/) demo vault. By default, when a file is renamed or moved **outside** of Obsidian - by your OS file manager, a terminal command, `git`, a sync client, or any other app - Obsidian sees it as an unrelated **delete** plus **create**, so every link that pointed at the old path silently breaks. **External Rename Handler** watches the vault while Obsidian is running, recognizes that delete/create pair as a single **rename**, and lets Obsidian update the links for you.

**How to try it:** keep Obsidian open, then use your operating system's file manager or a terminal to rename [[Rename me externally]] to something else (for example `Renamed externally.md`). Watch the links in [[References/Link A]] and [[References/Link B]] follow the file to its new name. Full steps are in [[01 External renames]].

## Feature

- [[01 External renames]]
- [[02 Moving and folders]]
- [[03 How it works]]
- [[04 Settings]]
