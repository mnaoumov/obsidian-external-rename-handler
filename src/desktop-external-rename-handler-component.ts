import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  FSWatcher,
  FSWatcherEventMap
} from 'chokidar';
import type {
  BigIntStats,
  Stats
} from 'node:fs';
import type {
  App,
  FileSystemAdapter,
  TAbstractFile
} from 'obsidian';

import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { LayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import { ensureMetadataCacheReady } from '@mnaoumov/obsidian-lib/metadata-cache';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';
import { printError } from '@mnaoumov/typescript-lib/error';
import { normalizeOptionalProperties } from '@mnaoumov/typescript-lib/object-utils';
import { toPosixPath } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { getDataAdapterEx } from '@obsidian-typings/obsidian-public-latest/implementations';
import { stat } from 'node:fs/promises';
import {
  isAbsolute,
  relative,
  sep
} from 'node:path';
import { normalizePath } from 'obsidian';

import type { OnFileChangeFunction } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { watch } from './desktop-chokidar-watch.ts';
import { isDotFile } from './dot-file.ts';
import { FileSystemAdapterOnFileChangePatchComponent } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import { PathInoMap } from './path-ino-map.ts';

// `chokidar` 6 no longer exports `EventName` from any public entry point.
type EventName = FSWatcherEventMap['all'][0];

interface ExternalRenameHandlerComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly fileSystemAdapter: FileSystemAdapter;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface ExternalRenameHandlerComponentHandleDeletionParams {
  readonly ino: number;
  readonly path: string;
  readonly realPath: string;
}

interface ExternalRenameHandlerComponentHandleRenameParams {
  readonly oldPath: string;
  readonly path: string;
  readonly realPath: string;
}

interface ExternalRenameHandlerComponentHandleWatcherEventParams {
  readonly event: EventName;
  readonly path: string;
  // `chokidar` 6 declares `Stats`, but on Windows an `add` from a directory scan carries `BigIntStats`, on either backend.
  readonly stats?: BigIntStats | Stats;
}

interface OfflineRename {
  readonly file: TAbstractFile;
  readonly newPath: string;
  readonly oldPath: string;
}

export class ExternalRenameHandlerComponent extends LayoutReadyComponent {
  private _originalOnFileChange?: OnFileChangeFunction;

  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly fileSystemAdapter: FileSystemAdapter;

  private pathInoMap = new PathInoMap();

  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  private watcher: FSWatcher | null = null;

  private get originalOnFileChange(): OnFileChangeFunction {
    return ensureNonNullable(this._originalOnFileChange);
  }

  public constructor(params: ExternalRenameHandlerComponentConstructorParams) {
    super(params.app);
    this.abortSignalComponent = params.abortSignalComponent;
    this.fileSystemAdapter = params.fileSystemAdapter;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  protected override async onLayoutReady(): Promise<void> {
    // A reload of this component registers a second `onLayoutReady` callback, so this method can run again over a map
    // that already owns an open IndexedDB connection and an armed debounced flush. Dispose the outgoing one before
    // replacing it, and hand the incoming one to the component's own teardown, or the orphan keeps its connection open
    // and fires its flush into a database nobody owns any more.
    this.pathInoMap[Symbol.dispose]();
    this.pathInoMap = this.registerDisposable(new PathInoMap());
    await this.pathInoMap.init(this.app);
    const rootIno = this.pathInoMap.getIno('/');
    const rootStats = await stat(this.fileSystemAdapter.basePath);
    if (rootIno !== rootStats.ino) {
      this.pathInoMap.clear();
    }

    const cachedPaths = new Set<string>(this.pathInoMap.getPaths());
    const offlineRenames: OfflineRename[] = [];

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Preparing files ${iterationString} - ${item.path}`,
      items: this.app.vault.getAllLoadedFiles(),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (file) => {
        const isCached = cachedPaths.delete(file.path);
        if (isDotFile(file.path)) {
          return;
        }
        // A path recorded before birth times were persisted is stat-ed once more, so that a later offline rename of
        // it can be vouched for.
        if (isCached && this.pathInoMap.getBirthtime(file.path) !== undefined) {
          return;
        }
        // `getFullPath`, never `getFullRealPath`: `file.path` is normalized (NFC), and only `getFullPath` maps it back to
        // the real on-disk name. A decomposed (NFD) name would otherwise point at a file that does not exist.
        const stats = await stat(this.fileSystemAdapter.getFullPath(file.path));
        if (!isCached) {
          const oldPath = this.getOfflineRenameOldPath(file.path, stats);
          if (oldPath !== null) {
            offlineRenames.push({ file, newPath: file.path, oldPath });
          }
        }
        this.pathInoMap.set({ birthtimeMs: toBirthtimeMs(stats), ino: stats.ino, path: file.path });
      },
      progressBarTitle: 'Initializing...',
      shouldShowProgressBar: true
    });

    if (cachedPaths.size > 0) {
      await loop({
        abortSignal: this.abortSignalComponent.abortSignal,
        buildNoticeMessage: ({ item, iterationString }) => `Cleaning paths ${iterationString} - ${item}`,
        items: [...cachedPaths],
        pluginNoticeComponent: this.pluginNoticeComponent,
        processItem: (path) => {
          this.pathInoMap.deletePath(path);
        },
        progressBarTitle: 'Cleanup...',
        shouldShowProgressBar: true
      });
    }

    const patch = this.addChild(new FileSystemAdapterOnFileChangePatchComponent(this.fileSystemAdapter));
    this._originalOnFileChange = patch.originalOnFileChange;

    // The patch above suppresses Obsidian's own file-change notifications, so the watcher registered here is the only thing left that
    // reaches the UI. The settings are already loaded by the time the layout is ready, which means the `loadSettings` handler below has
    // missed its event and can no longer be relied on to start the watcher.
    await this.registerWatcher();

    registerAsyncEvent(
      this,
      this.pluginSettingsComponent.on('loadSettings', async () => {
        await this.registerWatcher();
      })
    );

    registerAsyncEvent(
      this,
      this.pluginSettingsComponent.on('saveSettings', async () => {
        await this.registerWatcher();
      })
    );

    await this.reportOfflineRenames(offlineRenames);
  }

  /**
   * Finds the path a file had before it was renamed or moved while Obsidian was closed.
   *
   * Obsidian builds its vault from the disk at startup, so such a file simply exists at its new path, and the links to
   * its old path are left unresolved. Its inode is what still ties the two paths together.
   *
   * @param path - The path of a file the map did not know.
   * @param stats - The stats of that file.
   * @returns The old path, or `null` when the file is not a clean offline rename.
   */
  private getOfflineRenameOldPath(path: string, stats: Stats): null | string {
    const oldPath = this.pathInoMap.getPath(stats.ino);
    if (oldPath === undefined || oldPath === path) {
      return null;
    }

    // The old path still taken means a hard link, or a new file created where the renamed one used to be. Either way
    // the links to the old path still resolve, and there is nothing to report.
    if (this.app.vault.getAbstractFileByPath(oldPath)) {
      return null;
    }

    // A different birth time means the file system handed a freed inode to an unrelated new file, as ext4 readily does.
    // An entry written before birth times were persisted cannot vouch for anything.
    return this.pathInoMap.getBirthtime(oldPath) === toBirthtimeMs(stats) ? oldPath : null;
  }

  private handleDeletion(params: ExternalRenameHandlerComponentHandleDeletionParams): void {
    const { ino, path, realPath } = params;
    if (this.pathInoMap.getPath(ino) !== path) {
      return;
    }
    this.pathInoMap.deletePath(path);
    this.originalOnFileChange(realPath);
  }

  private handleRename(params: ExternalRenameHandlerComponentHandleRenameParams): void {
    const { oldPath, path, realPath } = params;
    const fileEntry = this.fileSystemAdapter.files[oldPath];
    if (!fileEntry) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete file entry.
    delete this.fileSystemAdapter.files[oldPath];
    fileEntry.realpath = realPath;
    this.fileSystemAdapter.files[path] = fileEntry;
    this.app.vault.onChange('renamed', path, oldPath);

    this.originalOnFileChange(oldPath);
  }

  private handleWatcherError(error: unknown): void {
    printError(new Error('File system watcher error', { cause: error }));
    this.originalOnFileChange('/');
  }

  private handleWatcherEvent(params: ExternalRenameHandlerComponentHandleWatcherEventParams): void {
    const { event, stats } = params;
    // The watcher reports the real on-disk path, which can be decomposed (NFD). The map, `adapter.files` and the vault are
    // keyed by the normalized path, as Obsidian's own indexing keys them, while the original `onFileChange` takes the real
    // one and normalizes it itself.
    const realPath = toPosixPath(params.path) || '/';
    const path = normalizePath(realPath);

    if (isDotFile(path)) {
      this.originalOnFileChange(realPath);
      return;
    }

    switch (event) {
      case 'add':
      case 'addDir': {
        if (path === '/') {
          return;
        }
        if (!stats) {
          this.originalOnFileChange(realPath);
          return;
        }
        // The map holds the plain-number inode `stat` returns, and a bigint one never equals it.
        const ino = Number(stats.ino);
        const oldPath = this.pathInoMap.getPath(ino);

        if (oldPath === path) {
          return;
        }

        const birthtimeMs = toBirthtimeMs(stats);
        const oldBirthtimeMs = oldPath === undefined ? undefined : this.pathInoMap.getBirthtime(oldPath);
        // A different birth time means the file system handed the inode of a file deleted moments ago to an unrelated new
        // one, as ext4 readily does. That is a delete plus a create, and the delete is reported now, because the map no
        // longer leads the pending deletion back to the old path. Reuse within the same millisecond still passes as a
        // rename.
        const isReusedIno = oldBirthtimeMs !== undefined && oldBirthtimeMs !== birthtimeMs;
        this.pathInoMap.set({ birthtimeMs, ino, path });

        if (oldPath !== undefined) {
          this.pathInoMap.deletePath(oldPath);
          if (isReusedIno) {
            this.originalOnFileChange(oldPath);
          } else {
            this.handleRename({ oldPath, path, realPath });
          }
        }

        this.originalOnFileChange(realPath);

        break;
      }
      case 'change': {
        // A save that writes a temp file and renames it over the note gives the note a new inode, which `atomic` reports
        // as a `change`. Left stale, the old inode turns the note's next external rename into a delete plus a create.
        if (stats) {
          const ino = Number(stats.ino);
          if (this.pathInoMap.getIno(path) !== ino) {
            this.pathInoMap.set({ birthtimeMs: toBirthtimeMs(stats), ino, path });
          }
        }
        this.originalOnFileChange(realPath);
        break;
      }
      case 'unlink':
      case 'unlinkDir': {
        const ino = this.pathInoMap.getIno(path);
        if (ino === undefined) {
          return;
        }

        if (this.pluginSettingsComponent.settings.deletionRenameDetectionTimeoutInMilliseconds > 0) {
          window.setTimeout(() => {
            this.handleDeletion({ ino, path, realPath });
          }, this.pluginSettingsComponent.settings.deletionRenameDetectionTimeoutInMilliseconds);
        } else {
          this.handleDeletion({ ino, path, realPath });
        }
        break;
      }
      default: {
        this.originalOnFileChange(realPath);
        break;
      }
    }
  }

  private async registerWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    } else {
      this.register(convertAsyncToSync(async () => this.watcher?.close()));
    }

    const adapter = getDataAdapterEx(this.app);

    const { pollingIntervalInMilliseconds } = this.pluginSettingsComponent.settings;
    const isPolling = pollingIntervalInMilliseconds > 0;

    this.watcher = watch('.', {
      // `chokidar` 6 rejects a polling interval that is not positive even on a native backend, so it goes to polling alone.
      ...isPolling && {
        pollingBinaryInterval: pollingIntervalInMilliseconds,
        pollingInterval: pollingIntervalInMilliseconds
      },
      // Rename detection reads the inode off every `add`, and `chokidar` 6 passes `stats` only when its backend has them.
      alwaysStat: true,
      // `chokidar` 6 defaults `atomic` to `false` under polling, so it is set explicitly to keep both backends alike.
      atomic: true,
      // `auto` is one recursive `fs.watch` for the whole vault on Windows and macOS, and one per directory elsewhere.
      backend: isPolling ? 'polling' : 'auto',
      cwd: adapter.basePath,
      ignored: (path: string): boolean => isDotFile(toVaultPath(this.fileSystemAdapter.basePath, path)),
      ignoreInitial: true,
      persistent: false
    });

    this.watcher.on('error', this.handleWatcherError.bind(this));
    this.watcher.on('all', (event: EventName, path: string, stats?: Stats) => {
      this.handleWatcherEvent(normalizeOptionalProperties<ExternalRenameHandlerComponentHandleWatcherEventParams>({ event, path, stats }));
    });
  }

  /**
   * Reports the renames made while Obsidian was closed the way a live rename is reported: as a vault `rename` event fired
   * once the file is already at its new path, which is what the link handler, bookmarks and the recent files react to.
   *
   * It waits for the metadata cache to be clean first. Obsidian's own startup pass drops the cache entry of every path that
   * is gone, so by then nothing in the cache still describes the old path, and its `rename` handler has nothing to undo.
   *
   * @param offlineRenames - The renames found while indexing the vault.
   */
  private async reportOfflineRenames(offlineRenames: readonly OfflineRename[]): Promise<void> {
    if (offlineRenames.length === 0 || !this.pluginSettingsComponent.settings.shouldDetectOfflineRenames) {
      return;
    }

    await ensureMetadataCacheReady(this.app);
    if (this.abortSignalComponent.abortSignal.aborted) {
      return;
    }

    let reportedCount = 0;
    for (const { file, newPath, oldPath } of offlineRenames) {
      // A live change made while the cache was still being built can have moved either path on.
      if (file.path !== newPath || this.app.vault.getAbstractFileByPath(oldPath)) {
        continue;
      }
      this.app.vault.trigger('rename', file, oldPath);
      reportedCount++;
    }

    if (reportedCount > 0) {
      this.pluginNoticeComponent.showNotice(
        `Detected ${String(reportedCount)} ${reportedCount === 1 ? 'rename' : 'renames'} made while Obsidian was closed.`
      );
    }
  }
}

// Whole milliseconds, because a bigint `birthtimeMs` is truncated to them while the plain one carries a fraction, and the
// two must compare equal for the same file.
function toBirthtimeMs(stats: BigIntStats | Stats): number {
  return Math.floor(Number(stats.birthtimeMs));
}

// `chokidar` 6 hands `ignored` absolute paths, so a dot folder anywhere above the vault would hide the whole vault, and it
// also asks about the vault's own ancestors, which are outside the vault and never a dot file of it.
function toVaultPath(basePath: string, path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }
  const vaultPath = relative(basePath, path);
  return vaultPath === '..' || vaultPath.startsWith(`..${sep}`) || isAbsolute(vaultPath) ? '' : vaultPath;
}
