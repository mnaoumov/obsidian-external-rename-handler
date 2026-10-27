import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type {
  PluginNoticeComponent,
  PluginNoticeComponentDelayedNotice
} from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { Scheduler } from 'chokidar';
import type { Stats } from 'node:fs';
import type {
  App as AppOriginal,
  FileSystemAdapter as FileSystemAdapterOriginal,
  TAbstractFile
} from 'obsidian';
import type { Mock } from 'vitest';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { FSWatcher } from 'chokidar';
import {
  App,
  TFile,
  Vault
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');
const ROOT_INO = 100;

interface AppGlobal {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Each fixture installs its app on the global window.
  app: AppOriginal;
}

interface AsyncEventSource {
  readonly offref: (eventRef: unknown) => void;
}

interface ComponentPrivate {
  readonly onLayoutReady: () => Promise<void>;
  readonly originalOnFileChange: (path: null | string) => void;
}

interface EventRef {
  readonly asyncEventSource: AsyncEventSource;
}

interface FileEntry {
  readonly realpath: string;
}

interface MutablePathFile {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The rename fixture updates the file path in place.
  path: string;
}

interface PathInoMapStub {
  readonly clear: Mock<() => void>;
  readonly deletePath: Mock<(path: string) => void>;
  readonly getBirthtime: Mock<(path: string) => number | undefined>;
  readonly getIno: Mock<(path: string) => number | undefined>;
  readonly getPath: Mock<(ino: number) => string | undefined>;
  readonly getPaths: Mock<() => string[]>;
  readonly getStamp: Mock<(path: string) => Stamp | undefined>;
  readonly init: Mock<(app: AppOriginal) => Promise<void>>;
  readonly [Symbol.dispose]: Mock<() => void>;
  readonly set: Mock<(params: SetParams) => void>;
}

interface SetParams {
  readonly birthtimeMs: number;
  readonly ino: number;
  readonly path: string;
  readonly stamp?: Stamp | undefined;
}

interface Stamp {
  readonly mtime: number;
  readonly size: number;
}

interface TestAdapter {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The ignored-path test changes the vault root.
  basePath: string;
  readonly files: Record<string, FileEntry>;
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The startup test replaces path resolution for decomposed names.
  getFullPath: (path: string) => string;
  readonly onFileChange: (path: null | string) => void;
}

interface WatcherMock {
  readonly add: (paths: string | string[]) => WatcherMock;
  readonly close: () => Promise<void>;
  readonly on: (event: string, handler: (...$arguments: unknown[]) => void) => WatcherMock;
}

type WatcherOnCalls = [string, (...$arguments: unknown[]) => void][];

interface WatcherOnMock {
  readonly mock: WatcherOnMockData;
}

interface WatcherOnMockData {
  readonly calls: WatcherOnCalls;
}

interface WatchOptions {
  readonly ignored: (path: string) => boolean;
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => {
  const pathInoMapStub: PathInoMapStub = {
    clear: vi.fn(),
    deletePath: vi.fn(),
    getBirthtime: vi.fn((): number | undefined => undefined),
    getIno: vi.fn((): number | undefined => undefined),
    getPath: vi.fn((): string | undefined => undefined),
    getPaths: vi.fn((): string[] => []),
    getStamp: vi.fn((): Stamp | undefined => undefined),
    init: vi.fn((): Promise<void> => noopAsync()),
    set: vi.fn(),
    [Symbol.dispose]: vi.fn()
  };

  return {
    capturedLoadSettingsHandlers: [] as (() => Promise<void>)[],
    capturedSaveSettingsHandlers: [] as (() => Promise<void>)[],
    pathInoMapStub,
    settings: {
      deletionRenameDetectionTimeoutInMilliseconds: 500,
      pollingIntervalInMilliseconds: 2000,
      shouldDetectOfflineRenames: true
    },
    stat: vi.fn<(path: string) => Promise<Partial<Pick<Stats, 'mtimeMs' | 'size'>> & Pick<Stats, 'birthtimeMs' | 'ino'>>>(() => Promise.resolve({ birthtimeMs: 0, ino: ROOT_INO }))
  };
});

// --- Allowed mocks: non obsidian-lib / non test-mocks modules ---

vi.mock('chokidar', () => ({
  FSWatcher: vi.fn(
    class MockFSWatcher implements WatcherMock {
      public add = vi.fn((): WatcherMock => this);
      public close = vi.fn((): Promise<void> => noopAsync());
      public on = vi.fn((): WatcherMock => this);
    }
  )
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
    public getBirthtime = hoisted.pathInoMapStub.getBirthtime;
    public getIno = hoisted.pathInoMapStub.getIno;
    public getPath = hoisted.pathInoMapStub.getPath;
    public getPaths = hoisted.pathInoMapStub.getPaths;
    public getStamp = hoisted.pathInoMapStub.getStamp;
    public init = hoisted.pathInoMapStub.init;
    public set = hoisted.pathInoMapStub.set;
    public [Symbol.dispose] = hoisted.pathInoMapStub[Symbol.dispose];
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { ExternalRenameHandlerComponent } from './desktop-external-rename-handler-component.ts';

let app: AppOriginal;
let adapter: TestAdapter;
let originalOnFileChangeSpy: Mock<(path: null | string) => void>;
let capturedLayoutReadyCallback: (() => void) | undefined;
let onChangeMock: ReturnType<typeof vi.fn>;
let triggerMock: ReturnType<typeof vi.fn>;
let showNoticeMock: Mock<PluginNoticeComponent['showNotice']>;
let loadedFiles: TAbstractFile[];
let abortController: AbortController;

function createAdapter(): TestAdapter {
  originalOnFileChangeSpy = vi.fn();
  return {
    basePath: '/test-vault',
    files: {},
    getFullPath: (path: string): string => `/test-vault/${path}`,
    onFileChange: originalOnFileChangeSpy
  };
}

function createApp(): AppOriginal {
  adapter = createAdapter();
  const appMock = App.createConfigured__({ adapter: castTo<FileSystemAdapterOriginal>(adapter) });
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    capturedLayoutReadyCallback = callback;
  });
  const newApp = appMock.asOriginalType__();

  onChangeMock = vi.fn();
  seedOnRawTarget(newApp.vault, 'onChange', onChangeMock);
  seedOnRawTarget(newApp.vault, 'getAllLoadedFiles', vi.fn(() => loadedFiles));
  seedOnRawTarget(newApp.vault, 'getAbstractFileByPath', vi.fn((path: string) => loadedFiles.find((file) => file.path === path) ?? null));
  triggerMock = vi.fn();
  seedOnRawTarget(newApp.vault, 'trigger', triggerMock);
  seedOnRawTarget(
    newApp.metadataCache,
    'onCleanCache',
    vi.fn((callback: () => void) => {
      callback();
    })
  );

  castTo<AppGlobal>(window).app = newApp;
  return newApp;
}

function createComponent(): ExternalRenameHandlerComponent {
  abortController = new AbortController();
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

  showNoticeMock = vi.fn<PluginNoticeComponent['showNotice']>();
  const pluginNoticeComponent = strictProxy<PluginNoticeComponent>({
    showNotice: showNoticeMock,
    showNoticeAfterDelay: vi.fn(() =>
      strictProxy<PluginNoticeComponentDelayedNotice>({
        setContent: vi.fn(),
        [Symbol.dispose]: vi.fn()
      })
    )
  });

  return new ExternalRenameHandlerComponent({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: abortController.signal }),
    app,
    fileSystemAdapter: castTo<FileSystemAdapterOriginal>(adapter),
    pluginNoticeComponent,
    pluginSettingsComponent
  });
}

