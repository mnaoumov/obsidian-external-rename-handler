# Moving and folders

An external **move** is just a rename to a different path, so External Rename Handler handles it the same way - and it works for folders too, not only single files.

As in [01 External renames](<./01 External renames.md>), install [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler) first: this plugin recognizes the move, that one rewrites the links.

## Try moving a file

1. Keep Obsidian open. Open [References/Link A](<./Materials/01 External renames/References/Link A.md>) and [References/Link B](<./Materials/01 External renames/References/Link B.md>) to watch them.
2. In your OS file manager or terminal, move `Rename me externally.md` into the `References` folder on disk.
3. Back in Obsidian, the links update to point at the file's new location.

```sh
mv "Rename me externally.md" "References/Rename me externally.md"
```

```code-button
---
caption: Move the note into References/ from outside Obsidian
---
await require('/demoSetup.ts').moveExternally(app);
```

```code-button
---
caption: Reset the demo notes
---
await require('/demoSetup.ts').resetDemo(app);
```

## Try renaming a folder

1. In your OS file manager or terminal, rename the `References` folder to something else, for example `Linked notes`.
2. Back in Obsidian, links that pointed into that folder are updated to the new folder path.

```code-button
---
caption: Rename the References folder from outside Obsidian
---
await require('/demoSetup.ts').renameFolderExternally(app);
```

Manual equivalent: rename that folder in your file manager. Reset afterwards with the button above.

## Caveats to keep in mind

- The plugin only handles files and folders **inside** the vault. Renaming a file that lives outside the vault (even one referenced from inside) is not handled.
- Files and folders whose names start with a dot (`.`) - such as `.obsidian` - are ignored.
- Only items Obsidian already tracks are handled.

See [03 How it works](<./03 How it works.md>) for why these limits exist, and [04 Settings](<./04 Settings.md>) to tune the detection.
