import type { DataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import type { PluginEventSource } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';

import {
  PluginSettings,
  PollingMode
} from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

class LegacySettings {
  // Owned by `Advanced Rename and Delete Handler` since 4.0.0, under its own name `shouldHandleRenames`. The
  // converter is what keeps the user's value: the saved record is rebuilt from the declared properties
  // alone, so the first save after the property was dropped would otherwise strip it from `data.json`
  // before it could ever be offered.
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

      // Before `pollingMode`, an interval of 0 was how polling was turned off, so that choice is kept as `Never`. Any other
      // stored interval, the old default of 2 seconds above all, is left to `Auto`: on a local disk polling bought nothing
      // measured and cost a `stat` of every vault file per interval.
      if (legacySettings.pollingMode !== undefined || legacySettings.pollingIntervalInMilliseconds !== 0) {
        return;
      }
      legacySettings.pollingMode = PollingMode.Never;
      legacySettings.pollingIntervalInMilliseconds = new PluginSettings().pollingIntervalInMilliseconds;
    });
  }
}
