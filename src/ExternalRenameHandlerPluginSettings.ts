import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';

export class ExternalRenameHandlerPluginSettings extends PluginSettingsBase {
  /* eslint-disable no-magic-numbers */
  public deletionRenameDetectionTimeoutInMilliseconds = 500;
  public pollingIntervalInMilliseconds = 2000;
  public shouldUpdateLinks = true;
  /* eslint-enable no-magic-numbers */

  public constructor(data: unknown) {
    super();
    this.init(data);
  }
}
