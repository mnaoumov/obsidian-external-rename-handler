/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-useless-constructor, no-restricted-syntax -- Test mocks require empty constructors and flexible patterns. */
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-settings-tab', () => ({
  PluginSettingsTabBase: class {
    public containerEl = activeDocument.createElement('div');

    public constructor(_params: unknown) {}

    public bind(component: unknown, _property: string): unknown {
      return component;
    }

    public display(): void {}
  }
}));

vi.mock('obsidian-dev-utils/obsidian/setting-ex', () => ({
  SettingEx: class {
    public constructor(el: HTMLElement) {
      el.appendChild(activeDocument.createElement('div'));
    }

    public addNumber(cb: (component: { setMin(min: number): unknown }) => void): unknown {
      const component = { setMin: vi.fn(() => component) };
      cb(component);
      return this;
    }

    public addToggle(cb: (toggle: object) => void): unknown {
      cb({});
      return this;
    }

    public setDesc(_desc: unknown): unknown {
      return this;
    }

    public setName(_name: string): unknown {
      return this;
    }
  }
}));

describe('PluginSettingsTab', () => {
  function createSettingsTab(): PluginSettingsTab {
    return new PluginSettingsTab(castTo<PluginSettingsTabBaseConstructorParams<PluginSettings>>({}));
  }

  it('should create an instance', () => {
    const tab = createSettingsTab();
    expect(tab).toBeInstanceOf(PluginSettingsTab);
  });

  it('should render settings in display()', () => {
    const tab = createSettingsTab();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Testing display() which is deprecated but still the mechanism used by PluginSettingsTabBase.
    tab.display();
    expect(tab.containerEl.children.length).toBeGreaterThan(0);
  });
});
/* eslint-enable @typescript-eslint/no-empty-function, @typescript-eslint/no-useless-constructor, no-restricted-syntax -- End of test file. */
