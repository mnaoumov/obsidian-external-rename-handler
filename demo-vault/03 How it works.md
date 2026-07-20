[Docs](https://github.com/mnaoumov/obsidian-external-rename-handler/)

# How it works

Obsidian does not natively track renames that happen outside the app. When a file changes on disk behind its back, it only sees a **delete** of the old path and a **create** of the new one, with no idea the two are the same file - so links to the old path break.

External Rename Handler bridges that gap:

- While Obsidian is running, it watches the vault folder on disk for file-system changes.
- It keeps a map from each tracked file to its underlying inode (the OS's stable identifier for the file's contents). When a delete and a create share the same inode, it knows the file was **renamed**, not replaced, and reports a single `rename` event so Obsidian updates the links.
- It also **polls** the file system on an interval as a safety net, to catch changes the event stream misses.

## Limitations (be honest with yourself)

- Obsidian must be **running** during the external rename. Changes made while it is closed are not detected.
- Only files and folders **inside** the vault are handled, and only ones Obsidian already tracks.
- Items whose names start with a dot (`.`) are ignored.
- A rename of a file that lives outside the vault is not handled, even if notes inside link to it.

## Tuning

Two of the [[04 Settings]] control the detection itself:

- `pollingIntervalInMilliseconds` - how often the safety-net poll runs.
- `deletionRenameDetectionTimeoutInMilliseconds` - how long to wait before deciding a delete really was a delete and not the first half of a rename.

See [[04 Settings]] for all of the options.
