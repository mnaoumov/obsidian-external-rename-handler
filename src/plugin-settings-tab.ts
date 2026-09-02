import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
}

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly pluginSuggestionComponent: PluginSuggestionComponent;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.pluginSuggestionComponent = params.pluginSuggestionComponent;
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      // The suggestion banner has to travel as a row: Obsidian renders the declarative definitions and never
      // Calls `display()` once `getSettingDefinitions()` is non-empty, so there is no container to write into
      // Otherwise. The row body is emptied first, leaving the Setting element as a bare host for the banner.
      this.settingEx({
        name: '',
        render: (setting) => {
          setting.settingEl.empty();
          this.pluginSuggestionComponent.renderBanner(setting.settingEl);
        },
        searchable: false,
        visible: () => this.pluginSuggestionComponent.getSuggestedPluginState() !== SuggestedPluginState.Enabled
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Polling is an additional mechanism to detect file changes.');
          f.createEl('br');
          f.appendText('The lower the value, the more CPU-intensive the plugin will be.');
          f.createEl('br');
          f.appendText('The higher the value, the more delay might occur to detect the missed file changes.');
          f.createEl('br');
          f.appendText('Use 0 to disable polling.');
        }),
        name: 'Polling interval in milliseconds',
        render: (setting) => {
          setting.addNumber((numberComponent) => {
            this.bind({
              propertyName: 'pollingIntervalInMilliseconds',
              valueComponent: numberComponent
            })
              .setMin(0);
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('The timeout to distinguish deletion and rename events.');
          f.createEl('br');
          f.appendText('Rename events are often a pair of create/delete events, which do not require this timeout.');
          f.createEl('br');
          f.appendText(
            'However, in some rare cases, the events are sent in a reverse delete/create order, where this timeout will be needed to correctly detect the rename event.'
          );
          f.createEl('br');
          f.appendText('Use 0 to disable this timeout.');
        }),
        name: 'Deletion/rename detection timeout in milliseconds',
        render: (setting) => {
          setting.addNumber((numberComponent) => {
            this.bind({
              propertyName: 'deletionRenameDetectionTimeoutInMilliseconds',
              valueComponent: numberComponent
            })
              .setMin(0);
          });
        }
      })
    ];
  }
}
