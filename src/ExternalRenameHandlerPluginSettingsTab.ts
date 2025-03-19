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
      .setName('Polling interval in milliseconds')
      .setDesc(createFragment((f) => {
        f.appendText('Polling is an additional mechanism to detect file changes.');
        f.createEl('br');
        f.appendText('The lower the value, the more CPU-intensive the plugin will be.');
        f.createEl('br');
        f.appendText('The higher the value, the more delay might occur to detect the missed file changes.');
        f.createEl('br');
        f.appendText('Use 0 to disable polling.');
      }))
      .addNumber((numberComponent) => {
        this.bind(numberComponent, 'pollingIntervalInMilliseconds')
          .setMin(0)
          .setStep(100);
        numberComponent.inputEl.required = true;
      });
  }

  public override hide(): void {
    invokeAsyncSafely(this.plugin.applyNewSettings.bind(this.plugin));
  }
}
