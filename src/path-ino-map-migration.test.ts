import type { App } from 'obsidian';

import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { noop } from '@mnaoumov/typescript-lib/function';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  IDBFactory,
  IDBObjectStore
} from 'fake-indexeddb';
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi
} from 'vitest';

import { PathInoMap } from './path-ino-map.ts';

beforeEach(() => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: new IDBFactory() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('imports legacy observations into device-local records without touching the vault', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  await seedLegacy(app);
  const map = new PathInoMap();
  await map.init(app);
  expect(map.getIno('alpha.md')).toBe(42);
  expect(map.getBirthtime('alpha.md')).toBeUndefined();
  expect(map.getStamp('alpha.md')).toBeUndefined();
  const local = await LocalDataStore.open({ factory: window.indexedDB, pluginId: 'external-rename-handler', storeId: 'path-ino-v1', vaultId: app.appId });
  expect(await local.get('path:alpha.md')).toEqual({ ino: 42, path: 'alpha.md' });
  expect(await local.get('legacy-import-v1')).toBe(true);
  local.close();
  await map.disposeAsync();
});

it('does not resurrect imported paths after deletion or clear and reopening', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  await seedLegacy(app);
  const map = new PathInoMap();
  await map.init(app);
  map.deletePath('alpha.md');
  await map.disposeAsync();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getPaths()).toEqual([]);
  reopened.set({ birthtimeMs: 7, ino: 43, path: 'bravo.md', stamp: { mtime: 8, size: 9 } });
  reopened.clear();
  reopened.set({ birthtimeMs: 10, ino: 44, path: 'charlie.md' });
  await reopened.disposeAsync();
  const final = new PathInoMap();
  await final.init(app);
  expect(final.getPaths()).toEqual(['charlie.md']);
  expect(final.getBirthtime('charlie.md')).toBe(10);
  await final.disposeAsync();
});

it('keeps vault observations isolated even when paths and inodes match', async () => {
  const alpha = new PathInoMap();
  const bravo = new PathInoMap();
  await alpha.init(strictProxy<App>({ appId: 'alpha' }));
  await bravo.init(strictProxy<App>({ appId: 'bravo' }));
  alpha.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  bravo.set({ birthtimeMs: 20, ino: 42, path: 'bravo.md' });
  await alpha.disposeAsync();
  await bravo.disposeAsync();
  const reopened = new PathInoMap();
  await reopened.init(strictProxy<App>({ appId: 'alpha' }));
  expect(reopened.getPaths()).toEqual(['alpha.md']);
  expect(reopened.getBirthtime('alpha.md')).toBe(10);
  await reopened.disposeAsync();
});

it('retries an aborted import on restart without a premature marker', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  await seedLegacy(app);
  const put = IDBObjectStore.prototype.put;
  const commit = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function abortImport(this: IDBObjectStore, value, key) {
    const request = put.call(this, value, key);
    queueMicrotask(() => {
      this.transaction.abort();
    });
    return request;
  });
  const failed = new PathInoMap();
  await expect(failed.init(app)).rejects.toThrow('aborted');
  await expect(failed.disposeAsync()).rejects.toThrow('aborted');
  commit.mockRestore();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getIno('alpha.md')).toBe(42);
  await reopened.disposeAsync();
});

it('serializes in-flight writes with clear, inode reassignment and later changes', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const app = strictProxy<App>({ appId: 'alpha' });
  const map = new PathInoMap();
  await map.init(app);
  const original = LocalDataStore.prototype.commit;
  let release = noop;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const commit = vi.spyOn(LocalDataStore.prototype, 'commit').mockImplementationOnce(async function commitAfterRelease(this: LocalDataStore, params) {
    await barrier;
    await original.call(this, params);
  });
  map.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(commit).toHaveBeenCalledOnce();
  map.clear();
  map.set({ birthtimeMs: 20, ino: 43, path: 'bravo.md' });
  map.set({ birthtimeMs: 20, ino: 43, path: 'charlie.md', stamp: { mtime: 30, size: 40 } });
  release();
  await map.disposeAsync();
  vi.useRealTimers();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getPaths()).toEqual(['charlie.md']);
  expect(reopened.getPath(43)).toBe('charlie.md');
  expect(reopened.getStamp('charlie.md')).toEqual({ mtime: 30, size: 40 });
  await reopened.disposeAsync();
});

it('retains failed writes for disposal and rejects changes after disposal', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const app = strictProxy<App>({ appId: 'alpha' });
  const map = new PathInoMap();
  await map.init(app);
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function abortWrite(this: IDBObjectStore, value, key) {
    const request = put.call(this, value, key);
    queueMicrotask(() => {
      this.transaction.abort();
    });
    return request;
  });
  map.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  await vi.advanceTimersByTimeAsync(5000);
  await map.disposeAsync();
  await map.disposeAsync();
  map.clear();
  map.deletePath('alpha.md');
  map.set({ birthtimeMs: 20, ino: 43, path: 'bravo.md' });
  expect(map.getPaths()).toEqual(['alpha.md']);
  vi.useRealTimers();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getPaths()).toEqual(['alpha.md']);
  await reopened.disposeAsync();
});

