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

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

const PLUGIN_ID = 'external-rename-handler';

interface AppGlobal {
  app: AppOriginal;
}

interface ComponentModuleActual {
  Component: new () => object;
}

interface PluginsLike {
  manifests: Record<string, unknown>;
}

interface PluginSuggestionComponentParams {
  isSuggestionDeclined(this: void): boolean;
  setSuggestionDeclined(this: void, isDeclined: boolean): Promise<void>;
  readonly suggestedPluginId: string;
}

interface SettingsMigrationComponentParams {
  readonly apiVersionRange: string;
  getProposedSettings(this: void): MigratableSettings | null;
  readonly providerPluginId: string;
  retireProposedSettings(this: void): Promise<void>;
  readonly sourcePluginId: string;
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

// Capture the `PluginSuggestionComponent` constructor argument so the closures the plugin hands it — the
// Declined-flag getter and setter — can be invoked directly. The stub returns a fresh real `Component` so
// The real `PluginBase` lifecycle can load it as a child without reaching the community-plugin registry.
const { pluginSuggestionStub } = vi.hoisted(() => ({
  pluginSuggestionStub: vi.fn<(params: PluginSuggestionComponentParams) => object>()
}));

// The same treatment for the dev-utils settings-migration component. What is this plugin's own is the pair
// Of closures it hands over — which pending value is offered, and how the retirement is persisted — so they
// Are captured and invoked directly. The offer-and-retire dance around them belongs to dev-utils and is
// Tested there.
const { settingsMigrationStub } = vi.hoisted(() => ({
  settingsMigrationStub: vi.fn<(params: SettingsMigrationComponentParams) => object>()
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

vi.mock('obsidian-dev-utils/obsidian/components/settings-migration-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/settings-migration-component')>();
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  settingsMigrationStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    SettingsMigrationComponent: settingsMigrationStub
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
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
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  // The suggestion component reads the registry on layout-ready to decide whether there is anything to
  // Suggest. obsidian-test-mocks models `getPlugin` and `enabledPlugins`, but leaves `manifests` to throw,
  // So only that one is seeded - on the real registry rather than replacing it.
  castTo<PluginsLike>(appMock.plugins).manifests = {};
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

// The plugin's settings component is protected on `PluginBase`, so the instance the plugin actually handed
// To the migration component is taken from the children it added.
async function loadPluginWithSettingsComponent(): Promise<PluginSettingsComponent> {
  const plugin = new Plugin(app, manifest);
  const addChildSpy = vi.spyOn(plugin, 'addChild');

  await plugin.onload();

  const settingsComponent = addChildSpy.mock.calls
    .map((call) => call[0])
    .find((child) => child instanceof PluginSettingsComponent);
  return ensureNonNullable(settingsComponent);
}

function migrationParams(): SettingsMigrationComponentParams {
  return ensureNonNullable(settingsMigrationStub.mock.calls[0])[0];
}

// The settings are read-only from the outside, so a pending value is arranged the same way the plugin
// Itself writes one.
async function setPending(settingsComponent: PluginSettingsComponent, shouldHandleRenames: boolean): Promise<void> {
  await settingsComponent.editAndSave((settings) => {
    settings.proposedShouldHandleRenames = shouldHandleRenames;
  });
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
      await createLoadedPlugin();

      expect(settingsMigrationStub).toHaveBeenCalledOnce();
      expect(migrationParams().providerPluginId).toBe('advanced-rename-and-delete-handler');
      expect(migrationParams().sourcePluginId).toBe(PLUGIN_ID);
      expect(migrationParams().apiVersionRange).toBe('^1');
    });

    it('should offer nothing while no legacy value is pending', async () => {
      await createLoadedPlugin();

      expect(migrationParams().getProposedSettings()).toBeNull();
    });

    it('should offer the pending value once the settings carry one', async () => {
      const settingsComponent = await loadPluginWithSettingsComponent();

      await setPending(settingsComponent, true);

      expect(migrationParams().getProposedSettings()).toEqual({ shouldHandleRenames: true });
    });

    // `false` is a value the user chose, not an absent one, so it has to travel.
    it('should offer a pending value of false rather than treating it as absent', async () => {
      const settingsComponent = await loadPluginWithSettingsComponent();

      await setPending(settingsComponent, false);

      expect(migrationParams().getProposedSettings()).toEqual({ shouldHandleRenames: false });
    });

    // Retiring through `editAndSave` rather than `setProperty` is what makes the retirement outlive a
    // Reload; the in-memory-only variant would offer the migration again forever.
    it('should retire the pending value to disk once the migration is applied', async () => {
      const settingsComponent = await loadPluginWithSettingsComponent();
      await setPending(settingsComponent, true);
      const editAndSaveSpy = vi.spyOn(settingsComponent, 'editAndSave');

      await migrationParams().retireProposedSettings();

      expect(editAndSaveSpy).toHaveBeenCalledOnce();
      expect(migrationParams().getProposedSettings()).toBeNull();
    });
  });
});
