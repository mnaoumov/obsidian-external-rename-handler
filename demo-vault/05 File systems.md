# File systems

`External Rename Handler` knows a rename by the file keeping its inode, the number the file system identifies a file by, across the delete and the create Obsidian would otherwise see. So it works where a rename keeps that number, and only there. See [03 How it works](<./03 How it works.md>) for the detection itself.

## Measured file systems

Every row below was measured with the plugin's own watcher settings (`chokidar` 6.0.0, Node 26 on Windows 11, Node 22 on Linux under WSL 2): a rename, a move to a subfolder and a folder rename, with both the default polling watcher and the native one (`pollingIntervalInMilliseconds` set to `0`).

| File system | Where | Live renames | Renames while Obsidian was closed |
| --- | --- | --- | --- |
| NTFS | Windows, local disk | Yes | Yes |
| NTFS under OneDrive (Files On-Demand) | Windows | Yes | Not measured |
| Google Drive for desktop (its `G:` drive) | Windows | Yes | Not measured |
| SMB share of a Windows NTFS disk | Windows | Yes (measured with polling only) | Not measured |
| SMB share of a Synology NAS | Windows | Files yes; folders only with a longer timeout, see below; nothing at all without polling | Not measured |
| ext4 opened through `\\wsl.localhost` | Windows | Yes with polling; nothing at all without it; may report a false rename, see below | Not measured |
| ext4 | Linux | Yes; may report a false rename, see below | Yes: the inode survives a remount |
| FAT32 (`vfat`) | Linux | Yes | **No**: every mount renumbers the inodes |
| FAT32 (USB sticks, SD cards) | Windows | A rename within one folder and a folder rename, but not a move to another folder; the native watcher is used there even with polling on, see below; may report a false rename | The same as live: the inode survives a remount |
| exFAT (USB sticks, SD cards) | Windows | A rename within one folder and a folder rename, but not a move to another folder; the native watcher is used there even with polling on, see below | The same as live: the inode survives a remount |

Not tested at all: exFAT on Linux, ReFS, APFS and HFS+ on macOS, NFS, Btrfs, Dropbox and iCloud Drive.

## What goes wrong where it does not work

- **A rename is missed**, and you are told nothing. Obsidian sees a delete and a create, exactly as it would without the plugin, and the links to the old name are left unresolved. That is what happens to a folder renamed on the Synology share with the default `deletionRenameDetectionTimeoutInMilliseconds` of `500` (5 times out of 6), to every rename on a share without polling (the native watcher reported no change at all there), and to a rename on a Linux FAT32 drive made while Obsidian was closed. On a network share, raise the timeout to `3000` (3 times out of 3) and keep polling on. Both settings are in [04 Settings](<./04 Settings.md>).
- **A move into another folder is missed on FAT32 and exFAT under Windows.** There a file's inode is where its entry sits in its folder, so a move to another folder gives it a new one. A rename within one folder and a folder rename kept it in every case measured, live and across a detach and re-attach of the drive. Only short names were measured; a rename to a much longer name may also need a new entry, and so a new inode.
- **Polling cannot see a new file on a FAT32 or exFAT drive under Windows, so the plugin does not poll there.** The polling watcher notices a new file only through its folder's modification time, which those drives never change: it reported no `add` there in any case measured, only the `unlink` of the old name, so a note created, renamed, moved or copied onto the drive outside Obsidian would never appear, and a renamed note or folder would be reported only as deleted. So when polling is on, the plugin first creates a few files in a temporary folder inside the vault's config folder (`.obsidian`) and watches that folder's modification time, for 3 seconds at most. If the time never changes, it uses the native watcher instead, which saw every new file on those drives, and says so in the developer console. The local disks, network shares and the WSL share measured above all change it, so they keep polling.
- **A rename is reported that never happened.** ext4 gives a freed inode to the next new file straight away, so a deleted note and an unrelated note created after it can share an inode. The plugin tells them apart by the creation time saved with the inode, both while Obsidian is running and at startup, but that time is kept to the millisecond. A note created in the same millisecond the other was deleted, which a script deleting and creating files in a tight loop manages most of the time (41 to 45 times out of 50 when measured), is still reported as a rename of the first into the second, and with `Advanced Rename and Delete Handler` installed the links to the deleted note are rewritten to the new one. A person deleting one note and creating another by hand is far slower than that. FAT32 under Windows can do the same: a deleted note's inode can go to the next file created, and FAT32 keeps the creation time only to 10 milliseconds, so 1 of 50 such pairs in a tight loop shared both the inode and the creation time. exFAT reused none of 50.

## A rename straight after a save that replaced the note

On every file system measured, a save that writes a new copy and swaps it in for the note gives the note a new inode. Most ways of writing a file on Windows rewrite it in place and keep its inode - PowerShell's `Set-Content` and `Out-File`, .NET's `File.WriteAllText` and Node's `fs.writeFile` all did - while `git checkout` of a changed note gave it a new one.

While Obsidian is running, the plugin sees that save as an edit and records the new inode, so a later rename is still recognized. A later rename, but not one made straight after the save: the polling watcher looks at the disk once per `pollingIntervalInMilliseconds` (`2000` by default), and a rename made before it has looked at the new copy reaches the plugin as nothing but a new name with an unknown inode and an old name that is gone. That is exactly what deleting one note and creating an unrelated one looks like, so the plugin reports a delete and a create.

Measured on a local NTFS disk with the default interval:

| Rename made after the save | Missed |
| --- | --- |
| 0 or 250 ms | 10 times out of 10 |
| 500 ms | 9 times out of 10 |
| 1 or 1.5 seconds | 2 times out of 10 |
| 1.9 seconds or more | Never |

The native watcher (`pollingIntervalInMilliseconds` set to `0`, local disks only, see above) caught every rename made 250 ms after the save, but missed 4 out of 5 made straight after it, as a script would.

A save like that made while Obsidian was closed is caught at the next start: the plugin saves each note's modification time and size with its inode, and looks at the note on disk again when either has changed. A tool that swaps in a copy with the same size and keeps the old modification time, as a sync tool can, still goes unseen, and the next rename of that note made outside Obsidian is missed until the note is changed again with Obsidian open.
