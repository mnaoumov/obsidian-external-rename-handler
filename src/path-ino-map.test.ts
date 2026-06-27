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
  let dbCounter = 0;

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
    return createMockApp(`test-${String(dbCounter++)}`);
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

    it('should throw when processStoreActions runs before init', () => {
      vi.useFakeTimers();
      const map = new PathInoMap();
      map.set('/test.md', 1);
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).toThrow('db is not initialized');
    });
  });

  describe('after init', () => {
    let pathInoMap: PathInoMap;

    beforeEach(async () => {
      pathInoMap = new PathInoMap();
      await pathInoMap.init(createUniqueApp());
    });

    it('should set and retrieve path-ino mappings', () => {
      pathInoMap.set('/test.md', 100);
      expect(pathInoMap.getIno('/test.md')).toBe(100);
      expect(pathInoMap.getPath(100)).toBe('/test.md');
    });

    it('should return all paths', () => {
      pathInoMap.set('/a.md', 1);
      pathInoMap.set('/b.md', 2);
      expect(pathInoMap.getPaths()).toEqual(['/a.md', '/b.md']);
    });

    it('should delete a path', () => {
      pathInoMap.set('/test.md', 100);
      pathInoMap.deletePath('/test.md');
      expect(pathInoMap.getIno('/test.md')).toBeUndefined();
      expect(pathInoMap.getPath(100)).toBeUndefined();
    });

    it('should clear all entries', () => {
      pathInoMap.set('/a.md', 1);
      pathInoMap.set('/b.md', 2);
      pathInoMap.clear();
      expect(pathInoMap.getPaths()).toEqual([]);
    });

    it('should handle rename by replacing old path for same ino', () => {
      pathInoMap.set('/old.md', 100);
      pathInoMap.set('/new.md', 100);
      expect(pathInoMap.getPath(100)).toBe('/new.md');
      expect(pathInoMap.getIno('/old.md')).toBeUndefined();
    });

    it('should handle set when oldPath equals path', () => {
      pathInoMap.set('/same.md', 100);
      pathInoMap.set('/same.md', 100);
      expect(pathInoMap.getPath(100)).toBe('/same.md');
    });

    it('should flush store actions on debounce', () => {
      vi.useFakeTimers();
      pathInoMap.set('/test.md', 100);
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });

    it('should flush rename store actions including old path deletion', () => {
      vi.useFakeTimers();
      pathInoMap.set('/old.md', 100);
      pathInoMap.set('/new.md', 100);
      expect(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      }).not.toThrow();
    });

    it('should flush clear and delete store actions', () => {
      vi.useFakeTimers();
      pathInoMap.set('/a.md', 1);
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
      map1.set('/existing.md', 42);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

      vi.useRealTimers();

      const map2 = new PathInoMap();
      await map2.init(app);
      expect(map2.getIno('/existing.md')).toBe(42);
      expect(map2.getPath(42)).toBe('/existing.md');
    });
  });

  describe('upgradeneeded edge case', () => {
    it('should skip object store creation when newVersion is not 1', async () => {
      const createObjectStoreSpy = vi.fn();

      vi.spyOn(activeWindow.indexedDB, 'open').mockReturnValue({
        addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
          if (type === 'upgradeneeded') {
            (listener as EventListener)({ newVersion: 2 } as unknown as IDBVersionChangeEvent);
          }
          if (type === 'success') {
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
      const mockDb = {
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
        result: mockDb
      } as unknown as IDBOpenDBRequest);

      const map = new PathInoMap();
      await map.init(createUniqueApp());

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });
});
/* eslint-enable @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- End of test file. */
