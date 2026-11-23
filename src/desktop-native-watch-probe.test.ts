import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const PARENT_PATH = '/vault/config';

interface WatcherStub {
  readonly close: ReturnType<typeof vi.fn>;
  readonly emitError: () => void;
  readonly notify: () => void;
  readonly on: ReturnType<typeof vi.fn>;
}

const hoisted = vi.hoisted(() => ({
  mkdir: vi.fn((_path: string): Promise<void> => noopAsync()),
  rm: vi.fn((_path: string, _options: object): Promise<void> => noopAsync()),
  watch: vi.fn(),
  writeFile: vi.fn((_path: string, _data: string): Promise<void> => noopAsync())
}));

// --- Allowed mocks: non obsidian-lib / non test-mocks modules ---

vi.mock('node:fs', () => {
  const mock = { watch: hoisted.watch };
  return { ...mock, default: mock };
});

vi.mock('node:fs/promises', () => {
  const mock = { mkdir: hoisted.mkdir, rm: hoisted.rm, writeFile: hoisted.writeFile };
  return { ...mock, default: mock };
});

// The probe arms its timeout on Node's own timers, which the fake timers would otherwise leave running in real time.
vi.mock('node:timers', () => {
  const mock = {
    clearTimeout: (timeout: Parameters<typeof clearTimeout>[0]): void => {
      clearTimeout(timeout);
    },
    setTimeout: (callback: () => void, delay: number): ReturnType<typeof setTimeout> => setTimeout(callback, delay)
  };
  return { ...mock, default: mock };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { doesNativeWatcherSeeNewEntries } from './desktop-native-watch-probe.ts';

let watcherStub: WatcherStub;

function createWatcherStub(listener: () => void): WatcherStub {
  let errorListener: (() => void) | null = null;
  const stub: WatcherStub = {
    close: vi.fn(),
    emitError: () => {
      errorListener?.();
    },
    notify: listener,
    on: vi.fn((_event: string, onError: () => void) => {
      errorListener = onError;
      return stub;
    })
  };
  return stub;
}

describe('doesNativeWatcherSeeNewEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hoisted.mkdir.mockResolvedValue(undefined);
    hoisted.writeFile.mockResolvedValue(undefined);
    hoisted.watch.mockImplementation((_path: string, _options: object, listener: () => void) => {
      watcherStub = createWatcherStub(listener);
      return watcherStub;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when the watcher reports the new entry', async () => {
    hoisted.writeFile.mockImplementation(() => {
      watcherStub.notify();
      return noopAsync();
    });
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(true);
    expect(watcherStub.close).toHaveBeenCalledOnce();
    expect(hoisted.rm).toHaveBeenCalledWith(expect.stringContaining('.external-rename-handler-watch-probe-'), { force: true, recursive: true });
  });

  // A network share or `\\wsl.localhost`.
  it('should return false when no notification arrives within 3 seconds', async () => {
    const result = doesNativeWatcherSeeNewEntries(PARENT_PATH);
    await vi.advanceTimersByTimeAsync(2999);
    let isSettled = false;
    const settled = result.then(() => {
      isSettled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(isSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(await result).toBe(false);
    expect(watcherStub.close).toHaveBeenCalledOnce();
  });

  it('should return false when the watcher reports an error', async () => {
    hoisted.writeFile.mockImplementation(() => {
      watcherStub.emitError();
      return noopAsync();
    });
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(false);
  });

  it('should return false when the folder cannot be watched at all', async () => {
    hoisted.watch.mockImplementation(() => {
      throw new Error('ENOSYS');
    });
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(false);
    expect(hoisted.rm).toHaveBeenCalledOnce();
  });

  it('should return true without watching when the probe folder cannot be made', async () => {
    hoisted.mkdir.mockRejectedValue(new Error('EACCES'));
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(true);
    expect(hoisted.watch).not.toHaveBeenCalled();
    expect(hoisted.rm).not.toHaveBeenCalled();
  });

  it('should return true when the probe entry cannot be written', async () => {
    hoisted.writeFile.mockRejectedValue(new Error('EACCES'));
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(true);
    expect(watcherStub.close).toHaveBeenCalledOnce();
  });

  it('should still answer when the probe folder cannot be removed', async () => {
    hoisted.rm.mockRejectedValue(new Error('EBUSY'));
    hoisted.writeFile.mockImplementation(() => {
      watcherStub.notify();
      return noopAsync();
    });
    expect(await doesNativeWatcherSeeNewEntries(PARENT_PATH)).toBe(true);
  });
});
