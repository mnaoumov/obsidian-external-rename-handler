import type { Stats } from 'node:fs';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const PARENT_PATH = '/vault/config';

const hoisted = vi.hoisted(() => ({
  mkdir: vi.fn((_path: string): Promise<void> => noopAsync()),
  rm: vi.fn((_path: string, _options: object): Promise<void> => noopAsync()),
  sleep: vi.fn((_delay: number): Promise<void> => noopAsync()),
  stat: vi.fn((_path: string): Promise<Pick<Stats, 'mtimeMs'>> => Promise.resolve({ mtimeMs: 1 })),
  writeFile: vi.fn((_path: string, _data: string): Promise<void> => noopAsync())
}));

// --- Allowed mocks: non obsidian-lib / non test-mocks modules ---

vi.mock('node:fs/promises', () => {
  const mock = { mkdir: hoisted.mkdir, rm: hoisted.rm, stat: hoisted.stat, writeFile: hoisted.writeFile };
  return { ...mock, default: mock };
});

vi.mock('node:timers/promises', () => {
  const mock = { setTimeout: hoisted.sleep };
  return { ...mock, default: mock };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { doesFolderMtimeTrackNewEntries } from './desktop-folder-mtime-probe.ts';

describe('doesFolderMtimeTrackNewEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mkdir.mockResolvedValue(undefined);
    hoisted.stat.mockResolvedValue({ mtimeMs: 1 });
  });

  it('should return true at the first entry that changes the folder time', async () => {
    hoisted.stat
      .mockResolvedValueOnce({ mtimeMs: 1 })
      .mockResolvedValueOnce({ mtimeMs: 1 })
      .mockResolvedValueOnce({ mtimeMs: 2 });
    expect(await doesFolderMtimeTrackNewEntries(PARENT_PATH)).toBe(true);
    expect(hoisted.writeFile).toHaveBeenCalledTimes(2);
    expect(hoisted.sleep).toHaveBeenCalledTimes(1);
  });

  // The FAT32 and exFAT drivers of Windows.
  it('should return false when the folder time never changes', async () => {
    expect(await doesFolderMtimeTrackNewEntries(PARENT_PATH)).toBe(false);
    expect(hoisted.writeFile).toHaveBeenCalledTimes(12);
    // FAT32 keeps a time only to 2 seconds, so the probe has to outlast that.
    const waitedMilliseconds = hoisted.sleep.mock.calls.reduce((total, [delay]) => total + delay, 0);
    expect(waitedMilliseconds).toBeGreaterThan(2000);
  });

  it('should create the probe folder in the given folder and remove it afterwards', async () => {
    await doesFolderMtimeTrackNewEntries(PARENT_PATH);
    const probePath = hoisted.mkdir.mock.calls[0]?.[0];
    expect(probePath).toMatch(/[/\\]vault[/\\]config[/\\]\.external-rename-handler-probe-\d+$/);
    expect(hoisted.rm).toHaveBeenCalledWith(probePath, { force: true, recursive: true });
  });

  it('should return true when the probe cannot be made', async () => {
    hoisted.mkdir.mockRejectedValue(new Error('EACCES'));
    expect(await doesFolderMtimeTrackNewEntries(PARENT_PATH)).toBe(true);
  });

  it('should not fail when the probe folder cannot be removed', async () => {
    hoisted.rm.mockRejectedValueOnce(new Error('EBUSY'));
    expect(await doesFolderMtimeTrackNewEntries(PARENT_PATH)).toBe(false);
  });
});
