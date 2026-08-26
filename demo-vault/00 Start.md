# Start here

Welcome to the [External Rename Handler](https://github.com/mnaoumov/obsidian-external-rename-handler/) demo vault. By default, when a file is renamed or moved **outside** of Obsidian - by your OS file manager, a terminal command, `git`, a sync client, or any other app - Obsidian sees it as an unrelated **delete** plus **create**, so every link that pointed at the old path silently breaks. **External Rename Handler** watches the vault while Obsidian is running, recognizes that delete/create pair as a single **rename**, and lets Obsidian update the links for you.

**How to try it:** keep Obsidian open, then use your operating system's file manager or a terminal to rename [Rename me externally](<./Materials/01 External renames/Rename me externally.md>) to something else (for example `Renamed externally.md`). Watch the links in [References/Link A](<./Materials/01 External renames/References/Link A.md>) and [References/Link B](<./Materials/01 External renames/References/Link B.md>) follow the file to its new name. Full steps are in [01 External renames](<./01 External renames.md>).

If you would rather not leave Obsidian, every walkthrough has a button that does the same thing through Node's `fs` - which is genuinely outside Obsidian's own API, so the plugin sees a real external rename - plus a reset button, since each attempt changes the vault.

## Feature

- [01 External renames](<./01 External renames.md>)
- [02 Moving and folders](<./02 Moving and folders.md>)
- [03 How it works](<./03 How it works.md>)
- [04 Settings](<./04 Settings.md>)

## Materials

`Materials/` holds the notes the walkthroughs operate on, one folder per note that needs them — `Materials/01 External renames/` has the note you rename from outside Obsidian and the two notes linking to it. Expect its contents to change as you follow the steps; renaming things is the point.
