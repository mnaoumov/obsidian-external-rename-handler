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
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { registerRenameDeleteHandlers } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { join } from 'obsidian-dev-utils/Path';

import { ExternalRenameHandlerPluginSettings } from './ExternalRenameHandlerPluginSettings.ts';
import { ExternalRenameHandlerPluginSettingsTab } from './ExternalRenameHandlerPluginSettingsTab.ts';

type GenericFileSystemWatchHandler = (eventType: string, path?: string, oldPath?: string, stats?: FileStats) => void;

interface VaultChangeEvent {
  eventType: string;
  path: string;
}

export class ExternalRenameHandlerPlugin extends PluginBase<ExternalRenameHandlerPluginSettings> {
  private fileSystemAdapter!: FileSystemAdapter;
  private pathsToSkip = new Set<string>();
  private vaultChangeEvents: VaultChangeEvent[] = [];

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
    this.register(around(this.app.vault, {
      onChange: (next): FileSystemWatchHandler => (eventType: string, path?: string, oldPath?: string, stats?: FileStats) => {
        this.handleVaultChange(eventType, path, oldPath, stats, next as GenericFileSystemWatchHandler);
      }
    }));
    await this.app.vault.load();
  }

  private existsSync(path: string): boolean {
    return this.fileSystemAdapter.fs.existsSync(this.fileSystemAdapter.getFullRealPath(path));
  }

  private getEvent(index: number): VaultChangeEvent {
    const NO_EVENT = { eventType: 'raw', path: '!!NO_EVENT!!' };
    return this.vaultChangeEvents[index] ?? NO_EVENT;
  }

  private handleRename(oldPath: string, newPath: string, next: GenericFileSystemWatchHandler, isTopLevel?: boolean): void {
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

  private handleVaultChange(
    eventType: string,
    path: string | undefined,
    oldPath: string | undefined,
    stats: FileStats | undefined,
    next: GenericFileSystemWatchHandler
  ): void {
    if (eventType === 'closed') {
      next.call(this.app.vault, 'closed');
      return;
    }

    if (path === undefined) {
      return;
    }

    const RENAME_EVENTS_COUNT = 3;
    this.vaultChangeEvents.push({ eventType, path });
    if (this.vaultChangeEvents.length > RENAME_EVENTS_COUNT) {
      this.vaultChangeEvents.shift();
    }

    if (eventType !== 'raw' && this.pathsToSkip.has(path)) {
      this.pathsToSkip.delete(path);
      return;
    }

    const handleDefault = (): void => {
      next.call(this.app.vault, eventType, path, oldPath, stats);
    };

    if (this.vaultChangeEvents.length !== RENAME_EVENTS_COUNT) {
      handleDefault();
      return;
    }

    const event0 = this.getEvent(0);
    const event1 = this.getEvent(1);
    const event2 = this.getEvent(RENAME_EVENTS_COUNT - 1);

    if (event0.eventType === 'raw' && event2.eventType === 'raw') {
      if (event1.path.startsWith(`${event2.path}/`)) {
        this.vaultChangeEvents.pop();
      }

      handleDefault();
      return;
    }

    if (event0.eventType !== 'raw' || event1.eventType !== 'raw' || event2.path !== event1.path) {
      handleDefault();
      return;
    }

    const oldRenamedPath = event0.path;
    const oldRenamedFile = this.app.vault.fileMap[oldRenamedPath];

    if (!oldRenamedFile || this.existsSync(oldRenamedPath)) {
      handleDefault();
      return;
    }

    const expectedAction = isFile(oldRenamedFile) ? 'file-created' : 'folder-created';

    if (this.vaultChangeEvents[RENAME_EVENTS_COUNT - 1]?.eventType !== expectedAction) {
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
