import type { FSWatcher } from 'chokidar';
import type { EventName } from 'chokidar/handler.js';
import type { Stats } from 'obsidian-dev-utils/ScriptUtils/NodeModules';

import { watch } from 'chokidar';
import { around } from 'monkey-around';
import {
  FileSystemAdapter,
  PluginSettingTab
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/Async';
import { printError } from 'obsidian-dev-utils/Error';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { registerRenameDeleteHandlers } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { toPosixPath } from 'obsidian-dev-utils/Path';
import { stat } from 'obsidian-dev-utils/ScriptUtils/NodeModules';

import { ExternalRenameHandlerPluginSettings } from './ExternalRenameHandlerPluginSettings.ts';
import { ExternalRenameHandlerPluginSettingsTab } from './ExternalRenameHandlerPluginSettingsTab.ts';

type OnFileChangeFn = FileSystemAdapter['onFileChange'];

export class ExternalRenameHandlerPlugin extends PluginBase<ExternalRenameHandlerPluginSettings> {
  private fileSystemAdapter!: FileSystemAdapter;
  private inoPathMap = new Map<number, string>();
  private originalOnFileChange!: OnFileChangeFn;
  private pathInoMap = new Map<string, number>();
  private watcher: FSWatcher | null = null;

  public async applyNewSettings(): Promise<void> {
    await this.registerWatcher();
  }

  public override async onExternalSettingsChange(): Promise<void> {
    await super.onExternalSettingsChange();
    await this.applyNewSettings();
  }

  public override onloadComplete(): void {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      throw new Error('Vault adapter is not a FileSystemAdapter');
    }

    this.fileSystemAdapter = this.app.vault.adapter;
    registerRenameDeleteHandlers(this, () => ({
      shouldHandleRenames: this.settings.shouldUpdateLinks,
      shouldUpdateFilenameAliases: true
    }));
  }

  protected override createPluginSettings(data: unknown): ExternalRenameHandlerPluginSettings {
    return new ExternalRenameHandlerPluginSettings(data);
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return new ExternalRenameHandlerPluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (file, iterationStr) => `Preparing files ${iterationStr} - ${file.path}`,
      items: this.app.vault.getAllLoadedFiles(),
      processItem: async (file) => {
        if (this.isDotFile(file.path)) {
          return;
        }
        const stats = await stat(this.fileSystemAdapter.getFullRealPath(file.path));
        this.pathInoMap.set(file.path, stats.ino);
        this.inoPathMap.set(stats.ino, file.path);
      }
    });

    this.register(around(this.fileSystemAdapter, {
      onFileChange: (next: OnFileChangeFn): OnFileChangeFn => {
        this.originalOnFileChange = next.bind(this.fileSystemAdapter);
        return this.onFileChange.bind(this);
      }
    }));

    await this.registerWatcher();
  }

  private handleDeletion(ino: number, path: string): void {
    if (this.inoPathMap.get(ino) !== path) {
      return;
    }
    this.inoPathMap.delete(ino);
    this.pathInoMap.delete(path);
    this.originalOnFileChange(path);
  }

  private handleWatcherError(error: unknown): void {
    printError(new Error('File system watcher error', { cause: error }));
    this.originalOnFileChange('/');
  }

  private handleWatcherEvent(event: EventName, path: string, stats?: Stats): void {
    path = toPosixPath(path) || '/';

    if (this.isDotFile(path)) {
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
        const oldPath = this.inoPathMap.get(stats.ino);

        if (oldPath === path) {
          return;
        }

        const isRename = oldPath !== undefined;
        this.inoPathMap.set(stats.ino, path);
        this.pathInoMap.set(path, stats.ino);

        if (isRename) {
          this.pathInoMap.delete(oldPath);

          const fileEntry = this.fileSystemAdapter.files[oldPath];
          if (fileEntry) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
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
        const ino = this.pathInoMap.get(path);
        if (ino === undefined) {
          return;
        }

        if (this.settings.deletionRenameDetectionTimeoutInMilliseconds > 0) {
          setTimeout(() => {
            this.handleDeletion(ino, path);
          }, this.settings.deletionRenameDetectionTimeoutInMilliseconds);
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

  private isDotFile(path: string): boolean {
    path = toPosixPath(path) || '/';
    return path.split('/').some((part) => part.startsWith('.'));
  }

  private onFileChange(path: null | string): void {
    if (path === null) {
      return;
    }
    if (this.isDotFile(path)) {
      this.originalOnFileChange(path);
    }
  }

  private async registerWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    } else {
      this.register(convertAsyncToSync(async () => this.watcher?.close()));
    }

    this.watcher = watch('.', {
      atomic: true,
      binaryInterval: this.settings.pollingIntervalInMilliseconds,
      cwd: this.app.vault.adapter.basePath,
      ignored: this.isDotFile.bind(this),
      ignoreInitial: true,
      interval: this.settings.pollingIntervalInMilliseconds,
      persistent: false,
      usePolling: this.settings.pollingIntervalInMilliseconds > 0
    });

    this.watcher.on('error', this.handleWatcherError.bind(this));
    this.watcher.on('all', this.handleWatcherEvent.bind(this));
  }
}
