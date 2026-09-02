import type {
  App as AppOriginal,
  FileSystemAdapter as FileSystemAdapterOriginal,
  PluginManifest
} from 'obsidian';

import { FileSystemAdapter } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

const PLUGIN_ID = 'external-rename-handler';

interface AppGlobal {
  app: AppOriginal;
}

interface ComponentModuleActual {
  Component: new () => object;
}

interface PluginsLike {
  enabledPlugins: Set<string>;
  getPlugin: ReturnType<typeof vi.fn>;
  manifests: Record<string, unknown>;
}

interface PluginsMock {
  plugins: PluginsLike;
}

interface PluginSuggestionComponentParams {
  isSuggestionDeclined(this: void): boolean;
  setSuggestionDeclined(this: void, isDeclined: boolean): Promise<void>;
  readonly suggestedPluginId: string;
}

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

// --- Allowed mocks: the plugin's OWN sibling modules ---

vi.mock('./external-rename-handler-component.ts', async () => {
  // The real addChild eagerly LOADS this child, so it must extend the real (test-mocks) Component.
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class ExternalRenameHandlerComponent extends Component {}
  return { ExternalRenameHandlerComponent };
});

vi.mock('./plugin-settings-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  const { PluginSettings } = await vi.importActual<typeof import('./plugin-settings.ts')>('./plugin-settings.ts');
  class PluginSettingsComponent extends Component {
    public settings = new PluginSettings();

    public editAndSave(settingsEditor: (settings: object) => void): Promise<void> {
      settingsEditor(this.settings);
      // eslint-disable-next-line obsidian-dev-utils/prefer-noop-async -- a hoisted vi.mock factory cannot reach a top-level import.
      return Promise.resolve();
    }
  }
  return { PluginSettingsComponent };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('./rename-delete-handler-migration-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class RenameDeleteHandlerMigrationComponent extends Component {}
  return { RenameDeleteHandlerMigrationComponent };
});

// Capture the `PluginSuggestionComponent` constructor argument so the closures the plugin hands it — the
// Declined-flag getter and setter — can be invoked directly. The stub returns a fresh real `Component` so
// The real `PluginBase` lifecycle can load it as a child without reaching the community-plugin registry.
const { pluginSuggestionStub } = vi.hoisted(() => ({
  pluginSuggestionStub: vi.fn<(params: PluginSuggestionComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-suggestion-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/plugin-suggestion-component')>();
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  pluginSuggestionStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    PluginSuggestionComponent: pluginSuggestionStub
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede the import of the module under test.
import { Plugin } from './plugin.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { RenameDeleteHandlerMigrationComponent } from './rename-delete-handler-migration-component.ts';

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
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  // The strict App mock throws on an unmocked member, so `plugins` is assigned wholesale before use. The
  // Suggestion component reads the registry on layout-ready to decide whether there is anything to suggest.
  castTo<PluginsMock>(appMock).plugins = {
    enabledPlugins: new Set<string>(),
    getPlugin: vi.fn().mockReturnValue(null),
    manifests: {}
  };
  const newApp = appMock.asOriginalType__();

  castTo<AppGlobal>(window).app = newApp;
  return newApp;
}

async function createLoadedPlugin(): Promise<Plugin> {
  const plugin = new Plugin(app, manifest);
  // PluginBase.onload is async; the sync mock Component.load() would not await it, so the real async load path is driven directly.
  await plugin.onload();
  return plugin;
}

function suggestionParams(): PluginSuggestionComponentParams {
  return ensureNonNullable(pluginSuggestionStub.mock.calls[0])[0];
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('onloadImpl', () => {
    it('should load the plugin without throwing', async () => {
      const plugin = await createLoadedPlugin();
      expect(plugin).toBeInstanceOf(Plugin);
    });

    it('should add the plugin\'s own sibling child components', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');

      await plugin.onload();

      const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
      expect(addedChildren.some((child) => child instanceof PluginSettingsComponent)).toBe(true);
      expect(addedChildren.some((child) => child instanceof PluginSettingsTabComponent)).toBe(true);
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

    // Advanced Rename and Delete Handler owns rename/delete handling since 4.0.0. Two handlers acting on one
    // Rename corrupts links, so this plugin must register none — the inverse of what it used to assert.
    it('should not construct a rename/delete handler of its own', async () => {
      const renameDeleteHandlerModule = await import('obsidian-dev-utils/obsidian/components/rename-delete-handler-component');
      const renameDeleteHandlerSpy = vi.spyOn(renameDeleteHandlerModule, 'RenameDeleteHandlerComponent');

      await createLoadedPlugin();

      expect(renameDeleteHandlerSpy).not.toHaveBeenCalled();
    });

    it('should suggest Advanced Rename and Delete Handler instead', async () => {
      await createLoadedPlugin();

      expect(pluginSuggestionStub).toHaveBeenCalled();
      expect(suggestionParams().suggestedPluginId).toBe('advanced-rename-and-delete-handler');
    });

    it('should report the suggestion as not declined until the user says otherwise', async () => {
      await createLoadedPlugin();

      expect(suggestionParams().isSuggestionDeclined()).toBe(false);
    });

    it('should remember a declined suggestion in its own settings', async () => {
      await createLoadedPlugin();
      const params = suggestionParams();

      await params.setSuggestionDeclined(true);

      expect(params.isSuggestionDeclined()).toBe(true);
    });

    it('should offer the legacy link-update setting to the new owner', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');

      await plugin.onload();

      const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
      expect(addedChildren.some((child) => child instanceof RenameDeleteHandlerMigrationComponent)).toBe(true);
    });
  });
});
