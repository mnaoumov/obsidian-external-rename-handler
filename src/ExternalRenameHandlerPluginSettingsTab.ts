import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';

import type { ExternalRenameHandlerPlugin } from './ExternalRenameHandlerPlugin.ts';

export class ExternalRenameHandlerPluginSettingsTab extends PluginSettingsTabBase<ExternalRenameHandlerPlugin> {
  public override display(): void {
    this.containerEl.empty();

    new SettingEx(this.containerEl)
      .setName('Should update links')
      .setDesc('Whether to trigger a link update when a file is renamed externally')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldUpdateLinks');
      });

    new SettingEx(this.containerEl)
      .setName('Should use polling')
      .setDesc('It is more reliable but slower')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldUsePolling');
      });
  }

  public override hide(): void {
    invokeAsyncSafely(this.plugin.applyNewSettings.bind(this.plugin));
  }
}
