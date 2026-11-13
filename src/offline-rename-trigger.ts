import type {
  App,
  EventRef,
  TAbstractFile
} from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';

// The two members of the core Sync plugin's instance the replay needs. `obsidian-typings` declares neither.
interface SyncRenameState {
  readonly boundOnFileRename?: unknown;
  readonly localFiles?: Readonly<Record<string, unknown>>;
}

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
  const skippedListener = getStaleSyncRenameListener(app, oldPath);
  if (!skippedListener) {
    app.vault.trigger('rename', file, oldPath);
    return;
  }

  const entries = [...(app.vault._['rename'] ?? [])];
  for (const entry of entries) {
    if (entry.fn === skippedListener) {
      continue;
    }
    app.vault.tryTrigger(castTo<EventRef>(entry), [file, oldPath]);
  }
}

function getStaleSyncRenameListener(app: App, oldPath: string): unknown {
  const syncInstance = castTo<null | SyncRenameState>(app.internalPlugins.getEnabledPluginById('sync'));
  const localFiles = syncInstance?.localFiles;
  const listener = syncInstance?.boundOnFileRename;
  const isOldPathUnknownToSync = localFiles !== undefined && typeof listener === 'function' && !Object.hasOwn(localFiles, oldPath);
  return isOldPathUnknownToSync ? listener : null;
}
