import type {
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

// The banner row binds nothing; the two detection-tuning rows are all that is left to bind.
const EXPECTED_BOUND_PROPERTIES = [
  'pollingIntervalInMilliseconds',
  'deletionRenameDetectionTimeoutInMilliseconds'
];

const BANNER_ROW_INDEX = 0;

interface SearchableDefinition {
  searchable?: boolean;
}

interface VisibleDefinition {
  visible(): boolean;
}

let getSuggestedPluginState: ReturnType<typeof vi.fn<() => SuggestedPluginState>>;
let renderBanner: ReturnType<typeof vi.fn<(containerEl: HTMLElement) => void>>;

beforeEach(() => {
  vi.clearAllMocks();
  getSuggestedPluginState = vi.fn<() => SuggestedPluginState>(() => SuggestedPluginState.NotInstalled);
  renderBanner = vi.fn<(containerEl: HTMLElement) => void>();
});

describe('PluginSettingsTab', () => {
  it('should create the tab instance', () => {
    const tab = createTab();

    expect(tab).toBeInstanceOf(PluginSettingsTab);
  });

  it('should declare the suggestion banner row first and the detection rows after it', () => {
    const tab = createTab();

    expect(settingNames(tab)).toEqual(['', 'Polling interval in milliseconds', 'Deletion/rename detection timeout in milliseconds']);
  });

  it('should keep the banner row out of the settings search', () => {
    const tab = createTab();

    expect(castTo<SearchableDefinition>(ensureNonNullable(tab.getSettingDefinitions()[BANNER_ROW_INDEX])).searchable).toBe(false);
  });

  it('should show the banner row while the suggested plugin is not enabled', () => {
    const tab = createTab();

    expect(isBannerRowVisible(tab)).toBe(true);
  });

  it('should hide the banner row once the suggested plugin is enabled', () => {
    getSuggestedPluginState.mockReturnValue(SuggestedPluginState.Enabled);
    const tab = createTab();

    expect(isBannerRowVisible(tab)).toBe(false);
  });

  it('should render the banner into an emptied row element', () => {
    const tab = createTab();
    const setting = new SettingEx(tab.containerEl);
    setting.setName('Leftover');

    renderRow(tab, BANNER_ROW_INDEX, setting);

    expect(renderBanner).toHaveBeenCalledWith(setting.settingEl);
    expect(setting.settingEl.textContent).toBe('');
  });

  it('should declare every setting and bind it to the correct property when rendered', () => {
    const tab = createTab();
    // The number settings chain `.setMin(0)` off the result of `bind()`, so the spy must return the component.
    const bindSpy = vi.spyOn(tab, 'bind').mockImplementation((params) => params.valueComponent);

    const definitions = tab.getSettingDefinitions();
    for (const definition of definitions) {
      if ('render' in definition) {
        definition.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
      }
    }

    expect(bindSpy.mock.calls.map((call) => call[0].propertyName)).toEqual(EXPECTED_BOUND_PROPERTIES);
    expect(definitions.length).toBe(EXPECTED_BOUND_PROPERTIES.length + 1);
  });
});

function createTab(): PluginSettingsTab {
  const pluginSettingsComponent = strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ id: 'ref' }),
    settings: new PluginSettings(),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages: {
        deletionRenameDetectionTimeoutInMilliseconds: '',
        isAdvancedRenameAndDeleteHandlerSuggestionDeclined: '',
        pollingIntervalInMilliseconds: '',
        proposedShouldHandleRenames: ''
      }
    }
  });

  const plugin = strictProxy<Plugin>({
    app: {
      workspace: {
        on: vi.fn().mockReturnValue({ id: 'test' })
      }
    }
  });

  const tab = new PluginSettingsTab({
    plugin,
    pluginSettingsComponent,
    pluginSuggestionComponent: strictProxy<PluginSuggestionComponent>({
      getSuggestedPluginState,
      renderBanner
    })
  });
  tab.containerEl = activeWindow.createDiv();
  return tab;
}

/**
 * Evaluates the banner row's `visible` predicate the way Obsidian does on every render.
 *
 * @param tab - The settings tab.
 * @returns Whether the row would be rendered.
 */
function isBannerRowVisible(tab: PluginSettingsTab): boolean {
  const visible = castTo<VisibleDefinition>(ensureNonNullable(tab.getSettingDefinitions()[BANNER_ROW_INDEX])).visible;
  return visible();
}

/**
 * Invokes one declared row's `render` callback the way Obsidian does when the tab is opened, so the rows are
 * still exercised now that they are declarative.
 *
 * @param tab - The settings tab.
 * @param index - The index of the row.
 * @param setting - The setting to render into.
 */
function renderRow(tab: PluginSettingsTab, index: number, setting: SettingEx): void {
  const definition = ensureNonNullable(tab.getSettingDefinitions()[index]);
  if (!('render' in definition)) {
    throw new Error(`The setting definition at index ${String(index)} does not render.`);
  }

  definition.render(setting, castTo<SettingGroup>(null));
}

/**
 * Reads the names of the declared rows.
 *
 * @param tab - The settings tab.
 * @returns The names.
 */
function settingNames(tab: PluginSettingsTab): string[] {
  return tab.getSettingDefinitions().map((definition) => 'name' in definition ? definition.name : '');
}
