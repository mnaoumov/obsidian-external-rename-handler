# Settings

Open **Settings -> Community plugins -> `External Rename Handler`** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Detection tuning

- `pollingMode`
  - whether the vault is polled besides the native file system watcher: `auto` (the default), `always` or `never`. `auto` polls only where the native watcher reports nothing at all, such as a network share or a folder opened through `\\wsl.localhost`. On a local disk the native watcher saw every external change measured, bursts of thousands included, so polling there buys nothing and costs CPU. Before the first watcher starts, the plugin creates a file in a temporary folder inside the vault's config folder (`.obsidian`) and waits up to 3 seconds for the native watcher to report it. `always` polls on a local disk too, and `never` relies on the native watcher alone. A drive that never changes a folder's modification time, such as FAT32 or exFAT under Windows, is not polled in any mode, because polling would see no new file there; see [05 File systems](<./05 File systems.md>).
- `pollingIntervalInMilliseconds`
  - how often a poll runs, when the vault is polled. Each poll reads the file system entry of every file and folder in the vault, on Obsidian's main thread, and the settings tab shows how many that is now. On a vault of 71,000 files a 20-second interval cost about half a CPU core while idle. A lower value reacts faster but uses more CPU; a higher value is lighter but may delay detecting a change. Before `pollingMode` existed, `0` turned polling off; such a stored `0` is read as `pollingMode` `never`.
- `deletionRenameDetectionTimeoutInMilliseconds`
  - the timeout used to tell a genuine deletion apart from the delete half of a rename. Renames usually arrive as a create/delete pair that needs no timeout, but in rare cases the events arrive in reverse (delete then create), and this timeout gives the create time to show up. Use `0` to disable this timeout.
- `shouldDetectOfflineRenames`
  - whether a file renamed or moved while Obsidian was closed is reported as a rename when Obsidian starts. On by default. See [03 How it works](<./03 How it works.md>) for what counts as such a rename.

Worth seeing rather than reading: force polling with a long interval (the native watcher is then not used), rename the note from [01 External renames](<./01 External renames.md>) and watch how long Obsidian takes to notice. Then go back to the default and rename it again: the native watcher reports it at once.

```code-button
---
caption: Always poll, lazily, once every ten seconds
---
await require('/demoSetup.ts').changeSettings(app, { pollingIntervalInMilliseconds: 10000, pollingMode: 'always' });
```

```code-button
---
caption: Back to the default (poll automatically, every two seconds where needed)
---
await require('/demoSetup.ts').changeSettings(app, { pollingIntervalInMilliseconds: 2000, pollingMode: 'auto' });
```

Manual equivalent: change **Polling** and **Polling interval in milliseconds** above.

## Link updates moved to another plugin

Up to version 3 this plugin rewrote the links itself, through a copy of a rename/delete handler that four other plugins also bundled - so which copy actually ran depended on Obsidian's load order. Since **4.0.0** it does not: rename and delete handling is owned by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler), a separate plugin, so a vault has exactly one of them.

Nothing here replaces it. Install that plugin and its settings tab holds every rename and delete option, including the toggle that used to live on this page as `shouldUpdateLinks`. Decline, and this plugin still detects external renames - the file keeps its identity and Obsidian stops seeing a stranger - but nothing rewrites the notes that pointed at the old name.

Two keys are left behind to make the handover work. Neither is a toggle you set - they are bookkeeping, shown here because they are in your `data.json`:

- `isAdvancedRenameAndDeleteHandlerSuggestionDeclined`
  - whether you have already answered "not now" to the suggestion notice. It silences the notice, not the banner at the top of this tab: opening these settings is a fresher signal than an answer you gave earlier.
- `proposedShouldHandleRenames`
  - the `shouldUpdateLinks` value you had before the upgrade, held until it can be offered to `Advanced Rename and Delete Handler` as its `shouldHandleRenames`. It is `null` once that offer has been accepted, and on a fresh install that never had the old setting. Cancelling the offer leaves it here, so it comes back next time.
