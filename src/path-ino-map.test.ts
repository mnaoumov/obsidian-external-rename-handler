/* eslint-disable @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- Test mocking patterns require type assertions and flexible typing. */
import type { App } from 'obsidian';

import { IDBFactory } from 'fake-indexeddb';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PathInoMap } from './path-ino-map.ts';

const DEBOUNCE_MS = 5000;

function createMockApp(appId: string): App {
  return strictProxy<App>({ appId });
}

describe('PathInoMap', () => {
  let databaseCounter = 0;

  beforeAll(() => {
    if (!activeWindow.indexedDB) {
      Object.defineProperty(activeWindow, 'indexedDB', {
        configurable: true,
        value: new IDBFactory()
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createUniqueApp(): App {
    return createMockApp(`test-${String(databaseCounter++)}`);
  }

  describe('before init', () => {
    it('should return undefined for getIno', () => {
      const map = new PathInoMap();
      expect(map.getIno('/test.md')).toBeUndefined();
    });

    it('should return undefined for getPath', () => {
      const map = new PathInoMap();
      expect(map.getPath(123)).toBeUndefined();
    });

    it('should return empty array for getPaths', () => {
      const map = new PathInoMap();
      expect(map.getPaths()).toEqual([]);
    });

    it('should not throw out of the debounced flush when it runs before init', () => {
      vi.useFakeTimers();
      const map = new PathInoMap();
      map.set({ ino: 1, path: '/test.md' });
      // The throw used to escape the debounce as an uncaught error. It is reported through the real `printError` now.
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });
  });

  describe('after init', () => {
    let pathInoMap: PathInoMap;

    beforeEach(async () => {
      pathInoMap = new PathInoMap();
      await pathInoMap.init(createUniqueApp());
    });

    it('should set and retrieve path-ino mappings', () => {
      pathInoMap.set({ ino: 100, path: '/test.md' });
      expect(pathInoMap.getIno('/test.md')).toBe(100);
      expect(pathInoMap.getPath(100)).toBe('/test.md');
    });

    it('should return all paths', () => {
      pathInoMap.set({ ino: 1, path: '/a.md' });
      pathInoMap.set({ ino: 2, path: '/b.md' });
      expect(pathInoMap.getPaths()).toEqual(['/a.md', '/b.md']);
    });

    it('should delete a path', () => {
      pathInoMap.set({ ino: 100, path: '/test.md' });
      pathInoMap.deletePath('/test.md');
      expect(pathInoMap.getIno('/test.md')).toBeUndefined();
      expect(pathInoMap.getPath(100)).toBeUndefined();
    });

    it('should clear all entries', () => {
      pathInoMap.set({ ino: 1, path: '/a.md' });
      pathInoMap.set({ ino: 2, path: '/b.md' });
      pathInoMap.clear();
      expect(pathInoMap.getPaths()).toEqual([]);
    });

    it('should handle rename by replacing old path for same ino', () => {
      pathInoMap.set({ ino: 100, path: '/old.md' });
      pathInoMap.set({ ino: 100, path: '/new.md' });
      expect(pathInoMap.getPath(100)).toBe('/new.md');
      expect(pathInoMap.getIno('/old.md')).toBeUndefined();
    });

    it('should handle set when oldPath equals path', () => {
      pathInoMap.set({ ino: 100, path: '/same.md' });
      pathInoMap.set({ ino: 100, path: '/same.md' });
      expect(pathInoMap.getPath(100)).toBe('/same.md');
    });

    it('should flush store actions on debounce', () => {
      vi.useFakeTimers();
      pathInoMap.set({ ino: 100, path: '/test.md' });
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });

    it('should flush rename store actions including old path deletion', () => {
      vi.useFakeTimers();
      pathInoMap.set({ ino: 100, path: '/old.md' });
      pathInoMap.set({ ino: 100, path: '/new.md' });
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });

    it('should flush clear and delete store actions', () => {
      vi.useFakeTimers();
      pathInoMap.set({ ino: 1, path: '/a.md' });
      pathInoMap.deletePath('/a.md');
      pathInoMap.clear();
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });
  });

  describe('init with existing data', () => {
    it('should load entries from a previously populated database', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const app = createUniqueApp();

      const map1 = new PathInoMap();
      await map1.init(app);
      map1.set({ ino: 42, path: '/existing.md' });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

      vi.useRealTimers();

      const map2 = new PathInoMap();
      await map2.init(app);
      expect(map2.getIno('/existing.md')).toBe(42);
      expect(map2.getPath(42)).toBe('/existing.md');
    });
  });

  describe('dispose', () => {
    it('should keep a failed flush queued and write it once a connection exists', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const app = createUniqueApp();

      const map = new PathInoMap();
      map.set({ ino: 1, path: '/queued-before-init.md' });
      // The flush fails - there is no connection yet - and must NOT discard the action.
      vi.advanceTimersByTime(DEBOUNCE_MS);

      await map.init(app);
      map[Symbol.dispose]();

      vi.useRealTimers();

      const reopened = new PathInoMap();
      await reopened.init(app);
      expect(reopened.getIno('/queued-before-init.md')).toBe(1);
      reopened[Symbol.dispose]();
    });

    it('should flush the pending actions instead of letting the debounce fire after teardown', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const app = createUniqueApp();

      const map = new PathInoMap();
      await map.init(app);
      map.set({ ino: 7, path: '/pending.md' });
      map[Symbol.dispose]();

      // The debouncer is cancelled, so nothing fires into the closed connection.
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();

      vi.useRealTimers();

      const reopened = new PathInoMap();
      await reopened.init(app);
      expect(reopened.getIno('/pending.md')).toBe(7);
      reopened[Symbol.dispose]();
    });

    it('should be idempotent and inert once disposed', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const app = createUniqueApp();

      const map = new PathInoMap();
      await map.init(app);
      map[Symbol.dispose]();
      map[Symbol.dispose]();

      // A store action arriving after teardown is dropped rather than queued against a closed connection.
      map.set({ ino: 9, path: '/after-dispose.md' });
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();

      vi.useRealTimers();

      const reopened = new PathInoMap();
      await reopened.init(app);
      expect(reopened.getIno('/after-dispose.md')).toBeUndefined();
      reopened[Symbol.dispose]();
    });
  });

  describe('window binding', () => {
    it('should open the database on the main window, not on the focused one', async () => {
      const originalActiveWindow = activeWindow;
      const popoutOpenSpy = vi.fn();
      Object.defineProperty(window, 'activeWindow', {
        configurable: true,
        value: { indexedDB: { open: popoutOpenSpy } }
      });

      try {
        const mainWindowOpenSpy = vi.spyOn(window.indexedDB, 'open');
        const map = new PathInoMap();
        await map.init(createUniqueApp());
        map[Symbol.dispose]();

        expect(mainWindowOpenSpy).toHaveBeenCalledOnce();
        expect(popoutOpenSpy).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(window, 'activeWindow', {
          configurable: true,
          value: originalActiveWindow
        });
      }
    });
  });

  describe('upgradeneeded edge case', () => {
    it('should skip object store creation when newVersion is not 1', async () => {
      const createObjectStoreSpy = vi.fn();

      vi.spyOn(activeWindow.indexedDB, 'open').mockReturnValue({
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
          if (type === 'upgradeneeded') {
            (listener as EventListener)({ newVersion: 2 } as unknown as IDBVersionChangeEvent);
          } else if (type === 'success') {
            queueMicrotask(() => {
              (listener as EventListener)(new Event('success'));
            });
          }
        }),
        error: null,
        readyState: 'pending',
        result: {
          createObjectStore: createObjectStoreSpy,
          transaction: vi.fn(() => ({
            objectStore: vi.fn(() => ({
              getAll: vi.fn(() => ({
                addEventListener: vi.fn(),
                readyState: 'done',
                result: []
              }))
            }))
          }))
        }
      } as unknown as IDBOpenDBRequest);

      const map = new PathInoMap();
      await map.init(createUniqueApp());

      expect(createObjectStoreSpy).not.toHaveBeenCalled();
    });
  });

  describe('getResult error handling', () => {
    it('should reject when IndexedDB request fails', async () => {
      vi.spyOn(activeWindow.indexedDB, 'open').mockReturnValue({
        addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
          if (type === 'error') {
            queueMicrotask(() => {
              (listener as EventListener)(new Event('error'));
            });
          }
        },
        error: new DOMException('Test error'),
        readyState: 'pending',
        result: undefined
      } as unknown as IDBOpenDBRequest);

      const map = new PathInoMap();
      await expect(map.init(createUniqueApp())).rejects.toThrow('IndexedDB request failed');
    });
  });

  describe('getResult synchronous path', () => {
    it('should return immediately when readyState is done', async () => {
      const mockDatabase = {
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            getAll: vi.fn(() => ({
              addEventListener: vi.fn(),
              readyState: 'done',
              result: []
            }))
          }))
        }))
      };

      vi.spyOn(activeWindow.indexedDB, 'open').mockReturnValue({
        addEventListener: vi.fn(),
        error: null,
        readyState: 'done',
        result: mockDatabase
      } as unknown as IDBOpenDBRequest);

      const map = new PathInoMap();
      await map.init(createUniqueApp());

      expect(mockDatabase.transaction).toHaveBeenCalled();
    });
  });
});
/* eslint-enable @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- End of test file. */
