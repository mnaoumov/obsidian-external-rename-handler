import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { FSWatcher } from 'chokidar';
import type { EventName } from 'chokidar/handler.js';
import type {
  App,
  FileSystemAdapter
} from 'obsidian';

import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { LayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';
import { printError } from '@mnaoumov/typescript-lib/error';
import { normalizeOptionalProperties } from '@mnaoumov/typescript-lib/object-utils';
import { toPosixPath } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { getDataAdapterEx } from '@obsidian-typings/obsidian-public-latest/implementations';
import { watch } from 'chokidar';
import { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { normalizePath } from 'obsidian';

import type { OnFileChangeFunction } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { isDotFile } from './dot-file.ts';
import { FileSystemAdapterOnFileChangePatchComponent } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import { PathInoMap } from './path-ino-map.ts';

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

interface ExternalRenameHandlerComponentHandleWatcherEventParams {
  readonly event: EventName;
  readonly path: string;
  readonly stats?: Stats;
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

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Preparing files ${iterationString} - ${item.path}`,
      items: this.app.vault.getAllLoadedFiles(),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (file) => {
        if (cachedPaths.delete(file.path) || isDotFile(file.path)) {
          return;
        }
        // `getFullPath`, never `getFullRealPath`: `file.path` is normalized (NFC), and only `getFullPath` maps it back to
        // the real on-disk name. A decomposed (NFD) name would otherwise point at a file that does not exist.
        const stats = await stat(this.fileSystemAdapter.getFullPath(file.path));
        this.pathInoMap.set({ ino: stats.ino, path: file.path });
      },
      progressBarTitle: 'External Rename Handler: Initializing...',
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
        progressBarTitle: 'External Rename Handler: Cleanup...',
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
  }

  private handleDeletion(params: ExternalRenameHandlerComponentHandleDeletionParams): void {
    const { ino, path, realPath } = params;
    if (this.pathInoMap.getPath(ino) !== path) {
      return;
    }
    this.pathInoMap.deletePath(path);
    this.originalOnFileChange(realPath);
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
    const path = normalizePath(realPath) || '/';

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
        const oldPath = this.pathInoMap.getPath(stats.ino);

        if (oldPath === path) {
          return;
        }

        const isRename = oldPath !== undefined;
        this.pathInoMap.set({ ino: stats.ino, path });

        if (isRename) {
          this.pathInoMap.deletePath(oldPath);

          const fileEntry = this.fileSystemAdapter.files[oldPath];
          if (fileEntry) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete file entry.
            delete this.fileSystemAdapter.files[oldPath];
            fileEntry.realpath = realPath;
            this.fileSystemAdapter.files[path] = fileEntry;
            this.app.vault.onChange('renamed', path, oldPath);

            this.originalOnFileChange(oldPath);
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

    this.watcher = watch('.', {
      atomic: true,
      binaryInterval: this.pluginSettingsComponent.settings.pollingIntervalInMilliseconds,
      cwd: adapter.basePath,
      ignored: isDotFile,
      ignoreInitial: true,
      interval: this.pluginSettingsComponent.settings.pollingIntervalInMilliseconds,
      persistent: false,
      usePolling: this.pluginSettingsComponent.settings.pollingIntervalInMilliseconds > 0
    });

    this.watcher.on('error', this.handleWatcherError.bind(this));
    this.watcher.on('all', (event: EventName, path: string, stats?: Stats) => {
      this.handleWatcherEvent(normalizeOptionalProperties<ExternalRenameHandlerComponentHandleWatcherEventParams>({ event, path, stats }));
    });
  }
}
