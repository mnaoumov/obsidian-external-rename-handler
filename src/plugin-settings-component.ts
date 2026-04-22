import type { PluginSettingsComponentParams } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';

import { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentParams) {
    super(params);
  }

  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }
}
