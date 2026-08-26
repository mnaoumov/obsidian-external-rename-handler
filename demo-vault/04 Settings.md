# Settings

Open **Settings -> Community plugins -> External Rename Handler** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Link updates

- `shouldUpdateLinks`
  - whether to trigger a link update when a file is renamed externally. When enabled, links pointing at the old path are rewritten to the new one; when disabled, the rename is still recognized but links are left untouched.

Worth seeing rather than reading: turn it off, rename the note from [01 External renames](<./01 External renames.md>), and watch the links stay pointing at the old name - the rename is still detected, only the rewriting is skipped.

```code-button
---
caption: Detect renames but leave links alone
---
await require('/demoSetup.ts').changeSettings(app, { shouldUpdateLinks: false });
```

```code-button
---
caption: Update links again (the default)
---
await require('/demoSetup.ts').changeSettings(app, { shouldUpdateLinks: true });
```

Manual equivalent: toggle **Should update links** above.

## Detection tuning

- `pollingIntervalInMilliseconds`
  - polling is an additional mechanism to detect file changes. A lower value reacts faster but uses more CPU; a higher value is lighter but may delay detecting missed changes. Use `0` to disable polling.
- `deletionRenameDetectionTimeoutInMilliseconds`
  - the timeout used to tell a genuine deletion apart from the delete half of a rename. Renames usually arrive as a create/delete pair that needs no timeout, but in rare cases the events arrive in reverse (delete then create), and this timeout gives the create time to show up. Use `0` to disable this timeout.
