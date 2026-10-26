# How it works

Obsidian does not natively track renames that happen outside the app. When a file changes on disk behind its back, it only sees a **delete** of the old path and a **create** of the new one, with no idea the two are the same file - so links to the old path break.

`External Rename Handler` bridges that gap:

- While Obsidian is running, it watches the vault folder on disk for file-system changes.
- It keeps a map from each tracked file to its underlying inode (the OS's stable identifier for the file's contents). When a delete and a create share the same inode, it knows the file was **renamed**, not replaced, and reports a single `rename` event, so the file keeps its identity.
- By default it **polls** the file system on an interval rather than waiting for the operating system's change events, which network shares may never deliver - see [05 File systems](<./05 File systems.md>).
- The map is saved, so it survives a restart. When Obsidian starts, a file at a path the map does not know is looked up by its inode. If that inode belonged to a path that is now gone, the file was renamed or moved **while Obsidian was closed**, and that is reported as a `rename` too.

## Renames made while Obsidian was closed

When Obsidian starts, it reads the vault from disk afresh, so a file moved while it was closed simply turns up at its new path, and the links to the old one are left unresolved. The plugin reports such a file once Obsidian has finished indexing the vault, and one notice says how many it found.

It is careful about what counts:

- The old path must be gone. If a file sits there again, or the old path is a second name of the same file (a hard link), the links to it still work, and nothing is reported.
- The file's creation time must match the one saved with the inode. Some file systems (ext4 on Linux, for one) give a freed inode to the next new file, so a deleted note and an unrelated new one can share it. The creation time tells them apart.
- A copy is a new file with a new inode, so it is never taken for a rename. A file moved out of the vault is simply gone.
- A file saved by writing a new copy and swapping it in while Obsidian was closed gets a new inode. The plugin notices at the next start, because the file's modification time or size no longer matches the saved one, and records the new inode. The same save made while Obsidian is running is followed as it happens.

Files the plugin has not seen since an update to **4.1.0** carry no saved creation time yet. They get one at the next start, so the first restart after the update cannot recognize them. The `shouldDetectOfflineRenames` setting in [04 Settings](<./04 Settings.md>) turns this whole check off.

That `rename` event is where this plugin's job ends. Obsidian only rewrites links when *it* performs the rename, so something has to act on the event - and since **4.0.0** that something is [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler), which owns rename and delete handling for the whole vault rather than a copy of it living inside each plugin that happened to need one. Without it installed, an external rename is still detected and the file keeps its identity, but the notes pointing at the old name are left as they were.

## File systems

Everything above rests on a rename keeping the file's inode, and not every file system keeps it. [05 File systems](<./05 File systems.md>) lists each one measured, what goes wrong where it does not work, and why a rename made straight after a save that replaced the note can be missed.

## Limitations (be honest with yourself)

- A rename made while Obsidian is closed is recognized only when the file kept its identity on disk - see [Renames made while Obsidian was closed](#renames-made-while-obsidian-was-closed) above.
- Some file systems do not keep that identity, or report changes late or not at all - see [05 File systems](<./05 File systems.md>).
- Only files and folders **inside** the vault are handled, and only ones Obsidian already tracks.
- Items whose names start with a dot (`.`) are ignored.
- A rename of a file that lives outside the vault is not handled, even if notes inside link to it.

## Tuning

Two of the [04 Settings](<./04 Settings.md>) control the detection itself:

- `pollingIntervalInMilliseconds`
  - how often the safety-net poll runs.
- `deletionRenameDetectionTimeoutInMilliseconds`
  - how long to wait before deciding a delete really was a delete and not the first half of a rename.

See [04 Settings](<./04 Settings.md>) for all of the options.
