# External Rename Handler

This is a plugin for [Obsidian](https://obsidian.md/) that handles renames in the vault made outside of Obsidian app.

By default, Obsidian does not handle renames made outside of the app. It treats them as pair of `create`/`delete` events.

This plugin handles renames made outside of Obsidian app by treating them as a single `rename` event.

> [!WARNING]
>
> The plugin works only if Obsidian is running during the external renames.
>
> The plugin only handles renames for those files/folders that Obsidian tracks.
>
> The plugin only handles renames made inside the vault.
>
> The plugin doesn't handle the renames made outside of the vault even if the renamed files are referenced within the vault.
>
> The plugin doesn't handle the renames in files/folders that start with `.` (dot).

## Installation

- `External Rename Handler` is available on [the official Community Plugins repository](https://obsidian.md/plugins?id=external-rename-handler).
- Beta releases can be installed through [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command:

```js
window.DEBUG.enable('external-rename-handler');
```

For more details, refer to the [documentation](https://github.com/mnaoumov/obsidian-dev-utils?tab=readme-ov-file#debugging).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)
