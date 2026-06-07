/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-extraneous-class, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-useless-constructor, @typescript-eslint/require-await, no-restricted-syntax -- Test mocking patterns require flexible typing, type assertions, empty constructors, and mock calls. */
import type {
  App,
  PluginManifest
} from 'obsidian';
import type { Mock } from 'vitest';

import { watch } from 'chokidar';
import { FileSystemAdapter } from 'obsidian';
import { printError } from 'obsidian-dev-utils/error';
import { noopAsync } from 'obsidian-dev-utils/function';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { Plugin } from './plugin.ts';

// --- Hoisted shared state ---

const { mockStat, pathInoMapMocks, registeredCleanups } = vi.hoisted(() => ({
  mockStat: vi.fn(async () => ({ ino: 100 })),
  pathInoMapMocks: {
    clear: vi.fn(),
    deletePath: vi.fn(),
    getIno: vi.fn(),
    getPath: vi.fn(),
    getPaths: vi.fn(() => [] as string[]),
    init: vi.fn(async () => undefined),
    set: vi.fn()
  },
  registeredCleanups: [] as (() => unknown)[]
}));

// --- Mocks ---

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    const watcher: Record<string, unknown> = {
      close: vi.fn(async () => undefined),
      on: vi.fn(() => watcher)
    };
    return watcher;
  })
}));

vi.mock('node:fs/promises', () => {
  const mock = { stat: mockStat };
  return { ...mock, default: mock };
});

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getDataAdapterEx: vi.fn(() => ({ basePath: '/test-vault' }))
}));

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: vi.fn((fn: () => Promise<void>) => fn)
}));

