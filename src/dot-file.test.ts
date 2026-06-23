import {
  describe,
  expect,
  it
} from 'vitest';

import { isDotFile } from './dot-file.ts';

describe('isDotFile', () => {
  it('should return false for a regular file', () => {
    expect(isDotFile('notes/file.md')).toBe(false);
  });

  it('should return true when any path segment starts with a dot', () => {
    expect(isDotFile('notes/.git/config')).toBe(true);
  });

  it('should return true when the file name itself starts with a dot', () => {
    expect(isDotFile('.hidden')).toBe(true);
  });

  it('should treat an empty path as the root and return false', () => {
    expect(isDotFile('')).toBe(false);
  });

  it('should normalize backslashes before inspecting the segments', () => {
    expect(isDotFile('notes\\.git\\config')).toBe(true);
  });
});
