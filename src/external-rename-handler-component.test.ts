// eslint-disable-next-line import-x/no-nodejs-modules -- It's a desktop-only plugin.
import type { Stats } from 'node:fs';
import type {
  App as AppOriginal,
  FileSystemAdapter as FileSystemAdapterOriginal,
  Notice as NoticeOriginal,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { Mock } from 'vitest';

import { watch } from 'chokidar';
import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PathInoMapSetParams } from './path-ino-map.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');
const ROOT_INO = 100;

interface AppGlobal {
  app: AppOriginal;
}

interface AsyncEventSource {
  offref(eventRef: unknown): void;
}

interface ComponentPrivate {
  onLayoutReady(): Promise<void>;
  originalOnFileChange(path: null | string): void;
}

interface EventRef {
  asyncEventSource: AsyncEventSource;
}

interface FileEntry {
  realpath: string;
}

interface PathInoMapStub {
  clear: Mock<() => void>;
  deletePath: Mock<(path: string) => void>;
  getIno: Mock<(path: string) => number | undefined>;
  getPath: Mock<(ino: number) => string | undefined>;
  getPaths: Mock<() => string[]>;
  init: Mock<(app: AppOriginal) => Promise<void>>;
  set: Mock<(params: PathInoMapSetParams) => void>;
}

interface TestAdapter {
  basePath: string;
  files: Record<string, FileEntry>;
  getFullRealPath(path: string): string;
  getRealPath(path: string): string;
  onFileChange(path: null | string): void;
}

interface WatcherMock {
  close(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): WatcherMock;
}

type WatcherOnCalls = [string, (...args: unknown[]) => void][];

interface WatcherOnMock {
  mock: WatcherOnMockData;
}

interface WatcherOnMockData {
  calls: WatcherOnCalls;
}

interface WatchOptions {
  ignored(path: string): boolean;
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => {
  const pathInoMapStub: PathInoMapStub = {
    clear: vi.fn(),
    deletePath: vi.fn(),
    getIno: vi.fn((): number | undefined => undefined),
    getPath: vi.fn((): string | undefined => undefined),
    getPaths: vi.fn((): string[] => []),
    init: vi.fn((): Promise<void> => noopAsync()),
    set: vi.fn()
  };

  return {
    capturedLoadSettingsHandlers: [] as (() => Promise<void>)[],
    capturedSaveSettingsHandlers: [] as (() => Promise<void>)[],
    pathInoMapStub,
    settings: {
      deletionRenameDetectionTimeoutInMilliseconds: 500,
      pollingIntervalInMilliseconds: 2000,
      shouldUpdateLinks: true
    },
    stat: vi.fn((): Promise<Pick<Stats, 'ino'>> => Promise.resolve({ ino: ROOT_INO }))
  };
});

// --- Allowed mocks: non dev-utils / non test-mocks modules ---

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const watcher: WatcherMock = {
      close: vi.fn((): Promise<void> => noopAsync()),
      on: vi.fn((): WatcherMock => watcher)
    };
    return watcher;
  })
}));

vi.mock('node:fs/promises', () => {
  const mock = { stat: hoisted.stat };
  return { ...mock, default: mock };
});

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getDataAdapterEx: vi.fn(() => ({ basePath: '/test-vault' }))
}));

// --- Allowed mocks: the plugin's OWN sibling module ---

