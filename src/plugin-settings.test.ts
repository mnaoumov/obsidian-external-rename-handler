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
    expect(settings.shouldUpdateLinks).toBe(true);
  });
});