it('drains accepted mutations and closes when unloaded during open', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const map = new PathInoMap();
  const initializing = map.init(app);
  map.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  const close = vi.spyOn(LocalDataStore.prototype, 'close');
  map[Symbol.dispose]();
  await initializing;
  await map.disposeAsync();
  expect(close).toHaveBeenCalledOnce();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getIno('alpha.md')).toBe(42);
  await reopened.disposeAsync();
});

it('ignores malformed observations so they cannot fabricate renames', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const local = await LocalDataStore.open({ factory: window.indexedDB, pluginId: 'external-rename-handler', storeId: 'path-ino-v1', vaultId: app.appId });
  await local.commit({
    entries: [
      ['legacy-import-v1', true],
      ['path:alpha.md', { ino: 42, path: 'bravo.md' }],
      ['path:bravo.md', null],
      ['path:charlie.md', { ino: '42', path: 'charlie.md' }],
      ['path:delta.md', { birthtimeMs: '10', ino: 42, path: 'delta.md' }],
      ['path:echo.md', { ino: 42, mtime: NaN, path: 'echo.md' }],
      ['path:foxtrot.md', { ino: 42, path: 'foxtrot.md', size: '40' }],
      ['path:golf.md', { ino: 43, mtime: 30, path: 'golf.md' }]
    ]
  });
  local.close();
  const map = new PathInoMap();
  await map.init(app);
  expect(map.getPaths()).toEqual(['golf.md']);
  expect(map.getStamp('golf.md')).toBeUndefined();
  map.clear();
  await map.disposeAsync();
});

it('leaves import retryable when the legacy database cannot be opened', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  await seedLegacy(app);
  const request = window.indexedDB.open(`${app.appId}/external-rename-handler`, 2);
  await new Promise<void>((resolve) => {
    request.addEventListener('success', () => {
      request.result.close();
      resolve();
    });
  });
  const map = new PathInoMap();
  await expect(map.init(app)).rejects.toThrow('IndexedDB request failed');
  const local = await LocalDataStore.open({ factory: window.indexedDB, pluginId: 'external-rename-handler', storeId: 'path-ino-v1', vaultId: app.appId });
  expect(await local.get('legacy-import-v1')).toBeUndefined();
  local.close();
});

it('closes the connection even when the final drain fails', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const map = new PathInoMap();
  await map.init(app);
  const close = vi.spyOn(LocalDataStore.prototype, 'close');
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
    throw new Error('quota');
  });
  map.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  await expect(map.disposeAsync()).rejects.toThrow('quota');
  expect(close).toHaveBeenCalledOnce();
  await expect(map.disposeAsync()).rejects.toThrow('quota');
  expect(close).toHaveBeenCalledOnce();
});

it('preserves mutations accepted while existing observations are loading', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const seed = new PathInoMap();
  await seed.init(app);
  seed.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  await seed.disposeAsync();
  const map = new PathInoMap();
  const initializing = map.init(app);
  map.clear();
  map.set({ birthtimeMs: 20, ino: 43, path: 'bravo.md' });
  await initializing;
  expect(map.getPaths()).toEqual(['bravo.md']);
  await map.disposeAsync();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getPaths()).toEqual(['bravo.md']);
  await reopened.disposeAsync();
});

it('persists inode reassignment accepted during open without retaining the previous path', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const seed = new PathInoMap();
  await seed.init(app);
  seed.set({ birthtimeMs: 10, ino: 42, path: 'alpha.md' });
  await seed.disposeAsync();
  const map = new PathInoMap();
  const initializing = map.init(app);
  map.set({ birthtimeMs: 10, ino: 42, path: 'bravo.md' });
  await initializing;
  expect(map.getPaths()).toEqual(['bravo.md']);
  await map.disposeAsync();
  const reopened = new PathInoMap();
  await reopened.init(app);
  expect(reopened.getPaths()).toEqual(['bravo.md']);
  await reopened.disposeAsync();
});

async function seedLegacy(app: App): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.open(`${app.appId}/external-rename-handler`, 1);
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore('path-ino', { keyPath: 'path' });
    };
    request.addEventListener('error', () => {
      reject(new Error('Legacy seed failed', { cause: request.error }));
    });
    request.onsuccess = (): void => {
      const database = request.result;
      const transaction = database.transaction('path-ino', 'readwrite');
      transaction.objectStore('path-ino').put({ ino: 42, path: 'alpha.md' });
      transaction.oncomplete = (): void => {
        database.close();
        resolve();
      };
    };
  });
}