function createFile(path: string, stamp: Stamp): TAbstractFile {
  const file = TFile.create__(Vault.fromOriginalType2__(app.vault), path).asOriginalType2__();
  file.stat = { ctime: 0, ...stamp };
  return file;
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
  const instance = vi.mocked(FSWatcher).mock.instances.at(index);
  if (!instance) {
    throw new Error('Watcher was not created.');
  }
  return castTo<WatcherMock>(instance);
}

function getWatcherHandler(event: string): (...$arguments: unknown[]) => void {
  const instances = vi.mocked(FSWatcher).mock.instances;
  for (let index = instances.length - 1; index >= 0; index--) {
    const watcher = castTo<WatcherMock>(instances[index]);
    const onMock = castTo<WatcherOnMock>(watcher.on);
    const call = onMock.mock.calls.find((c) => c[0] === event);
    if (call) {
      return call[1];
    }
  }
  throw new Error(`Watcher handler for '${event}' was not registered.`);
}

function getWatchOptions(): WatchOptions {
  const calls = vi.mocked(FSWatcher).mock.calls;
  const lastCall = calls.at(-1);
  if (!lastCall) {
    throw new Error('FSWatcher was not constructed.');
  }
  return castTo<WatchOptions>(lastCall[0]);
}

function getWatchScheduler(): Scheduler {
  const lastCall = vi.mocked(FSWatcher).mock.calls.at(-1);
  if (!lastCall?.[1]) {
    throw new Error('FSWatcher was constructed without a scheduler.');
  }
  return lastCall[1];
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
    hoisted.pathInoMapStub.getBirthtime.mockReturnValue(undefined);
    hoisted.capturedLoadSettingsHandlers.length = 0;
    hoisted.capturedSaveSettingsHandlers.length = 0;
    hoisted.pathInoMapStub.getIno.mockReturnValue(undefined);
    hoisted.pathInoMapStub.getPath.mockReturnValue(undefined);
    hoisted.pathInoMapStub.getPaths.mockReturnValue([]);
    hoisted.pathInoMapStub.getStamp.mockReturnValue(undefined);
    hoisted.pathInoMapStub.init.mockResolvedValue(undefined);
    hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: ROOT_INO });
    hoisted.settings.deletionRenameDetectionTimeoutInMilliseconds = 500;
    hoisted.settings.pollingIntervalInMilliseconds = 2000;
    hoisted.settings.shouldDetectOfflineRenames = true;
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

    it('should dispose the outgoing map before replacing it on a second layout ready', async () => {
      await createReadyComponent();
      // The first run disposes the field-initialized map it replaces.
      expect(hoisted.pathInoMapStub[Symbol.dispose]).toHaveBeenCalledTimes(1);

      await triggerLayoutReady();

      // The second run disposes the map the first run opened, so no orphan keeps its connection open with its
      // debounced flush armed.
      expect(hoisted.pathInoMapStub[Symbol.dispose]).toHaveBeenCalledTimes(2);
      expect(hoisted.pathInoMapStub.init).toHaveBeenCalledTimes(2);
    });

    it('should dispose the path/ino map when the component unloads', async () => {
      const component = await createReadyComponent();
      expect(hoisted.pathInoMapStub[Symbol.dispose]).toHaveBeenCalledTimes(1);

      component.unload();

      expect(hoisted.pathInoMapStub[Symbol.dispose]).toHaveBeenCalledTimes(2);
    });

    it('should clear the map when the root ino does not match', async () => {
      hoisted.pathInoMapStub.getIno.mockReturnValue(999);
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.clear).toHaveBeenCalled();
    });

    it('should not clear the map when the root ino matches', async () => {
      hoisted.pathInoMapStub.getIno.mockReturnValue(ROOT_INO);
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.clear).not.toHaveBeenCalled();
    });

    it('should skip cached paths while indexing loaded files', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: '/cached.md' }), castTo<TAbstractFile>({ path: '/new.md' })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['/cached.md']);
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(0);
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: 200 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 200, path: '/new.md' }));
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalledWith(expect.objectContaining({ ino: 200, path: '/cached.md' }));
    });

    // Regression test for GH #5: `file.path` is normalized (NFC), so a decomposed (NFD) name on disk exists only under
    // the real path the adapter's file entry maps it to. Calling `stat` on the joined normalized path threw ENOENT once
    // per such file, each one surfacing as an unhandled error.
    it('should stat the real on-disk path the adapter maps a normalized path to', async () => {
      const normalizedPath = 'folder-й/note-й.jpg';
      const realPath = normalizedPath.normalize('NFD');
      adapter.getFullPath = (path: string): string => `/test-vault/${path === normalizedPath ? realPath : path}`;
      loadedFiles = [castTo<TAbstractFile>({ path: normalizedPath })];
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: 200 });
      await createReadyComponent();
      expect(hoisted.stat).toHaveBeenCalledWith(`/test-vault/${realPath}`);
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 200, path: normalizedPath }));
    });

    it('should skip dot files while indexing loaded files', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: '.dot-folder/config' })];
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: 200 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
    });

    it('should clean up stale cached paths', async () => {
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['/stale.md']);
      hoisted.stat.mockResolvedValue({ birthtimeMs: 0, ino: ROOT_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('/stale.md');
    });

    it('should set up the monkey patch for onFileChange', async () => {
      await createReadyComponent();
      // The real MonkeyAroundComponent replaced the original onFileChange spy with the patch wrapper.
      expect(adapter.onFileChange).not.toBe(originalOnFileChangeSpy);
      expect(typeof adapter.onFileChange).toBe('function');
    });

    // Regression test for GH #7: the settings are already loaded by the time the layout is ready, so the `loadSettings` handler
    // registered below never receives its event. When starting the watcher was left to that handler alone, no watcher was ever created
    // while the patch still suppressed Obsidian's own notifications, and every external change was silently dropped.
    it('should start the watcher without waiting for a settings event', async () => {
      await createReadyComponent();
      expect(FSWatcher).toHaveBeenCalled();
    });

    it('should register the settings event handlers so later settings changes re-register the watcher', async () => {
      await createReadyComponent();
      expect(hoisted.capturedLoadSettingsHandlers).toHaveLength(1);
      expect(hoisted.capturedSaveSettingsHandlers).toHaveLength(1);
    });
  });

  describe('offline renames', () => {
    const BIRTHTIME_MS = 1234;
    const RENAMED_INO = 200;

    function seedRename(oldPath: string, birthtimeMs: null | number = BIRTHTIME_MS): void {
      hoisted.pathInoMapStub.getPaths.mockReturnValue([oldPath]);
      hoisted.pathInoMapStub.getPath.mockImplementation((ino) => ino === RENAMED_INO ? oldPath : undefined);
      hoisted.pathInoMapStub.getBirthtime.mockImplementation((path) => path === oldPath ? birthtimeMs ?? undefined : undefined);
      // The plain `stat` carries a fraction of a millisecond, which the map does not keep.
      hoisted.stat.mockResolvedValue({ birthtimeMs: BIRTHTIME_MS + 0.75, ino: RENAMED_INO });
    }

    it('should report a file renamed while Obsidian was closed as a vault rename', async () => {
      const file = castTo<TAbstractFile>({ path: 'folder/new.md' });
      loadedFiles = [file];
      seedRename('old.md');
      await createReadyComponent();
      expect(triggerMock).toHaveBeenCalledWith('rename', file, 'old.md');
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ birthtimeMs: BIRTHTIME_MS, ino: RENAMED_INO, path: 'folder/new.md' });
      expect(showNoticeMock).toHaveBeenCalledWith('Detected 1 rename made while Obsidian was closed.');
    });

    it('should count several renames in one notice', async () => {
      const folder = castTo<TAbstractFile>({ path: 'new-folder' });
      const file = castTo<TAbstractFile>({ path: 'new-folder/note.md' });
      loadedFiles = [folder, file];
      const oldPaths = new Map([[1, 'old-folder'], [2, 'old-folder/note.md']]);
      hoisted.pathInoMapStub.getPaths.mockReturnValue([...oldPaths.values()]);
      hoisted.pathInoMapStub.getPath.mockImplementation((ino) => oldPaths.get(ino));
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      hoisted.stat.mockImplementation((path: string) => Promise.resolve({ birthtimeMs: BIRTHTIME_MS, ino: path.endsWith('note.md') ? 2 : (path.endsWith('new-folder') ? 1 : ROOT_INO) }));
      await createReadyComponent();
      expect(triggerMock.mock.calls).toEqual([['rename', folder, 'old-folder'], ['rename', file, 'old-folder/note.md']]);
      expect(showNoticeMock).toHaveBeenCalledWith('Detected 2 renames made while Obsidian was closed.');
    });

    it('should wait for the metadata cache to be clean before reporting', async () => {
      const file = castTo<TAbstractFile>({ path: 'new.md' });
      loadedFiles = [file];
      seedRename('old.md');
      let markCacheClean: (() => void) | undefined;
      seedOnRawTarget(
        app.metadataCache,
        'onCleanCache',
        vi.fn((callback: () => void) => {
          markCacheClean = callback;
        })
      );
      const component = createComponent();
      component.load();
      capturedLayoutReadyCallback?.();
      // Not `flush()`: the layout-ready work is parked on the cache on purpose, so waiting for it would never end.
      await sleep(50);
      expect(markCacheClean).toBeDefined();
      expect(triggerMock).not.toHaveBeenCalled();
      markCacheClean?.();
      await flush();
      expect(triggerMock).toHaveBeenCalledWith('rename', file, 'old.md');
    });

    // Ext4 hands a freed inode to the next new file, so a deleted note and an unrelated new one share it.
    it('should not report a reused inode whose birth time differs', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'unrelated.md' })];
      seedRename('deleted.md', BIRTHTIME_MS - 1);
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
      expect(showNoticeMock).not.toHaveBeenCalled();
    });

    it('should not report an entry written before birth times were persisted', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'new.md' })];
      seedRename('old.md', null);
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
    });

    // A hard link, or a new file created where the renamed one used to be: links to the old path still resolve.
    it('should not report a rename whose old path is still in the vault', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'old.md' }), castTo<TAbstractFile>({ path: 'new.md' })];
      seedRename('old.md');
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('should not report a rename when the setting is off, but still record the new path', async () => {
      hoisted.settings.shouldDetectOfflineRenames = false;
      loadedFiles = [castTo<TAbstractFile>({ path: 'new.md' })];
      seedRename('old.md');
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ birthtimeMs: BIRTHTIME_MS, ino: RENAMED_INO, path: 'new.md' });
    });

    it('should not report a file a live change moved on while the cache was being built', async () => {
      const file = castTo<TAbstractFile>({ path: 'new.md' });
      loadedFiles = [file];
      seedRename('old.md');
      seedOnRawTarget(
        app.metadataCache,
        'onCleanCache',
        vi.fn((callback: () => void) => {
          castTo<MutablePathFile>(file).path = 'moved-again.md';
          callback();
        })
      );
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
      expect(showNoticeMock).not.toHaveBeenCalled();
    });

    it('should not report a rename whose old path was taken again while the cache was being built', async () => {
      const file = castTo<TAbstractFile>({ path: 'new.md' });
      loadedFiles = [file];
      seedRename('old.md');
      seedOnRawTarget(
        app.metadataCache,
        'onCleanCache',
        vi.fn((callback: () => void) => {
          loadedFiles.push(castTo<TAbstractFile>({ path: 'old.md' }));
          callback();
        })
      );
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('should not report anything once the plugin has started unloading', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'new.md' })];
      seedRename('old.md');
      seedOnRawTarget(
        app.metadataCache,
        'onCleanCache',
        vi.fn((callback: () => void) => {
          abortController.abort();
          callback();
        })
      );
      await createReadyComponent();
      expect(triggerMock).not.toHaveBeenCalled();
      expect(showNoticeMock).not.toHaveBeenCalled();
    });

    it('should stat a cached path once more when it has no birth time yet', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'cached.md' })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['cached.md']);
      hoisted.stat.mockResolvedValue({ birthtimeMs: BIRTHTIME_MS, ino: RENAMED_INO });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ birthtimeMs: BIRTHTIME_MS, ino: RENAMED_INO, path: 'cached.md' });
      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('should not stat a cached folder that already has a birth time', async () => {
      loadedFiles = [castTo<TAbstractFile>({ path: 'cached' })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['cached']);
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
    });

    it('should not stat a cached file whose modification time and size are unchanged', async () => {
      const stamp = { mtime: 5000, size: 42 };
      loadedFiles = [createFile('cached.md', stamp)];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['cached.md']);
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      hoisted.pathInoMapStub.getStamp.mockReturnValue(stamp);
      await createReadyComponent();
      expect(hoisted.stat).not.toHaveBeenCalledWith('/test-vault/cached.md');
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
    });

    // Regression test: a save that swapped a new copy in for the note while Obsidian was closed gave it a new inode, and
    // the startup pass trusted the cached one, so the note's next external rename read as a delete plus a create.
    it('should record the new inode of a cached file a save replaced while Obsidian was closed', async () => {
      loadedFiles = [createFile('keep.md', { mtime: 6000, size: 43 })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['keep.md']);
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      hoisted.pathInoMapStub.getStamp.mockReturnValue({ mtime: 5000, size: 42 });
      hoisted.stat.mockResolvedValue({ birthtimeMs: BIRTHTIME_MS + 1, ino: 801, mtimeMs: 6000.4, size: 43 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({
        birthtimeMs: BIRTHTIME_MS + 1,
        ino: 801,
        path: 'keep.md',
        stamp: { mtime: 6000, size: 43 }
      });
      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('should stat a cached file once more when it has no stamp yet', async () => {
      loadedFiles = [createFile('cached.md', { mtime: 5000, size: 42 })];
      hoisted.pathInoMapStub.getPaths.mockReturnValue(['cached.md']);
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      hoisted.stat.mockResolvedValue({ birthtimeMs: BIRTHTIME_MS, ino: RENAMED_INO, mtimeMs: 5000, size: 42 });
      await createReadyComponent();
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({
        birthtimeMs: BIRTHTIME_MS,
        ino: RENAMED_INO,
        path: 'cached.md',
        stamp: { mtime: 5000, size: 42 }
      });
    });

    // A bigint `birthtimeMs` is whole milliseconds, so the plain one is truncated to match it.
    it('should record the whole milliseconds of a live add, plain or bigint', async () => {
      await createReadyComponent();
      getWatcherHandler('all')('add', 'plain.md', { birthtimeMs: BIRTHTIME_MS + 0.75, ino: 300 });
      getWatcherHandler('all')('add', 'bigint.md', { birthtimeMs: BigInt(BIRTHTIME_MS), ino: 301n });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ birthtimeMs: BIRTHTIME_MS, ino: 300, path: 'plain.md' }));
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ birthtimeMs: BIRTHTIME_MS, ino: 301, path: 'bigint.md' }));
    });
  });

  describe('handleWatcherEvent', () => {
    const BIRTHTIME_MS = 1234;

    async function setup(): Promise<void> {
      await createReadyComponent();
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
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalledWith(expect.objectContaining({ ino: 200, path: 'test.md' }));
    });

    it('should index a new file add', async () => {
      await setup();
      getWatcherHandler('all')('add', 'new.md', { ino: 300 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 300, path: 'new.md' }));
    });

    it('should index a new addDir', async () => {
      await setup();
      getWatcherHandler('all')('addDir', 'newfolder', { ino: 400 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 400, path: 'newfolder' }));
    });

    it('should handle a rename with a file entry', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      adapter.files['old.md'] = { realpath: '/test-vault/old.md' };
      getWatcherHandler('all')('add', 'renamed.md', { ino: 500 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 500, path: 'renamed.md' }));
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('old.md');
      expect(adapter.files['renamed.md']).toEqual({ realpath: 'renamed.md' });
      expect(adapter.files['old.md']).toBeUndefined();
      expect(onChangeMock).toHaveBeenCalledWith('renamed', 'renamed.md', 'old.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('old.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('renamed.md');
    });

    // Regression test for GH #5: the watcher reports the real on-disk name, which can be decomposed (NFD), while the map,
    // `adapter.files` and the vault are keyed by the normalized (NFC) one. Keying the map by the real name read an
    // external rename of such a file as a delete plus a create.
    it('should key a rename by the normalized path and hand the original onFileChange the real one', async () => {
      await setup();
      const normalizedPath = 'folder-й/renamed-й.md';
      const realPath = normalizedPath.normalize('NFD');
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      adapter.files['old.md'] = { realpath: '/test-vault/old.md' };
      getWatcherHandler('all')('add', realPath, { ino: 500 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 500, path: normalizedPath }));
      expect(adapter.files[normalizedPath]).toEqual({ realpath: realPath });
      expect(adapter.files[realPath]).toBeUndefined();
      expect(onChangeMock).toHaveBeenCalledWith('renamed', normalizedPath, 'old.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith(realPath);
    });

    it('should look up an unlink by the normalized path', async () => {
      await setup();
      hoisted.settings.deletionRenameDetectionTimeoutInMilliseconds = 0;
      const normalizedPath = 'deleted-й.md';
      const realPath = normalizedPath.normalize('NFD');
      hoisted.pathInoMapStub.getIno.mockReturnValue(600);
      hoisted.pathInoMapStub.getPath.mockReturnValue(normalizedPath);
      getWatcherHandler('all')('unlink', realPath);
      expect(hoisted.pathInoMapStub.getIno).toHaveBeenCalledWith(normalizedPath);
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith(normalizedPath);
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith(realPath);
    });

    // The polling backend of `chokidar` 6 reports a bigint inode, while the map holds the plain number `stat` returns.
    it('should match a bigint inode against the number one the map holds', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      getWatcherHandler('all')('add', 'renamed.md', { ino: 500n });
      expect(hoisted.pathInoMapStub.getPath).toHaveBeenCalledWith(500);
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ ino: 500, path: 'renamed.md' }));
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('old.md');
    });

    it('should handle a rename whose birth time matches the stored one', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('old.md');
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      adapter.files['old.md'] = { realpath: '/test-vault/old.md' };
      getWatcherHandler('all')('add', 'renamed.md', { birthtimeMs: BIRTHTIME_MS + 0.5, ino: 500 });
      expect(hoisted.pathInoMapStub.getBirthtime).toHaveBeenCalledWith('old.md');
      expect(onChangeMock).toHaveBeenCalledWith('renamed', 'renamed.md', 'old.md');
    });

    // Regression test: ext4 hands the inode of a note deleted moments ago to the next new file, and reading that as a
    // rename sent the links to the deleted note to an unrelated one.
    it('should read a reused inode whose birth time differs as a delete plus a create', async () => {
      await setup();
      hoisted.pathInoMapStub.getPath.mockReturnValue('deleted.md');
      hoisted.pathInoMapStub.getBirthtime.mockReturnValue(BIRTHTIME_MS);
      adapter.files['deleted.md'] = { realpath: '/test-vault/deleted.md' };
      getWatcherHandler('all')('add', 'created.md', { birthtimeMs: BIRTHTIME_MS + 1, ino: 500 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith(expect.objectContaining({ birthtimeMs: BIRTHTIME_MS + 1, ino: 500, path: 'created.md' }));
      expect(hoisted.pathInoMapStub.deletePath).toHaveBeenCalledWith('deleted.md');
      expect(onChangeMock).not.toHaveBeenCalled();
      expect(adapter.files['deleted.md']).toEqual({ realpath: '/test-vault/deleted.md' });
      expect(adapter.files['created.md']).toBeUndefined();
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('deleted.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('created.md');
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

    it('should forward a change without stats to the original onFileChange', async () => {
      await setup();
      getWatcherHandler('all')('change', 'changed.md');
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('changed.md');
    });

    it('should leave the map alone on a change that kept the inode and the stamp', async () => {
      await setup();
      hoisted.pathInoMapStub.getIno.mockReturnValue(800);
      hoisted.pathInoMapStub.getStamp.mockReturnValue({ mtime: 5000, size: 42 });
      getWatcherHandler('all')('change', 'changed.md', { birthtimeMs: BIRTHTIME_MS, ino: 800, mtimeMs: 5000.2, size: 42 });
      expect(hoisted.pathInoMapStub.set).not.toHaveBeenCalled();
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('changed.md');
    });

    // Kept current, the stamp spares the note a `stat` at the next start.
    it('should record the new stamp of an edit that kept the inode', async () => {
      await setup();
      hoisted.pathInoMapStub.getIno.mockReturnValue(800);
      hoisted.pathInoMapStub.getStamp.mockReturnValue({ mtime: 5000, size: 42 });
      getWatcherHandler('all')('change', 'changed.md', { birthtimeMs: BIRTHTIME_MS, ino: 800, mtimeMs: 6000, size: 50 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({
        birthtimeMs: BIRTHTIME_MS,
        ino: 800,
        path: 'changed.md',
        stamp: { mtime: 6000, size: 50 }
      });
    });

    // A bigint `mtimeMs` is truncated, so the stamp is rounded from the nanoseconds, as Obsidian rounds the plain one.
    it('should round a bigint modification time from its nanoseconds', async () => {
      await setup();
      getWatcherHandler('all')('add', 'new.md', { birthtimeMs: BigInt(BIRTHTIME_MS), ino: 900n, mtimeMs: 5000n, mtimeNs: 5_000_600_000n, size: 42n });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({
        birthtimeMs: BIRTHTIME_MS,
        ino: 900,
        path: 'new.md',
        stamp: { mtime: 5001, size: 42 }
      });
    });

    it('should record no stamp for a folder', async () => {
      await setup();
      getWatcherHandler('all')('addDir', 'folder', { birthtimeMs: BIRTHTIME_MS, ino: 901, mtimeMs: 5000, size: 0 });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ birthtimeMs: BIRTHTIME_MS, ino: 901, path: 'folder', stamp: undefined });
    });

    // Regression test: a save that renames a temp file over the note gives it a new inode, reported as a `change`. The map
    // kept the old one, so the note's next external rename arrived as an `add` of an unknown inode: a delete plus a create.
    it('should record the new inode of a note a save replaced, so its next rename is still a rename', async () => {
      await setup();
      hoisted.pathInoMapStub.getIno.mockReturnValue(800);
      getWatcherHandler('all')('change', 'keep.md', { birthtimeMs: BIRTHTIME_MS + 0.75, ino: 801n, mtimeMs: 5000n, mtimeNs: 5_000_000_000n, size: 42n });
      expect(hoisted.pathInoMapStub.set).toHaveBeenCalledWith({ birthtimeMs: BIRTHTIME_MS, ino: 801, path: 'keep.md', stamp: { mtime: 5000, size: 42 } });
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('keep.md');
    });

    it('should forward unknown events to the original onFileChange', async () => {
      await setup();
      getWatcherHandler('all')('raw', 'changed.md');
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('changed.md');
    });
  });

  describe('handleWatcherError', () => {
    it('should print the error and forward to the original onFileChange', async () => {
      await createReadyComponent();
      getWatcherHandler('error')(new Error('test error'));
      // The error handler runs the real printError (no throw) and forwards the root path to the original onFileChange.
      expect(originalOnFileChangeSpy).toHaveBeenCalledWith('/');
    });
  });

  describe('registerWatcher', () => {
    it('should create the watcher with the expected options', async () => {
      await createReadyComponent();
      expect(FSWatcher).toHaveBeenCalledWith(
        expect.objectContaining({
          alwaysStat: true,
          atomic: true,
          backend: 'polling',
          cwd: '/test-vault',
          ignoreInitial: true,
          persistent: false,
          pollingBinaryInterval: 2000,
          pollingInterval: 2000
        }),
        expect.anything()
      );
      expect(getWatcher().add).toHaveBeenCalledWith('.');
    });

    it('should use the native backend when polling is disabled', async () => {
      hoisted.settings.pollingIntervalInMilliseconds = 0;
      await createReadyComponent();
      expect(FSWatcher).toHaveBeenCalledWith(expect.objectContaining({ backend: 'auto' }), expect.anything());
      // `chokidar` 6 throws on a polling interval of 0 whatever the backend.
      expect(getWatchOptions()).not.toHaveProperty('pollingInterval');
      expect(getWatchOptions()).not.toHaveProperty('pollingBinaryInterval');
    });

    // `chokidar` 6 arms its timers with the DOM `setTimeout` unless handed a scheduler, and then fails on `unref()`.
    it('should hand the watcher a scheduler whose timers can be unreferenced and cleared', async () => {
      await createReadyComponent();
      const scheduler = getWatchScheduler();
      const callback = vi.fn();
      const timer = scheduler.setTimeout(callback, 0);
      expect(timer.unref()).toBe(timer);
      expect(timer.ref()).toBe(timer);
      scheduler.clearTimeout(timer);
      scheduler.clearTimeout(undefined);
      await sleep(10);
      expect(callback).not.toHaveBeenCalled();
      expect(scheduler.now()).toBeGreaterThan(0);
    });

    it('should treat an empty path as the root (not ignored)', async () => {
      await createReadyComponent();
      expect(getWatchOptions().ignored('')).toBe(false);
    });

    // `chokidar` 6 hands `ignored` absolute paths.
    it('should judge an absolute path by its part inside the vault', async () => {
      await createReadyComponent();
      const { ignored } = getWatchOptions();
      expect(ignored('/test-vault')).toBe(false);
      expect(ignored('/test-vault/note.md')).toBe(false);
      expect(ignored('/test-vault/.hidden-folder/config')).toBe(true);
    });

    it('should not ignore the vault for a dot folder above it', async () => {
      adapter.basePath = '/.vaults/test-vault';
      await createReadyComponent();
      const { ignored } = getWatchOptions();
      expect(ignored('/.vaults/test-vault/note.md')).toBe(false);
      expect(ignored('/.vaults')).toBe(false);
    });

    it('should treat a dot path as ignored', async () => {
      await createReadyComponent();
      expect(getWatchOptions().ignored('.hidden-folder/config')).toBe(true);
    });

    it('should register a cleanup that closes the watcher on the first call', async () => {
      const component = await createReadyComponent();
      const watcher = getWatcher();
      component.unload();
      await flush();
      expect(watcher.close).toHaveBeenCalled();
    });

    it('should close the previous watcher when the settings are reloaded', async () => {
      await createReadyComponent();
      const firstWatcher = getWatcher();
      await hoisted.capturedLoadSettingsHandlers[0]?.();
      expect(firstWatcher.close).toHaveBeenCalled();
    });

    it('should close the previous watcher when the settings are saved', async () => {
      await createReadyComponent();
      const firstWatcher = getWatcher();
      await hoisted.capturedSaveSettingsHandlers[0]?.();
      expect(firstWatcher.close).toHaveBeenCalled();
    });
  });
});
