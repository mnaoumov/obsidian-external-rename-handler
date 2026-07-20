# External Rename Handler demo vault

A small Obsidian vault that demonstrates the [External Rename Handler](https://github.com/mnaoumov/obsidian-external-rename-handler) plugin - it watches the vault while Obsidian is running, recognizes files that were renamed or moved *outside* the app as real renames, and lets Obsidian update the links instead of breaking them.

Open [00 Start](<./00 Start.md>) and work through the notes. Keep Obsidian open, rename [Rename me externally](<./Rename me externally.md>) from your OS file manager or terminal, and watch the links in `References/` follow it.

## First open

The first time you open this vault, Obsidian treats it as **untrusted**, so the bundled plugins are listed but not loaded until you **Trust author and enable plugins** and reload. After that, the Demo Vault Helper installs [CodeScript Toolkit](https://github.com/mnaoumov/obsidian-codescript-toolkit) (which powers the optional **Run** buttons in the setup notes) and opens the start note for you.
