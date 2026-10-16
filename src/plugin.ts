import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { SettingsMigrationComponent } from '@mnaoumov/obsidian-lib/components/settings-migration-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { FileSystemAdapter } from 'obsidian';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME
} from './advanced-rename-and-delete-handler.ts';
import { ExternalRenameHandlerComponent } from './desktop-external-rename-handler-component.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase {
  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    const pluginSuggestionComponent = this.addChild(
      new PluginSuggestionComponent({
        app: this.app,
        isSuggestionDeclined: (): boolean => pluginSettingsComponent.settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        reason: createSuggestionReason(this.manifest.name),
        // `editAndSave`, not `setProperty`: a decline has to outlive a reload, and `setProperty` only edits
        // the in-memory state.
        setSuggestionDeclined: async (isDeclined): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined = isDeclined;
          });
        },
        suggestedPluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        suggestedPluginName: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME
      })
    );

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent,
      pluginSuggestionComponent
    });

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab
      })
    );

    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
      throw new TypeError('Vault adapter is not a FileSystemAdapter');
    }

    const fileSystemAdapter = this.app.vault.adapter;

    this.addChild(
      new ExternalRenameHandlerComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        fileSystemAdapter,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    this.addChild(
      new SettingsMigrationComponent<MigratableSettings>({
        apiVersionRange: '^1',
        app: this.app,
        getProposedSettings: (): MigratableSettings | null => {
          const proposedShouldHandleRenames = pluginSettingsComponent.settings.proposedShouldHandleRenames;
          return proposedShouldHandleRenames === null ? null : { shouldHandleRenames: proposedShouldHandleRenames };
        },
        pluginSettingsComponent,
        providerPluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        retireProposedSettings: async (): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.proposedShouldHandleRenames = null;
          });
        },
        sourcePluginId: this.manifest.id
      })
    );

    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      })
    ]);
  }
}

function createSuggestionReason(pluginName: string): DocumentFragment {
  return createFragment((fragment) => {
    appendCodeBlock(fragment, pluginName);
    fragment.appendText(' recognizes a rename made outside the app, but it no longer rewrites the links itself. Without ');
    appendCodeBlock(fragment, ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME);
    fragment.appendText(', Obsidian learns the file\'s new name and nothing updates the notes pointing at the old one.');
  });
}
