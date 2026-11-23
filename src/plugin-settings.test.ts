import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PluginSettings,
  PollingMode
} from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should have correct default values', () => {
    const settings = new PluginSettings();
    expect(settings.deletionRenameDetectionTimeoutInMilliseconds).toBe(500);
    expect(settings.pollingIntervalInMilliseconds).toBe(2000);
  });

  // Polling `stat`s every vault file per interval, and on a local disk the native watcher alone misses nothing measured.
  it('should default pollingMode to automatic', () => {
    const settings = new PluginSettings();
    expect(settings.pollingMode).toBe(PollingMode.Auto);
  });

  it('should default isAdvancedRenameAndDeleteHandlerSuggestionDeclined to false', () => {
    const settings = new PluginSettings();
    expect(settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined).toBe(false);
  });

  it('should default proposedShouldHandleRenames to null', () => {
    const settings = new PluginSettings();
    expect(settings.proposedShouldHandleRenames).toBeNull();
  });
});
