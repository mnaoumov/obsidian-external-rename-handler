import type {
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

const EXPECTED_BOUND_PROPERTIES = [
  'shouldUpdateLinks',
  'pollingIntervalInMilliseconds',
  'deletionRenameDetectionTimeoutInMilliseconds'
];

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
        pollingIntervalInMilliseconds: '',
        shouldUpdateLinks: ''
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

  const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
  tab.containerEl = activeWindow.createDiv();
  return tab;
}

describe('PluginSettingsTab', () => {
  it('should create the tab instance', () => {
    const tab = createTab();

    expect(tab).toBeInstanceOf(PluginSettingsTab);
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
    expect(definitions.length).toBe(EXPECTED_BOUND_PROPERTIES.length);
  });
});