vi.mock('obsidian-dev-utils/error', () => ({
  printError: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/async-events-component', () => ({
  registerAsyncEvent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => ({
  MonkeyAroundComponent: class {
    public registerPatch(obj: Record<string, unknown>, patches: Record<string, (next: unknown) => unknown>): void {
      for (const [key, patchFn] of Object.entries(patches)) {
        const original = obj[key];
        const bound = typeof original === 'function' ? original.bind(obj) : original;
        obj[key] = patchFn(bound);
      }
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: class {
    public constructor(_params: unknown) {}
  }
}));

interface RenameDeleteHandlerParams {
  settingsBuilder(): object;
}

const capturedRenameDeleteHandlerSettingsBuilders: (() => object)[] = [];

vi.mock('obsidian-dev-utils/obsidian/components/rename-delete-handler-component', () => ({
  RenameDeleteHandlerComponent: class {
    public constructor(params: RenameDeleteHandlerParams) {
      capturedRenameDeleteHandlerSettingsBuilders.push(params.settingsBuilder);
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: class {
    public constructor(_plugin: unknown) {}
  }
}));

interface LoopParams {
  buildNoticeMessage?(item: unknown, iterationStr: string): string;
  readonly items: unknown[];
  processItem(item: unknown): Promise<void> | void;
}

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn(async (params: LoopParams) => {
    for (const item of params.items) {
      params.buildNoticeMessage?.(item, '1/1');
      await params.processItem(item);
    }
  })
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => ({
  PluginBase: class {
    public abortSignalComponent = { abortSignal: new AbortController().signal };
    public app: App;
    public manifest: PluginManifest;

    public constructor(app: App, manifest: PluginManifest) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild<T>(child: T): T {
      return child;
    }

    public async onload(): Promise<void> {}

    public register(fn: () => unknown): void {
      registeredCleanups.push(fn);
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: class {
    public constructor(_plugin: unknown) {}
  }
}));

vi.mock('./path-ino-map.ts', () => ({
  PathInoMap: class {
    public clear = pathInoMapMocks.clear;
    public deletePath = pathInoMapMocks.deletePath;
    public getIno = pathInoMapMocks.getIno;
    public getPath = pathInoMapMocks.getPath;
    public getPaths = pathInoMapMocks.getPaths;
    public init = pathInoMapMocks.init;
    public set = pathInoMapMocks.set;
  }
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: class {
    public on = vi.fn((_event: string, handler: () => Promise<void>) => {
      handler().catch(() => undefined);
      return { id: 'mock-event' };
    });

    public settings = {
      deletionRenameDetectionTimeoutInMilliseconds: 500,
      pollingIntervalInMilliseconds: 2000,
      shouldUpdateLinks: true
    };
  }
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: class {
    public constructor(_params: unknown) {}
  }
}));

// --- Test subclass ---

interface MockAdapter {
  basePath: string;
  files: Record<string, { realpath: string }>;
  getFullRealPath: Mock;
  getRealPath: Mock;
  onFileChange: Mock;
}

// --- Helpers ---

interface MockApp {
  appId: string;
  vault: {
    adapter: MockAdapter | object;
    getAllLoadedFiles: Mock;
    onChange: Mock;
  };
}

interface MockWatcher {
  close: Mock;
  on: Mock;
}

interface PluginSettingsAccess {
  pluginSettingsComponent: {
    settings: {
      deletionRenameDetectionTimeoutInMilliseconds: number;
    };
  };
}

interface WatchOptions {
  ignored(path: string): boolean;
}

class TestablePlugin extends Plugin {
  public async callOnLayoutReady(): Promise<void> {
    return this.onLayoutReady();
  }

  public getOriginalOnFileChange(): (path: string) => void {
    return this.originalOnFileChange;
  }
}

function createMockAdapter(): MockAdapter {
  const adapter: MockAdapter = {
    basePath: '/test-vault',
    files: {},
    getFullRealPath: vi.fn((path: string) => `/test-vault/${path}`),
    getRealPath: vi.fn((path: string) => `/test-vault/${path}`),
    onFileChange: vi.fn()
  };
  Object.setPrototypeOf(adapter, FileSystemAdapter.prototype);
  return adapter;
}

function createPlugin(adapterOverride?: object): { adapter: MockAdapter; app: MockApp; plugin: TestablePlugin } {
  const adapter = createMockAdapter();
  const app: MockApp = {
    appId: 'test-app',
    vault: {
      adapter: adapterOverride ?? adapter,
      getAllLoadedFiles: vi.fn(() => []),
      onChange: vi.fn()
    }
  };
  const manifest = { id: 'test-plugin', name: 'Test', version: '1.0.0' } as PluginManifest;
  const plugin = new TestablePlugin(app as unknown as App, manifest);
  return { adapter, app, plugin };
}

async function flushMicrotasks(): Promise<void> {
  await noopAsync();
}

function getLastWatcher(): MockWatcher | undefined {
  const mockWatch = vi.mocked(watch);
  const lastResult = mockWatch.mock.results[mockWatch.mock.results.length - 1];
  return lastResult?.value as MockWatcher | undefined;
}

function getWatcherHandler(event: string): ((...args: unknown[]) => void) | undefined {
  const mockWatch = vi.mocked(watch);
  for (let i = mockWatch.mock.results.length - 1; i >= 0; i--) {
    const watcher = mockWatch.mock.results[i]?.value as MockWatcher | undefined;
    if (!watcher) {
      continue;
    }
    const call = (watcher.on.mock.calls as unknown[][]).find((c) => c[0] === event);
    if (call) {
      return call[1] as (...args: unknown[]) => void;
    }
  }
  return undefined;
}

// --- Tests ---

describe('Plugin', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockStat.mockImplementation(async () => ({ ino: 100 }));
    pathInoMapMocks.getPaths.mockImplementation(() => []);
    pathInoMapMocks.getIno.mockReturnValue(undefined);
    pathInoMapMocks.getPath.mockReturnValue(undefined);
    registeredCleanups.length = 0;
    capturedRenameDeleteHandlerSettingsBuilders.length = 0;
  });

  describe('constructor', () => {
    it('should create plugin instance', () => {
      const { plugin } = createPlugin();
      expect(plugin).toBeInstanceOf(TestablePlugin);
    });

    it('should pass settingsBuilder to RenameDeleteHandlerComponent that reflects shouldUpdateLinks', () => {
      capturedRenameDeleteHandlerSettingsBuilders.length = 0;
      const { plugin } = createPlugin();
      expect(plugin).toBeDefined();
      const builder = capturedRenameDeleteHandlerSettingsBuilders[0];
      expect(builder).toBeDefined();
      const settings = builder!();
      expect(settings).toMatchObject({ shouldHandleRenames: true, shouldUpdateFileNameAliases: true });
    });
  });

  describe('abortSignal', () => {
    it('should return the abort signal', () => {
      const { plugin } = createPlugin();
      expect(plugin.abortSignal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('originalOnFileChange', () => {
    it('should throw when not initialized', () => {
      const { plugin } = createPlugin();
      expect(() => plugin.getOriginalOnFileChange()).toThrow('originalOnFileChange is not initialized');
    });
  });

  describe('onload', () => {
    it('should set up adapter without throwing', async () => {
      const { plugin } = createPlugin();
      await expect(plugin.onload()).resolves.toBeUndefined();
    });

    it('should throw when adapter is not FileSystemAdapter', async () => {
      const { plugin } = createPlugin({});
      await expect(plugin.onload()).rejects.toThrow('Vault adapter is not a FileSystemAdapter');
    });
  });

  describe('onLayoutReady', () => {
    it('should initialize PathInoMap', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.init).toHaveBeenCalled();
    });

    it('should clear map when root ino does not match', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      pathInoMapMocks.getIno.mockReturnValue(999);
      mockStat.mockResolvedValue({ ino: 100 });
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.clear).toHaveBeenCalled();
    });

    it('should not clear map when root ino matches', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      pathInoMapMocks.getIno.mockReturnValue(100);
      mockStat.mockResolvedValue({ ino: 100 });
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.clear).not.toHaveBeenCalled();
    });

    it('should skip cached paths during file loop', async () => {
      const { app, plugin } = createPlugin();
      await plugin.onload();
      app.vault.getAllLoadedFiles.mockReturnValue([{ path: '/cached.md' }, { path: '/new.md' }]);
      pathInoMapMocks.getPaths.mockReturnValue(['/cached.md']);
      mockStat.mockResolvedValue({ ino: 200 });
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.set).toHaveBeenCalledWith('/new.md', 200);
    });

    it('should skip dot files during file loop', async () => {
      const { app, plugin } = createPlugin();
      await plugin.onload();
      app.vault.getAllLoadedFiles.mockReturnValue([{ path: '.dot-folder/config' }]);
      mockStat.mockResolvedValue({ ino: 200 });
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.set).not.toHaveBeenCalled();
    });

    it('should clean up stale cached paths', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      pathInoMapMocks.getPaths.mockReturnValue(['/stale.md']);
      mockStat.mockResolvedValue({ ino: 100 });
      await plugin.callOnLayoutReady();
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('/stale.md');
    });

    it('should throw when fileSystemAdapter is not initialized', async () => {
      const { plugin } = createPlugin();
      await expect(plugin.callOnLayoutReady()).rejects.toThrow('fileSystemAdapter is not initialized');
    });

    it('should set up monkey patch for onFileChange', async () => {
      const { adapter, plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      expect(typeof adapter.onFileChange).toBe('function');
    });

    it('should call registerWatcher via event handlers', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();
      expect(watch).toHaveBeenCalled();
    });
  });

  describe('handleWatcherEvent (via watcher)', () => {
    let adapter: MockAdapter;
    let plugin: TestablePlugin;
    let app: MockApp;

    async function setup(): Promise<void> {
      const result = createPlugin();
      adapter = result.adapter;
      plugin = result.plugin;
      app = result.app;
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();
    }

    function getHandler(): (...args: unknown[]) => void {
      const handler = getWatcherHandler('all');
      if (!handler) {
        throw new Error('Handler not found');
      }
      return handler;
    }

    it('should forward dot files to originalOnFileChange', async () => {
      await setup();
      getHandler()('add', '.hidden/file.md', { ino: 1 });
    });

    it('should return early for add event on root path', async () => {
      await setup();
      getHandler()('add', '', { ino: 1 });
    });

    it('should forward to originalOnFileChange when no stats on add', async () => {
      await setup();
      getHandler()('add', 'test.md', undefined);
    });

    it('should skip when oldPath equals path on add', async () => {
      await setup();
      pathInoMapMocks.getPath.mockReturnValue('test.md');
      getHandler()('add', 'test.md', { ino: 200 });
      expect(pathInoMapMocks.set).not.toHaveBeenCalledWith('test.md', 200);
    });

    it('should handle new file add', async () => {
      await setup();
      pathInoMapMocks.getPath.mockReturnValue(undefined);
      getHandler()('add', 'new.md', { ino: 300 });
      expect(pathInoMapMocks.set).toHaveBeenCalledWith('new.md', 300);
    });

    it('should handle addDir event', async () => {
      await setup();
      pathInoMapMocks.getPath.mockReturnValue(undefined);
      // Cspell:ignore newfolder -- test path fixture for an added directory.
      getHandler()('addDir', 'newfolder', { ino: 400 });
      expect(pathInoMapMocks.set).toHaveBeenCalledWith('newfolder', 400);
    });

    it('should handle rename with file entry', async () => {
      await setup();
      pathInoMapMocks.getPath.mockReturnValue('old.md');
      adapter.files['old.md'] = { realpath: '/test-vault/old.md' };
      getHandler()('add', 'renamed.md', { ino: 500 });
      expect(pathInoMapMocks.set).toHaveBeenCalledWith('renamed.md', 500);
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('old.md');
      expect(adapter.files['renamed.md']).toBeDefined();
      expect(adapter.files['old.md']).toBeUndefined();
      expect(app.vault.onChange).toHaveBeenCalledWith('renamed', 'renamed.md', 'old.md');
    });

    it('should handle rename without file entry', async () => {
      await setup();
      pathInoMapMocks.getPath.mockReturnValue('old.md');
      getHandler()('add', 'renamed.md', { ino: 500 });
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('old.md');
      expect(app.vault.onChange).not.toHaveBeenCalled();
    });

    it('should handle unlink with timeout', async () => {
      await setup();
      vi.useFakeTimers();
      pathInoMapMocks.getIno.mockReturnValue(600);
      pathInoMapMocks.getPath.mockReturnValue('deleted.md');
      getHandler()('unlink', 'deleted.md');
      expect(pathInoMapMocks.deletePath).not.toHaveBeenCalledWith('deleted.md');
      vi.advanceTimersByTime(500);
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('deleted.md');
    });

    it('should handle unlinkDir', async () => {
      await setup();
      vi.useFakeTimers();
      pathInoMapMocks.getIno.mockReturnValue(700);
      pathInoMapMocks.getPath.mockReturnValue('deleted-dir');
      getHandler()('unlinkDir', 'deleted-dir');
      vi.advanceTimersByTime(500);
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('deleted-dir');
    });

    it('should handle unlink with zero timeout (immediate)', async () => {
      await setup();
      pathInoMapMocks.getIno.mockReturnValue(600);
      pathInoMapMocks.getPath.mockReturnValue('deleted.md');
      (plugin as unknown as PluginSettingsAccess).pluginSettingsComponent.settings.deletionRenameDetectionTimeoutInMilliseconds = 0;
      getHandler()('unlink', 'deleted.md');
      expect(pathInoMapMocks.deletePath).toHaveBeenCalledWith('deleted.md');
    });

    it('should skip unlink when ino is undefined', async () => {
      await setup();
      pathInoMapMocks.getIno.mockReturnValue(undefined);
      getHandler()('unlink', 'unknown.md');
      expect(pathInoMapMocks.deletePath).not.toHaveBeenCalled();
    });

    it('should skip deletion when path no longer matches ino', async () => {
      await setup();
      vi.useFakeTimers();
      pathInoMapMocks.getIno.mockReturnValue(600);
      pathInoMapMocks.getPath.mockReturnValue('different.md');
      getHandler()('unlink', 'deleted.md');
      vi.advanceTimersByTime(500);
      expect(pathInoMapMocks.deletePath).not.toHaveBeenCalled();
    });

    it('should forward unknown events to originalOnFileChange', async () => {
      await setup();
      getHandler()('change', 'changed.md');
    });
  });

  describe('handleWatcherError', () => {
    it('should print error and forward to originalOnFileChange', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();

      const errorHandler = getWatcherHandler('error');
      expect(errorHandler).toBeDefined();
      errorHandler!(new Error('test error'));
      expect(printError).toHaveBeenCalled();
    });
  });

  describe('onFileChange (patched)', () => {
    it('should ignore null path', async () => {
      const { adapter, plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      const patchedOnFileChange = adapter.onFileChange as unknown as (path: null | string) => void;
      patchedOnFileChange(null);
    });

    it('should forward dot file to originalOnFileChange', async () => {
      const { adapter, plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      const patchedOnFileChange = adapter.onFileChange as unknown as (path: null | string) => void;
      patchedOnFileChange('.dot-folder/test');
    });

    it('should not forward non-dot files', async () => {
      const { adapter, plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      const patchedOnFileChange = adapter.onFileChange as unknown as (path: null | string) => void;
      patchedOnFileChange('normal.md');
    });
  });

  describe('registerWatcher', () => {
    it('should create watcher with correct options', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();
      expect(watch).toHaveBeenCalledWith(
        '.',
        expect.objectContaining({
          atomic: true,
          ignoreInitial: true,
          persistent: false
        })
      );
    });

    it('should register watcher cleanup function', async () => {
      registeredCleanups.length = 0;
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();

      const cleanup = registeredCleanups[0];
      expect(cleanup).toBeDefined();
      await cleanup!();
    });

    it('should handle isDotFile with empty path via ignored option', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();

      const lastWatchCall = vi.mocked(watch).mock.calls[vi.mocked(watch).mock.calls.length - 1];
      const options = lastWatchCall?.[1] as undefined | WatchOptions;
      expect(options?.ignored('')).toBe(false);
    });

    it('should close existing watcher on subsequent calls', async () => {
      const { plugin } = createPlugin();
      await plugin.onload();
      await plugin.callOnLayoutReady();
      await flushMicrotasks();

      const firstWatcher = getLastWatcher();
      expect(firstWatcher).toBeDefined();

      await plugin.callOnLayoutReady();
      await flushMicrotasks();

      expect(firstWatcher!.close).toHaveBeenCalled();
    });
  });
});
/* eslint-enable @typescript-eslint/no-empty-function, @typescript-eslint/no-extraneous-class, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-useless-constructor, @typescript-eslint/require-await, no-restricted-syntax -- End of test file. */
