import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';

export class ExternalRenameHandlerPluginSettings extends PluginSettingsBase {
  public shouldUpdateLinks = true;

  public constructor(data: unknown) {
    super();
    this.init(data);
  }
}
