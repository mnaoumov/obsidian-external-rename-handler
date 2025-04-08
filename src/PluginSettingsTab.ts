import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';

import type { PluginTypes } from './PluginTypes.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  public override display(): void {
    super.display();
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
          .setMin(0);
      });

    new SettingEx(this.containerEl)
      .setName('Deletion/Rename detection timeout in milliseconds')
      .setDesc(createFragment((f) => {
        f.appendText('The timeout to distinguish deletion and rename events.');
        f.createEl('br');
        f.appendText('Rename events are often a pair of create/delete events, which do not require this timeout.');
        f.createEl('br');
        f.appendText(
          'However, in some rare cases, the events are sent in a reverse delete/create order, where this timeout will be needed to correctly detect the rename event.'
        );
        f.createEl('br');
        f.appendText('Use 0 to disable this timeout.');
      }))
      .addNumber((numberComponent) => {
        this.bind(numberComponent, 'deletionRenameDetectionTimeoutInMilliseconds')
          .setMin(0);
      });
  }
}
