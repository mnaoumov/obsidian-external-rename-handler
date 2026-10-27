# External Rename Handler

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-external-rename-handler)](https://github.com/mnaoumov/obsidian-external-rename-handler/releases) [![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-external-rename-handler/total)](https://github.com/mnaoumov/obsidian-external-rename-handler/releases) [![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-external-rename-handler)

Rename a note inside [Obsidian](https://obsidian.md/) and every link to it is updated. Rename the same file in your file manager, from a script, or through a sync client, and Obsidian sees a delete followed by a create — so the links are not updated, and every note that pointed at it is left pointing at nothing.

This plugin recognizes those external renames for what they are and reports them to Obsidian as a single rename, so the file keeps its identity instead of arriving as a stranger. Rewriting the links that pointed at the old name is then done by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler) — see [Renames](#renames) below.

> [!WARNING]
>
> A rename is recognized only where the file keeps its identity on disk (its inode), and not every file system keeps it: see [05 File systems](<./demo-vault/05 File systems.md>).
>
> Only files and folders inside the vault that Obsidian tracks are handled, and never those whose names start with `.` (dot). See [03 How it works](<./demo-vault/03 How it works.md#limitations-be-honest-with-yourself>) for every limit.

<!-- markdownlint-disable MD033 -->

<a href="https://github.com/mnaoumov/obsidian-external-rename-handler/blob/HEAD/images/screenshots/screenshot-desktop-1.png"><img src="images/screenshots/screenshot-desktop-1.png" alt="A note open in Obsidian, named Chapter one" width="600"></a>

<details>
<summary>More screenshots</summary>

<a href="https://github.com/mnaoumov/obsidian-external-rename-handler/blob/HEAD/images/screenshots/screenshot-desktop-2.png"><img src="images/screenshots/screenshot-desktop-2.png" alt="Renamed in your file manager — the open note followed it" width="600"></a>

</details>

<!-- markdownlint-enable MD033 -->

## Demo vault

**The documentation is a demo vault.** Every feature has a note that explains what it does and why you would want it, with a note ready to rename and backlinks ready to watch.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **`External Rename Handler`: Open demo vault** command.
2. Downloading `external-rename-handler-demo-vault.zip` from the [Releases](https://github.com/mnaoumov/obsidian-external-rename-handler/releases). It unzips into a single `external-rename-handler-demo-vault-<version>` folder.
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **A rename made outside Obsidian is recognized as a rename**, instead of arriving as an unrelated delete and create. [01 External renames](<./demo-vault/01 External renames.md>)
- **A rename made while Obsidian was closed** is recognized when Obsidian starts again. [03 How it works](<./demo-vault/03 How it works.md#renames-made-while-obsidian-was-closed>)
- **Moving a file, and moving whole folders**, are handled the same way. [02 Moving and folders](<./demo-vault/02 Moving and folders.md>)
- **How the detection works**, and therefore where its limits are — worth reading before trusting it with anything irreversible. [03 How it works](<./demo-vault/03 How it works.md>)
- **Which file systems it works on**, each one measured. [05 File systems](<./demo-vault/05 File systems.md>)
- **Every setting**, by the key it is stored under. [04 Settings](<./demo-vault/04 Settings.md>)

## Renames

Since **4.0.0** this plugin no longer rewrites links itself: [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler) owns rename and delete handling for the whole vault. This plugin sees the rename your file manager made, that one updates the notes pointing at the old name. This plugin offers to install it, once, and carries your old `Should update links` value over for you to approve. Decline, and external renames are still detected — the file keeps its identity, its open tab and the file explorer follow it — but the links are left as they were.

## See also

[My other Obsidian resources](https://github.com/mnaoumov/obsidian-resources)

| Plugin | Features | How `External Rename Handler` differs |
| --- | --- | --- |
| [`Auto Refresh Explorer`](https://community.obsidian.md/plugins/auto-refresh-explorer) | Polls selected folders; adds externally created files | Different event scope: recognizes external renames |
| [`Link Keeper`](https://github.com/RyotaUshio/obsidian-link-keeper) | Unlisted/experimental; pairs create/delete within 0.5 seconds by name/folder; updates links; mobile | Alternative detection: inodes; catches offline renames too; delegates link updates |
| [`Vault File Refresh`](https://community.obsidian.md/plugins/vault-file-refresh) | Polls for externally added/changed files; Flatpak/network-drive use | Different event scope: recognizes external renames |

Last searched for similar plugins on 2026-10-26.

## Installation

The plugin is available in [the official Community Plugins repository](https://community.obsidian.md/plugins/external-rename-handler).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-external-rename-handler).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin (id: `external-rename-handler`) are hidden.

If you need to enable them refer to the [documentation](https://mnaoumov.dev/obsidian-lib/guides/debugging/).

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## License

© [Michael Naumov](https://github.com/mnaoumov/)
