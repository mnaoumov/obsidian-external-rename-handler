[Docs](https://github.com/mnaoumov/obsidian-external-rename-handler/)

# External renames

This is the headline feature. When **Obsidian is running**, External Rename Handler notices a file that was renamed outside of the app and treats it as a real **rename**, so Obsidian updates every link that pointed at the old name. Without the plugin, Obsidian would treat the same change as an unrelated delete + create and the links would break.

## Try it

You need something *outside* Obsidian to do the renaming - Obsidian must stay open the whole time.

1. Keep this vault open in Obsidian.
2. Open [[References/Link A]] and [[References/Link B]] so you can watch them. Both link to [[Rename me externally]].
3. Switch to your operating system's file manager (Finder, File Explorer, etc.) or a terminal, and navigate to this vault's folder on disk.
4. Rename `Rename me externally.md` to `Renamed externally.md` there - **not** inside Obsidian.
5. Switch back to Obsidian. The plugin detects the external rename and Obsidian rewrites the links in `Link A` and `Link B` to point at `Renamed externally`.

Using a terminal instead? From the vault folder:

```sh
mv "Rename me externally.md" "Renamed externally.md"
```

The same thing happens when the file is renamed by `git checkout`, a cloud-sync client, or a backup-restore tool - as long as Obsidian is running to observe it.

> [!WARNING]
>
> The plugin only works while Obsidian is **running** during the external rename. Renames made while Obsidian is closed are not detected. See [[03 How it works]] for the full list of caveats.
