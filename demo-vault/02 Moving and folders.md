[Docs](https://github.com/mnaoumov/obsidian-external-rename-handler/)

# Moving and folders

An external **move** is just a rename to a different path, so External Rename Handler handles it the same way - and it works for folders too, not only single files.

## Try moving a file

1. Keep Obsidian open. Open [[References/Link A]] and [[References/Link B]] to watch them.
2. In your OS file manager or terminal, move `Rename me externally.md` into the `References` folder on disk.
3. Back in Obsidian, the links update to point at the file's new location.

```sh
mv "Rename me externally.md" "References/Rename me externally.md"
```

## Try renaming a folder

1. In your OS file manager or terminal, rename the `References` folder to something else, for example `Linked notes`.
2. Back in Obsidian, links that pointed into that folder are updated to the new folder path.

## Caveats to keep in mind

- The plugin only handles files and folders **inside** the vault. Renaming a file that lives outside the vault (even one referenced from inside) is not handled.
- Files and folders whose names start with a dot (`.`) - such as `.obsidian` - are ignored.
- Only items Obsidian already tracks are handled.

See [[03 How it works]] for why these limits exist, and [[04 Settings]] to tune the detection.
