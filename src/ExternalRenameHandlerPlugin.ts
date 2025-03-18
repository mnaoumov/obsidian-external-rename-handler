import { around } from 'monkey-around';
import {
  FileSystemAdapter,
  PluginSettingTab
} from 'obsidian';
import { noop } from 'obsidian-dev-utils/Function';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { registerRenameDeleteHandlers } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import {
  relative,
  toPosixPath
} from 'obsidian-dev-utils/Path';
import Watcher from 'watcher';

import { ExternalRenameHandlerPluginSettings } from './ExternalRenameHandlerPluginSettings.ts';
import { ExternalRenameHandlerPluginSettingsTab } from './ExternalRenameHandlerPluginSettingsTab.ts';

type OnFileChangeFn = FileSystemAdapter['onFileChange'];

export class ExternalRenameHandlerPlugin extends PluginBase<ExternalRenameHandlerPluginSettings> {
  private fileSystemAdapter!: FileSystemAdapter;
  private originalOnFileChange!: OnFileChangeFn;
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

  protected override onLayoutReady(): void {
    this.register(around(this.fileSystemAdapter, {
      onFileChange: (next: OnFileChangeFn): OnFileChangeFn => {
        this.originalOnFileChange = next.bind(this.fileSystemAdapter);
        return noop;
      }
    }));

    this.registerWatcher();
  }

  private getVaultPath(path: string): string {
    return relative(toPosixPath(this.app.vault.adapter.basePath), toPosixPath(path)) || '/';
  }

  private handleWatcherError(): void {
    this.originalOnFileChange('/');
  }

  private handleWatcherEvent(event: string, targetPath: string, targetPathNext: string): void {
    switch (event) {
      case 'rename':
      case 'renameDir': {
        const oldPath = this.getVaultPath(targetPath);
        const newPath = this.getVaultPath(targetPathNext);

        if (this.isDotFile(oldPath) || this.isDotFile(newPath)) {
          this.originalOnFileChange(oldPath);
          this.originalOnFileChange(newPath);
          return;
        }

        if (!Object.hasOwn(this.app.vault.fileMap, oldPath)) {
          return;
        }

        this.app.vault.onChange('renamed', newPath, oldPath);
        return;
      }
      default:
        this.originalOnFileChange(this.getVaultPath(targetPath));
    }
  }

  private isDotFile(path: string): boolean {
    return path.split('/').some((part) => part.startsWith('.'));
  }

  private registerWatcher(): void {
    const watcher = new Watcher(this.app.vault.adapter.basePath, {
      ignoreInitial: true,
      native: false,
      recursive: true,
      renameDetection: true
    });

    watcher.on('error', this.handleWatcherError.bind(this));
    watcher.on('all', this.handleWatcherEvent.bind(this));

    this.register(() => watcher.close());
  }
}
