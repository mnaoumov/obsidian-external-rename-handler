# External Rename Handler

This is a plugin for [Obsidian](https://obsidian.md/) that handles renames made outside of Obsidian.

By default, Obsidian will not handle renames made outside of Obsidian. It treats them as pair of `create`/`delete` events.

This plugin handles renames made outside of Obsidian by treating them as a single `rename` event.

For this functionality to work, Obsidian has to be running during the external renames.

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
