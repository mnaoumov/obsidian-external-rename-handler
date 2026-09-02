# External renames

This is the headline feature. When **Obsidian is running**, External Rename Handler notices a file that was renamed outside of the app and treats it as a real **rename**, so the file keeps its identity instead of arriving as an unrelated delete + create. Rewriting the links that pointed at the old name is then done by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler).

## Before you start

Install **Advanced Rename and Delete Handler** - the walkthrough below needs it. External Rename Handler offers it to you: click **Install** on the notice it shows, or on the banner at the top of **Settings -> Community plugins -> External Rename Handler**. Without it, the steps below still detect the rename, but `Link A` and `Link B` keep pointing at the old name.

## Try it

You need something *outside* Obsidian to do the renaming - Obsidian must stay open the whole time.

1. Keep this vault open in Obsidian.
2. Open [References/Link A](<./Materials/01 External renames/References/Link A.md>) and [References/Link B](<./Materials/01 External renames/References/Link B.md>) so you can watch them. Both link to [Rename me externally](<./Materials/01 External renames/Rename me externally.md>).
3. Switch to your operating system's file manager (Finder, File Explorer, etc.) or a terminal, and navigate to this vault's folder on disk.
4. Rename `Rename me externally.md` to `Renamed externally.md` there - **not** inside Obsidian.
5. Switch back to Obsidian. External Rename Handler detects the external rename, and Advanced Rename and Delete Handler rewrites the links in `Link A` and `Link B` to point at `Renamed externally`.

Using a terminal instead? From the vault folder:

```sh
mv "Rename me externally.md" "Renamed externally.md"
```

Or press the button - it renames the file through Node's `fs`, never through Obsidian's own API, which is exactly what your file manager does and what makes the rename *external*:

```code-button
---
caption: Rename the note from outside Obsidian
---
await require('/demoSetup.ts').renameExternally(app);
```

```code-button
---
caption: Reset the demo notes
---
await require('/demoSetup.ts').resetDemo(app);
```

Manual equivalent of the reset: rename everything back by hand in your file manager.

The same thing happens when the file is renamed by `git checkout`, a cloud-sync client, or a backup-restore tool - as long as Obsidian is running to observe it.

> [!WARNING]
>
> The plugin only works while Obsidian is **running** during the external rename. Renames made while Obsidian is closed are not detected. See [03 How it works](<./03 How it works.md>) for the full list of caveats.
