import type {
  App as AppOriginal,
  FileSystemAdapter as FileSystemAdapterOriginal,
  PluginManifest
} from 'obsidian';

import {
  Component,
  FileSystemAdapter
} from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getObsidianDevUtilsState } from 'obsidian-dev-utils/obsidian-dev-utils-state';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const PLUGIN_ID = 'external-rename-handler';
const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

interface AppGlobal {
  app: AppOriginal;
}

interface AsyncEventSource {
  offref(eventRef: unknown): void;
}

interface EventRef {
  asyncEventSource: AsyncEventSource;
}

interface RenameDeleteSettingsProbe {
  shouldHandleRenames: boolean;
  shouldUpdateFileNameAliases: boolean;
}

type SettingsBuilder = () => RenameDeleteSettingsProbe;

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  settings: {
    shouldUpdateLinks: true
  }
}));

// --- Allowed mocks: the plugin's OWN sibling modules ---

vi.mock('./external-rename-handler-component.ts', () => ({
  // The real addChild eagerly LOADS this child, so it must extend the real (test-mocks) Component.
  ExternalRenameHandlerComponent: class extends Component {
    public constructor(_params: unknown) {
      super();
    }
  }
}));

vi.mock('./plugin-settings-component.ts', () => ({
  // The real addChild eagerly LOADS this child, so it must extend the real (test-mocks) Component.
  PluginSettingsComponent: class extends Component {
    public on = vi.fn((): EventRef => // The real registerAsyncEvent calls eventRef.asyncEventSource.offref(eventRef) on unload.
    ({ asyncEventSource: { offref: vi.fn() } }));

    public settings = hoisted.settings;

    public constructor(_params: unknown) {
      super();
    }
  }
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Stub only passed to the real PluginSettingsTabComponent.
  PluginSettingsTab: class {
    public constructor(_params: unknown) {
      noop();
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { Plugin } from './plugin.ts';

const manifest = castTo<PluginManifest>({
  author: 'test',
  description: 'test',
  id: PLUGIN_ID,
  minAppVersion: '1.0.0',
  name: 'External Rename Handler',
  version: '1.0.0'
});

let app: AppOriginal;

function createAdapter(): object {
  const adapter = { onFileChange: vi.fn() };
  // The source checks `app.vault.adapter instanceof FileSystemAdapter` (the real obsidian API class, aliased to test-mocks).
  Object.setPrototypeOf(adapter, FileSystemAdapter.prototype);
  return adapter;
}

function createApp(adapterOverride?: object): AppOriginal {
  const adapter = createAdapter();
  const appMock = App.createConfigured__({ adapter: castTo<FileSystemAdapterOriginal>(adapterOverride ?? adapter) });
  const newApp = appMock.asOriginalType__();

  // The real RenameDeleteHandlerComponent monkey-patches FileManager.runAsyncLinkUpdate during onload.
  seedOnRawTarget(newApp.fileManager, 'runAsyncLinkUpdate', vi.fn((handler: (updates: unknown[]) => Promise<void>) => handler([])));

  castTo<AppGlobal>(window).app = newApp;
  return newApp;
}

async function createLoadedPlugin(): Promise<Plugin> {
  const plugin = new Plugin(app, manifest);
  // PluginBase.onload is async; the sync mock Component.load() would not await it, so the real async load path is driven directly.
  await plugin.onload();
  return plugin;
}

function getRegisteredSettingsBuilder(): SettingsBuilder {
  const renameDeleteHandlersMap = getObsidianDevUtilsState('renameDeleteHandlersMap', new Map<string, SettingsBuilder>()).value;
  const builder = renameDeleteHandlersMap.get(PLUGIN_ID);
  if (!builder) {
    throw new Error('Rename/delete settings builder was not registered.');
  }
  return builder;
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const rawTarget = castTo<object | undefined>(Reflect.get(strictProxiedObject, STRICT_PROXY_TARGET_SYMBOL)) ?? strictProxiedObject;
  Reflect.set(rawTarget, key, value);
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.settings.shouldUpdateLinks = true;
    app = createApp();
  });

  describe('onloadImpl', () => {
    it('should load the plugin without throwing', async () => {
      const plugin = await createLoadedPlugin();
      expect(plugin).toBeInstanceOf(Plugin);
    });

    it('should register the settings tab', async () => {
      const plugin = await createLoadedPlugin();
      expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(1);
    });

    it('should register the open demo vault command via its command handler', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();
      expect(addCommandSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'open-demo-vault' })
      );
    });

    it('should throw when the vault adapter is not a FileSystemAdapter', async () => {
      app = createApp({});
      const plugin = new Plugin(app, manifest);
      await expect(plugin.onload()).rejects.toThrow('Vault adapter is not a FileSystemAdapter');
    });

    it('should register a rename/delete settings builder', async () => {
      await createLoadedPlugin();
      const settings = getRegisteredSettingsBuilder()();
      expect(settings).toMatchObject({
        shouldHandleRenames: true,
        shouldUpdateFileNameAliases: true
      });
    });

    it('should reflect shouldUpdateLinks in the settings builder', async () => {
      await createLoadedPlugin();
      hoisted.settings.shouldUpdateLinks = false;
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.shouldHandleRenames).toBe(false);
    });
  });
});
