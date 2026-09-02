import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

class LegacySettings {
  // Owned by Advanced Rename and Delete Handler since 4.0.0, under its own name `shouldHandleRenames`. The
  // Converter is what keeps the user's value: the saved record is rebuilt from the declared properties
  // Alone, so the first save after the property was dropped would otherwise strip it from `data.json`
  // Before it could ever be offered.
  public shouldUpdateLinks = true;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      ...params,
      pluginSettingsClass: PluginSettings
    });
  }

  protected override registerLegacySettingsConverters(): void {
    this.registerLegacySettingsConverter(LegacySettings, (legacySettings) => {
      if (legacySettings.shouldUpdateLinks !== undefined) {
        legacySettings.proposedShouldHandleRenames = legacySettings.shouldUpdateLinks;
      }
    });
  }
}
