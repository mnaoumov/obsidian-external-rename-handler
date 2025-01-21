import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';

import type { ExternalRenameHandlerPlugin } from './ExternalRenameHandlerPlugin.ts';

export class ExternalRenameHandlerPluginSettingsTab extends PluginSettingsTabBase<ExternalRenameHandlerPlugin> {
  public override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Should update links')
      .setDesc('Whether to trigger a link update when a file is renamed externally')
      .addToggle((toggle) => this.bind(toggle, 'shouldUpdateLinks'));
  }
}
