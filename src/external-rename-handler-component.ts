import type { FSWatcher } from 'chokidar';
import type { EventName } from 'chokidar/handler.js';
import type {
  App,
  FileSystemAdapter
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

import { getDataAdapterEx } from '@obsidian-typings/obsidian-public-latest/implementations';
import { watch } from 'chokidar';
// eslint-disable-next-line import-x/no-nodejs-modules -- It's a desktop-only plugin.
import { Stats } from 'node:fs';
// eslint-disable-next-line import-x/no-nodejs-modules -- It's a desktop-only plugin.
import { stat } from 'node:fs/promises';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { printError } from 'obsidian-dev-utils/error';
import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';
import { LayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { toPosixPath } from 'obsidian-dev-utils/path';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { OnFileChangeFn } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { isDotFile } from './dot-file.ts';
import { FileSystemAdapterOnFileChangePatchComponent } from './patches/file-system-adapter-on-file-change-patch-component.ts';
import { PathInoMap } from './path-ino-map.ts';

interface ExternalRenameHandlerComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly fileSystemAdapter: FileSystemAdapter;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class ExternalRenameHandlerComponent extends LayoutReadyComponent {
  protected get originalOnFileChange(): OnFileChangeFn {
    return ensureNonNullable(this._originalOnFileChange);
  }

  private _originalOnFileChange?: OnFileChangeFn;
  private readonly abortSignalComponent: AbortSignalComponent;

  private readonly fileSystemAdapter: FileSystemAdapter;

  private pathInoMap = new PathInoMap();

  private readonly pluginSettingsComponent: PluginSettingsComponent;

  private watcher: FSWatcher | null = null;

  public constructor(params: ExternalRenameHandlerComponentConstructorParams) {
    super(params.app);
    this.abortSignalComponent = params.abortSignalComponent;
    this.fileSystemAdapter = params.fileSystemAdapter;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  protected override async onLayoutReady(): Promise<void> {
    this.pathInoMap = new PathInoMap();
    await this.pathInoMap.init(this.app);
    const rootIno = this.pathInoMap.getIno('/');
    const rootStats = await stat(this.fileSystemAdapter.basePath);
    if (rootIno !== rootStats.ino) {
      this.pathInoMap.clear();
    }

    const cachedPaths = new Set<string>(this.pathInoMap.getPaths());

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (file, iterationStr) => `Preparing files ${iterationStr} - ${file.path}`,
      items: this.app.vault.getAllLoadedFiles(),
      processItem: async (file) => {
        if (cachedPaths.delete(file.path)) {
          return;
        }
        if (isDotFile(file.path)) {
          return;
        }
        const stats = await stat(this.fileSystemAdapter.getFullRealPath(file.path));
        this.pathInoMap.set(file.path, stats.ino);
      },
      progressBarTitle: 'External Rename Handler: Initializing...',
      shouldShowProgressBar: true
    });

    if (cachedPaths.size > 0) {
      await loop({
        abortSignal: this.abortSignalComponent.abortSignal,
        buildNoticeMessage: (path, iterationStr) => `Cleaning paths ${iterationStr} - ${path}`,
        items: Array.from(cachedPaths),
        processItem: (path) => {
          this.pathInoMap.deletePath(path);
        },
        progressBarTitle: 'External Rename Handler: Cleanup...',
        shouldShowProgressBar: true
      });
    }

    const patch = this.addChild(new FileSystemAdapterOnFileChangePatchComponent(this.fileSystemAdapter));
    this._originalOnFileChange = patch.originalOnFileChange;

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

  private handleDeletion(ino: number, path: string): void {
    if (this.pathInoMap.getPath(ino) !== path) {
      return;
    }
    this.pathInoMap.deletePath(path);
    this.originalOnFileChange(path);
  }

  private handleWatcherError(error: unknown): void {
    printError(new Error('File system watcher error', { cause: error }));
    this.originalOnFileChange('/');
  }

  private handleWatcherEvent(event: EventName, path: string, stats?: Stats): void {
    path = toPosixPath(path) || '/';

    if (isDotFile(path)) {
      this.originalOnFileChange(path);
      return;
    }

    switch (event) {
      case 'add':
      case 'addDir': {
        if (path === '/') {
          return;
        }
        if (!stats) {
          this.originalOnFileChange(path);
          return;
        }
        const oldPath = this.pathInoMap.getPath(stats.ino);

        if (oldPath === path) {
          return;
        }

        const isRename = oldPath !== undefined;
        this.pathInoMap.set(path, stats.ino);

        if (isRename) {
          this.pathInoMap.deletePath(oldPath);

          const fileEntry = this.fileSystemAdapter.files[oldPath];
          if (fileEntry) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete file entry.
            delete this.fileSystemAdapter.files[oldPath];
            fileEntry.realpath = this.fileSystemAdapter.getRealPath(path);
            this.fileSystemAdapter.files[path] = fileEntry;
            this.app.vault.onChange('renamed', path, oldPath);

            this.originalOnFileChange(oldPath);
          }
        }

        this.originalOnFileChange(path);

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
            this.handleDeletion(ino, path);
          }, this.pluginSettingsComponent.settings.deletionRenameDetectionTimeoutInMilliseconds);
        } else {
          this.handleDeletion(ino, path);
        }
        break;
      }
      default:
        this.originalOnFileChange(path);
        break;
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
    this.watcher.on('all', this.handleWatcherEvent.bind(this));
  }
}
