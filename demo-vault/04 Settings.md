# Settings

Open **Settings -> Community plugins -> External Rename Handler** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Detection tuning

- `pollingIntervalInMilliseconds`
  - polling is an additional mechanism to detect file changes. A lower value reacts faster but uses more CPU; a higher value is lighter but may delay detecting missed changes. Use `0` to disable polling.
- `deletionRenameDetectionTimeoutInMilliseconds`
  - the timeout used to tell a genuine deletion apart from the delete half of a rename. Renames usually arrive as a create/delete pair that needs no timeout, but in rare cases the events arrive in reverse (delete then create), and this timeout gives the create time to show up. Use `0` to disable this timeout.

Worth seeing rather than reading: raise the polling interval, then rename the note from [01 External renames](<./01 External renames.md>) and watch how long Obsidian takes to notice.

```code-button
---
caption: Poll lazily, once every ten seconds
---
await require('/demoSetup.ts').changeSettings(app, { pollingIntervalInMilliseconds: 10000 });
```

```code-button
---
caption: Poll every two seconds again (the default)
---
await require('/demoSetup.ts').changeSettings(app, { pollingIntervalInMilliseconds: 2000 });
```

Manual equivalent: change **Polling interval in milliseconds** above.

## Link updates moved to another plugin

Up to version 3 this plugin rewrote the links itself, through a copy of a rename/delete handler that four other plugins also bundled - so which copy actually ran depended on Obsidian's load order. Since **4.0.0** it does not: rename and delete handling is owned by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler), a separate plugin, so a vault has exactly one of them.

Nothing here replaces it. Install that plugin and its settings tab holds every rename and delete option, including the toggle that used to live on this page as `shouldUpdateLinks`. Decline, and this plugin still detects external renames - the file keeps its identity and Obsidian stops seeing a stranger - but nothing rewrites the notes that pointed at the old name.

Two keys are left behind to make the handover work. Neither is a toggle you set - they are bookkeeping, shown here because they are in your `data.json`:

- `isAdvancedRenameAndDeleteHandlerSuggestionDeclined`
  - whether you have already answered "not now" to the suggestion notice. It silences the notice, not the banner at the top of this tab: opening these settings is a fresher signal than an answer you gave earlier.
- `proposedShouldHandleRenames`
  - the `shouldUpdateLinks` value you had before the upgrade, held until it can be offered to Advanced Rename and Delete Handler as its `shouldHandleRenames`. It is `null` once that offer has been accepted, and on a fresh install that never had the old setting. Cancelling the offer leaves it here, so it comes back next time.
