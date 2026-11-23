import type { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import type { SettingDefinitionItem } from 'obsidian';

import { SuggestedPluginState } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import { PollingMode } from './plugin-settings.ts';

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
      // calls `display()` once `getSettingDefinitions()` is non-empty, so there is no container to write into
      // otherwise. The row body is emptied first, leaving the Setting element as a bare host for the banner.
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
          f.appendText('How external file changes are detected besides the native file system watcher.');
          f.createEl('br');
          f.appendText(
            'Automatic polls only where the native watcher reports nothing, such as a network share or a WSL folder. On a local disk the native watcher sees every change, bursts included.'
          );
          f.createEl('br');
          f.appendText('Always polls on a local disk too. Never relies on the native watcher alone.');
          f.createEl('br');
          f.appendText(
            'A drive that never changes a folder\'s modification time, such as FAT32 or exFAT under Windows, is not polled in any mode, because polling would see no new file there.'
          );
        }),
        name: 'Polling',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              [PollingMode.Always]: 'Always',
              [PollingMode.Auto]: 'Automatic',
              [PollingMode.Never]: 'Never'
            });
            this.bind({ propertyName: 'pollingMode', valueComponent: dropdown });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          const fileCount = this.app.vault.getAllLoadedFiles().length;
          f.appendText(
            `Each polling interval reads the file system entry of every file and folder in the vault, ${String(fileCount)} of them now, on Obsidian's main thread.`
          );
          f.createEl('br');
          f.appendText('The lower the value, the more CPU the plugin uses while polling.');
          f.createEl('br');
          f.appendText('The higher the value, the longer a change can take to be detected.');
        }),
        name: 'Polling interval in milliseconds',
        render: (setting) => {
          setting.addNumber((numberComponent) => {
            this.bind({
              propertyName: 'pollingIntervalInMilliseconds',
              valueComponent: numberComponent
            })
              .setMin(1);
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
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When Obsidian starts, recognize the files renamed or moved while it was closed and report them as renames.');
          f.createEl('br');
          f.appendText('A file is recognized only when its old path is gone and the file system still gives it the same identity.');
        }),
        name: 'Detect renames made while Obsidian was closed',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({
              propertyName: 'shouldDetectOfflineRenames',
              valueComponent: toggle
            });
          });
        }
      })
    ];
  }
}