vi.mock('./path-ino-map.ts', () => ({
  PathInoMap: class {
    public clear = hoisted.pathInoMapStub.clear;
    public deletePath = hoisted.pathInoMapStub.deletePath;
    public getIno = hoisted.pathInoMapStub.getIno;
    public getPath = hoisted.pathInoMapStub.getPath;
    public getPaths = hoisted.pathInoMapStub.getPaths;
    public init = hoisted.pathInoMapStub.init;
    public set = hoisted.pathInoMapStub.set;
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { ExternalRenameHandlerComponent } from './external-rename-handler-component.ts';

let app: AppOriginal;
let adapter: TestAdapter;
let originalOnFileChangeSpy: Mock<(path: null | string) => void>;
let capturedLayoutReadyCallback: (() => void) | undefined;
let onChangeMock: ReturnType<typeof vi.fn>;
let loadedFiles: TAbstractFile[];

function createAdapter(): TestAdapter {
  originalOnFileChangeSpy = vi.fn();
  return {
    basePath: '/test-vault',
    files: {},
    getFullRealPath: (path: string): string => `/test-vault/${path}`,
    getRealPath: (path: string): string => `/test-vault/${path}`,
    onFileChange: originalOnFileChangeSpy
  };
}

function createApp(): AppOriginal {
  adapter = createAdapter();
  const appMock = App.createConfigured__({ adapter: castTo<FileSystemAdapterOriginal>(adapter) });
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    capturedLayoutReadyCallback = cb;
  });
  const newApp = appMock.asOriginalType__();

  onChangeMock = vi.fn();
  seedOnRawTarget(newApp.vault, 'onChange', onChangeMock);
  seedOnRawTarget(newApp.vault, 'getAllLoadedFiles', vi.fn(() => loadedFiles));

  castTo<AppGlobal>(window).app = newApp;
  return newApp;
}

function createComponent(): ExternalRenameHandlerComponent {
  const on = castTo<PluginSettingsComponent['on']>(vi.fn((event: string, handler: () => Promise<void>): EventRef => {
    if (event === 'loadSettings') {
      hoisted.capturedLoadSettingsHandlers.push(handler);
    } else {
      hoisted.capturedSaveSettingsHandlers.push(handler);
    }
    // The real registerAsyncEvent calls eventRef.asyncEventSource.offref(eventRef) on unload.
    return { asyncEventSource: { offref: vi.fn() } };
  }));
  const pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
    on,
    settings: hoisted.settings
  });

  const pluginNoticeComponent = strictProxy<PluginNoticeComponent>({
    showNotice: castTo<PluginNoticeComponent['showNotice']>(vi.fn(() =>
      strictProxy<NoticeOriginal>({
        hide: vi.fn(),
        setMessage: vi.fn()
      })
    ))
  });

  return new ExternalRenameHandlerComponent({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: new AbortController().signal }),
    app,
    fileSystemAdapter: castTo<FileSystemAdapterOriginal>(adapter),
    pluginNoticeComponent,
    pluginSettingsComponent
  });
}

async function createReadyComponent(): Promise<ExternalRenameHandlerComponent> {
  const component = createComponent();
  component.load();
  await triggerLayoutReady();
  return component;
}

async function flush(): Promise<void> {
  // Tick one real macrotask so the LayoutReadyComponent's setTimeout(0) guard fires and registers its invokeAsyncSafely operation with the async-operation tracker.
  await sleep(0);
  // Await every fire-and-forget operation scheduled via invokeAsyncSafely / convertAsyncToSync (onLayoutReady, watcher cleanup).
  await waitForAllAsyncOperations();
}

function getWatcher(index = -1): WatcherMock {
  const results = vi.mocked(watch).mock.results;
  const result = results.at(index);
  if (result?.type !== 'return') {
    throw new Error('Watcher was not created.');
  }
  return castTo<WatcherMock>(result.value);
}

function getWatcherHandler(event: string): (...args: unknown[]) => void {
  const results = vi.mocked(watch).mock.results;
  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];
    if (result?.type !== 'return') {
      continue;
    }
    const watcher = castTo<WatcherMock>(result.value);
    const onMock = castTo<WatcherOnMock>(watcher.on);
    const call = onMock.mock.calls.find((c) => c[0] === event);
    if (call) {
      return call[1];
    }
  }
  throw new Error(`Watcher handler for '${event}' was not registered.`);
}

function getWatchOptions(): WatchOptions {
  const calls = vi.mocked(watch).mock.calls;
  const lastCall = calls.at(-1);
  if (!lastCall) {
    throw new Error('watch was not called.');
  }
  return castTo<WatchOptions>(lastCall[1]);
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const rawTarget = castTo<object | undefined>(Reflect.get(strictProxiedObject, STRICT_PROXY_TARGET_SYMBOL)) ?? strictProxiedObject;
  Reflect.set(rawTarget, key, value);
}

async function triggerLayoutReady(): Promise<void> {
  if (!capturedLayoutReadyCallback) {
    throw new Error('Layout-ready callback was not captured.');
  }
  // LayoutReadyComponent.onload registers this callback; it schedules a setTimeout(0) that invokes onLayoutReady.
  capturedLayoutReadyCallback();
  await flush();
}

// --- Tests ---

