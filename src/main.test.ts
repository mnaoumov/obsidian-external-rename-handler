import {
  describe,
  expect,
  it
} from 'vitest';

import Plugin from './main.ts';

describe('main', () => {
  it('should export Plugin class as default', () => {
    expect(Plugin.name).toBe('Plugin');
  });
});
