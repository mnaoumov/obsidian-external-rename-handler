// eslint-disable-next-line import-x/no-nodejs-modules
import type { Stats } from 'node:fs';
import type { FileStats } from 'obsidian';
import type { FileSystemWatchHandler } from 'obsidian-typings';

import { around } from 'monkey-around';
import {
  FileSystemAdapter,
  PluginSettingTab
} from 'obsidian';
import { isFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import { EmptySettings } from 'obsidian-dev-utils/obsidian/Plugin/EmptySettings';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { join } from 'obsidian-dev-utils/Path';

interface VaultChangeEvent {
  eventType: string;
  path: string;
}

export class ExternalRenameHandlerPlugin extends PluginBase {
  private fileSystemAdapter!: FileSystemAdapter;
  private pathsToSkip = new Set<string>();
  private vaultChangeEvents: VaultChangeEvent[] = [];

  public override onloadComplete(): void {
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      throw new Error('Vault adapter is not a FileSystemAdapter');
    }

    this.fileSystemAdapter = this.app.vault.adapter;
  }

  protected override createPluginSettings(): EmptySettings {
    return new EmptySettings();
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override async onLayoutReady(): Promise<void> {
    this.register(around(this.app.vault, {
      onChange: (next): FileSystemWatchHandler => (eventType: string, path: string, oldPath?: string, stats?: FileStats) => { this.handleVaultChange(eventType, path, oldPath, stats, next); }
    }));
    await this.app.vault.load();
  }

  private existsSync(path: string): boolean {
    return this.fileSystemAdapter.fs.existsSync(this.fileSystemAdapter.getFullRealPath(path));
  }

  private handleRename(oldPath: string, newPath: string, next: FileSystemWatchHandler, isTopLevel?: boolean): void {
    this.pathsToSkip.add(oldPath);
    if (!isTopLevel) {
      this.pathsToSkip.add(newPath);
    }

    next.call(this.app.vault, 'renamed', newPath, oldPath);

    if (this.statSync(newPath).isFile()) {
      return;
    }

    for (const filename of this.readdirSync(newPath)) {
      this.handleRename(join(oldPath, filename), join(newPath, filename), next);
    }
  }

  private handleVaultChange(eventType: string, path: string, oldPath: string | undefined, stats: FileStats | undefined, next: FileSystemWatchHandler): void {
    this.vaultChangeEvents.push({ eventType, path });
    if (this.vaultChangeEvents.length > 3) {
      this.vaultChangeEvents.shift();
    }

    if (eventType !== 'raw' && this.pathsToSkip.has(path)) {
      this.pathsToSkip.delete(path);
      return;
    }

    const handleDefault = (): void => {
      next.call(this.app.vault, eventType, path, oldPath, stats);
    };

    if (this.vaultChangeEvents.length !== 3) {
      handleDefault();
      return;
    }

    if (this.vaultChangeEvents[0]?.eventType !== 'raw' || this.vaultChangeEvents[1]?.eventType !== 'raw' || this.vaultChangeEvents[2]?.path !== this.vaultChangeEvents[1]?.path) {
      handleDefault();
      return;
    }

    const oldRenamedPath = this.vaultChangeEvents[0].path;
    const oldRenamedFile = this.app.vault.fileMap[oldRenamedPath];

    if (!oldRenamedFile || this.existsSync(oldRenamedPath)) {
      handleDefault();
      return;
    }

    const expectedAction = isFile(oldRenamedFile) ? 'file-created' : 'folder-created';

    if (this.vaultChangeEvents[2]?.eventType !== expectedAction) {
      handleDefault();
      return;
    }

    this.handleRename(oldRenamedPath, path, next, true);
  }

  private readdirSync(path: string): string[] {
    return this.fileSystemAdapter.fs.readdirSync(this.fileSystemAdapter.getFullRealPath(path));
  }

  private statSync(path: string): Stats {
    return this.fileSystemAdapter.fs.statSync(this.fileSystemAdapter.getFullRealPath(path));
  }
}