describe('ExternalRenameHandlerComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.capturedLoadSettingsHandlers.length = 0;
    hoisted.capturedSaveSettingsHandlers.length = 0;
    hoisted.pathInoMapStub.getIno.mockReturnValue(undefined);
    hoisted.pathInoMapStub.getPath.mockReturnValue(undefined);
    hoisted.pathInoMapStub.getPaths.mockReturnValue([]);
    hoisted.pathInoMapStub.init.mockResolvedValue(undefined);
    hoisted.stat.mockResolvedValue({ ino: ROOT_INO });
    hoisted.settings.deletionRenameDetectionTimeoutInMilliseconds = 500;
    hoisted.settings.pollingIntervalInMilliseconds = 2000;
    hoisted.settings.shouldUpdateLinks = true;
    capturedLayoutReadyCallback = undefined;
    loadedFiles = [];
    app = createApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('originalOnFileChange', () => {
    it('should throw when not initialized', () => {
      const component = createComponent();
      function readOriginalOnFileChange(): void {
        castTo<ComponentPrivate>(component).originalOnFileChange('test.md');
      }
      expect(readOriginalOnFileChange).toThrow('Value is undefined');
    });
  });

  describe('onLayoutReady', () => {
    it('should initialize the path/ino map', async () => {
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.init).toHaveBeenCalled();
    });

    it('should clear the map when the root ino does not match', async () => {
      hoisted.pathInoMapStub.getIno.mockReturnValue(999);
      hoisted.stat.mockResolvedValue({ ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.clear).toHaveBeenCalled();
    });

    it('should not clear the map when the root ino matches', async () => {
      hoisted.pathInoMapStub.getIno.mockReturnValue(ROOT_INO);
      hoisted.stat.mockResolvedValue({ ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.clear).not.toHaveBeenCalled();
    });

    it('should skip cached paths while indexing loaded files', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: '/cached.md' }), castTo<TAbstractFile>({ path: '/new.md' })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['/cached.md']);
      hoisted.stat.mockResolvedValue({ ino: 200 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ ino: 200, path: '/new.md' });
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalledWith({ ino: 200, path: '/cached.md' });
    });

    it('should skip dot files while indexing loaded files', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: '.dot-folder/config' })];
      hoisted.stat.mockResolvedValue({ ino: 200 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
    });

    it('should clean up stale cached paths', async () => {
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['/stale.md']);
      hoisted.stat.mockResolvedValue({ ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('/stale.md');
    });

    it('should set up the monkey patch for onFileChange', async () => {
      await createReadyComponent();
      // The real MonkeyAroundComponent replaced the original onFileChange spy with the patch wrapper.
      expect(adapter.onFileChange).not.toBe(originalOnFileChangeSpy);
      expect(typeof adapter.onFileChange).toBe('function');
    });

    it('should register a watcher via the settings event handlers', async () => {
      await createReadyComponent();
      expect(hoisted.capturedLoadSettingsHandlers).toHaveLength(1);
      expect(hoisted.capturedSaveSettingsHandlers).toHaveLength(1);
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      expect(watch).toHaveBeenCalled();
    });
  });

  describe('handleWatcherEvent', () => {
    async function setup(): Promise<void> {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
    }

    it('should forward dot files to the original onFileChange', async () => {
      await setup();
      getWatcherHandler('all')('add', '.hidden/file.md', { ino: 1 });
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('.hidden/file.md');
    });

    it('should return early for an add event on the root path', async () => {
      await setup();
      getWatcherHandler('all')('add', '', { ino: 1 });
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
    });

    it('should forward to the original onFileChange when an add event has no stats', async () => {
      await setup();
      getWatcherHandler('all')('add', 'test.md', undefined);
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('test.md');
    });

    it('should skip when the existing path equals the new path on add', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('test.md');
      getWatcherHandler('all')('add', 'test.md', { ino: 200 });
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalledWith({ ino: 200, path: 'test.md' });
    });

    it('should index a new file add', async () => {
      await setup();
      getWatcherHandler('all')('add', 'new.md', { ino: 300 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ ino: 300, path: 'new.md' });
    });

    it('should index a new addDir', async () => {
      await setup();
      getWatcherHandler('all')('addDir', 'newfolder', { ino: 400 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ ino: 400, path: 'newfolder' });
    });

    it('should handle a rename with a file entry', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      adapter.files['old.md'] = { realpath: '/test-vault/old.md' };
      getWatcherHandler('all')('add', 'renamed.md', { ino: 500 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ ino: 500, path: 'renamed.md' });
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('old.md');
      expect(adapter.files['renamed.md']).toBeDefined();
      expect(adapter.files['old.md']).toBeUndefined();
      expect(onChangeMock).toHaveBeenCalledWith('renamed', 'renamed.md', 'old.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('old.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('renamed.md');
    });

    it('should handle a rename without a file entry', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      getWatcherHandler('all')('add', 'renamed.md', { ino: 500 });
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('old.md');
      expect(onChangeMock).not.toHaveBeenCalled();
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('renamed.md');
    });

    it('should delete after the timeout on unlink', async () => {
      await setup();
      vi.useFakeTimers();
      hoisted.pathInoMapStub.getIno.mockReturnValue(600);
      hoisted.pathInoMapStub.getPath.mockReturnValue('deleted.md');
      getWatcherHandler('all')('unlink', 'deleted.md');
      expect(hoisted.pathInoMapStub.deletePath).not.toHaveBeenCalledWith('deleted.md');
      vi.advanceTimersByTime(500);
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('deleted.md');
    });

    it('should delete after the timeout on unlinkDir', async () => {
      await setup();
      vi.useFakeTimers();
      hoisted.pathInoMapStub.getIno.mockReturnValue(700);
      hoisted.pathInoMapStub.getPath.mockReturnValue('deleted-dir');
      getWatcherHandler('all')('unlinkDir', 'deleted-dir');
      vi.advanceTimersByTime(500);
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('deleted-dir');
    });

    it('should delete immediately on unlink when the timeout is zero', async () => {
      await setup();
      hoisted.settings.deletionRenameDetectionTimeoutInMilliseconds = 0;
      hoisted.pathInoMapStub.getIno.mockReturnValue(600);
      hoisted.pathInoMapStub.getPath.mockReturnValue('deleted.md');
      getWatcherHandler('all')('unlink', 'deleted.md');
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('deleted.md');
    });

    it('should skip unlink when the ino is unknown', async () => {
      await setup();
      hoisted.pathInoMapStub.getIno.mockReturnValue(undefined);
      getWatcherHandler('all')('unlink', 'unknown.md');
      expect(hoisted.pathInoMapStub.deletePath).not.toHaveBeenCalled();
    });

    it('should skip deletion when the path no longer matches the ino', async () => {
      await setup();
      vi.useFakeTimers();
      hoisted.pathInoMapStub.getIno.mockReturnValue(600);
      hoisted.pathInoMapStub.getPath.mockReturnValue('different.md');
      getWatcherHandler('all')('unlink', 'deleted.md');
      vi.advanceTimersByTime(500);
      expect(hoisted.pathInoMapStub.deletePath).not.toHaveBeenCalled();
    });

    it('should forward unknown events to the original onFileChange', async () => {
      await setup();
      getWatcherHandler('all')('change', 'changed.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('changed.md');
    });
  });

  describe('handleWatcherError', () => {
    it('should print the error and forward to the original onFileChange', async () => {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      getWatcherHandler('error')(new Error('test error'));
      // The error handler runs the real printError (no throw) and forwards the root path to the original onFileChange.
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('/');
    });
  });

  describe('registerWatcher', () => {
    it('should create the watcher with the expected options', async () => {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      expect(watch).toHaveBeenCalledWith(
        '.',
        expect.objectContaining({
          atomic: true,
          cwd: '/test-vault',
          ignoreInitial: true,
          persistent: false,
          usePolling: true
        })
      );
    });

    it('should treat an empty path as the root (not ignored)', async () => {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      expect(getWatchOptions().ignored('')).toBe(false);
    });

    it('should treat a dot path as ignored', async () => {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      expect(getWatchOptions().ignored('.hidden-folder/config')).toBe(true);
    });

    it('should register a cleanup that closes the watcher on the first call', async () => {
      const component = await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      const watcher = getWatcher();
      component.unload();
      await flush();
      expect(watcher.close).toHaveBeenCalled();
    });

    it('should close the previous watcher when registering again', async () => {
      await createReadyComponent();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      const firstWatcher = getWatcher();
      await hoisted.capturedSaveSettingsHandlers[0]?.();
      expect(firstWatcher.close).toHaveBeenCalled();
    });
  });
});
