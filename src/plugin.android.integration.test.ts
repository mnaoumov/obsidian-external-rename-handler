import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  describe,
  expect,
  it
} from 'vitest';

describe('Smoke test', () => {
  it('should NOT load plugin on Android because it is desktop-only', () => {
    expect(() => getTempVault()).toThrow('isDesktopOnly');
  });
});
