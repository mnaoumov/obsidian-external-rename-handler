import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should have correct default values', () => {
    const settings = new PluginSettings();
    expect(settings.deletionRenameDetectionTimeoutInMilliseconds).toBe(500);
    expect(settings.pollingIntervalInMilliseconds).toBe(2000);
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
