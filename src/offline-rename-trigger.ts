import type { SyncPluginInstance } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  EventRef,
  TAbstractFile
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';

/**
 * Fires the vault `rename` event for a rename made while Obsidian was closed.
 *
 * Every listener gets it, except the core Sync plugin's when Sync no longer tracks `oldPath`. Sync's startup scan has
 * then already reconciled the rename as a delete plus a create: it added the new path and dropped the old one. Its
 * `rename` listener reads the old path's entry with no guard, so it would write `undefined` over the new path's entry and
 * throw. The skipped listener misses nothing, since Sync has already applied the change.
 *
 * The other listeners are called the way `Events.trigger` calls them, in their order, through `tryTrigger`, so one that
 * throws cannot stop the rest.
 *
 * @param app - The Obsidian app.
 * @param file - The file, already at its new path.
 * @param oldPath - The path the file had before the rename.
 */
export function triggerOfflineRename(app: App, file: TAbstractFile, oldPath: string): void {
  const syncInstance = getSyncUnawareOfOldPath(app, oldPath);
  if (!syncInstance) {
    app.vault.trigger('rename', file, oldPath);
    return;
  }

  const entries = [...(app.vault._['rename'] ?? [])];
  for (const entry of entries) {
    if (entry.fn === syncInstance.boundOnFileRename) {
      continue;
    }
    app.vault.tryTrigger(castTo<EventRef>(entry), [file, oldPath]);
  }
}

function getSyncUnawareOfOldPath(app: App, oldPath: string): null | SyncPluginInstance {
  const syncInstance = app.internalPlugins.getEnabledPluginById('sync');
  return syncInstance && !Object.hasOwn(syncInstance.localFiles, oldPath) ? syncInstance : null;
}
