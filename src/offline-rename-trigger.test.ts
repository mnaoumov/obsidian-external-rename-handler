import type { EventsEntry } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  TAbstractFile
} from 'obsidian';
import type { Mock } from 'vitest';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { triggerOfflineRename } from './offline-rename-trigger.ts';

interface FakeApp {
  readonly app: App;
  readonly vault: FakeVault;
}

interface FakeSync {
  readonly boundOnFileRename?: Listener;
  readonly localFiles?: Readonly<Record<string, unknown>>;
}

interface FakeVault {
  readonly _: Readonly<Record<string, EventsEntry[]>>;
  readonly trigger: Mock;
  readonly tryTrigger: Mock;
}

type Listener = (...listenerArguments: unknown[]) => unknown;

const FILE = castTo<TAbstractFile>({ path: 'new.md' });
const OLD_PATH = 'old.md';

function createApp(sync: FakeSync | null, listeners: null | readonly Listener[]): FakeApp {
  const vault: FakeVault = {
    // eslint-disable-next-line unicorn/name-replacements -- `ctx` and `fn` are the names core's events entries use.
    _: listeners ? { rename: listeners.map((listener) => castTo<EventsEntry>({ ctx: null, fn: listener })) } : {},
    trigger: vi.fn(),
    tryTrigger: vi.fn((entry: EventsEntry, listenerArguments: unknown[]) => {
      try {
        entry.fn.apply(entry.ctx, listenerArguments);
      } catch {
        // `Events.tryTrigger` re-throws from a timer, so the throw never reaches the caller.
      }
    })
  };
  const app = castTo<App>({
    internalPlugins: {
      getEnabledPluginById: vi.fn(() => sync)
    },
    vault
  });
  return { app, vault };
}

describe('triggerOfflineRename', () => {
  it('should trigger the vault event when Sync is not enabled', () => {
    const { app, vault } = createApp(null, []);
    triggerOfflineRename(app, FILE, OLD_PATH);
    expect(vault.trigger).toHaveBeenCalledWith('rename', FILE, OLD_PATH);
    expect(vault.tryTrigger).not.toHaveBeenCalled();
  });

  it('should trigger the vault event when Sync still tracks the old path', () => {
    const syncListener = vi.fn();
    const { app, vault } = createApp({ boundOnFileRename: syncListener, localFiles: { [OLD_PATH]: {} } }, [syncListener]);
    triggerOfflineRename(app, FILE, OLD_PATH);
    expect(vault.trigger).toHaveBeenCalledWith('rename', FILE, OLD_PATH);
  });

  it('should trigger the vault event when Sync has no rename listener', () => {
    const { app, vault } = createApp({ localFiles: {} }, []);
    triggerOfflineRename(app, FILE, OLD_PATH);
    expect(vault.trigger).toHaveBeenCalledWith('rename', FILE, OLD_PATH);
  });

  it('should trigger the vault event when Sync has no local file map', () => {
    const { app, vault } = createApp({ boundOnFileRename: vi.fn() }, []);
    triggerOfflineRename(app, FILE, OLD_PATH);
    expect(vault.trigger).toHaveBeenCalledWith('rename', FILE, OLD_PATH);
  });

  it('should skip only the Sync listener, in order, when Sync no longer tracks the old path', () => {
    const calls: string[] = [];
    const first = vi.fn(() => {
      calls.push('first');
    });
    const syncListener = vi.fn(() => {
      calls.push('sync');
    });
    const last = vi.fn(() => {
      calls.push('last');
    });
    const { app, vault } = createApp({ boundOnFileRename: syncListener, localFiles: { [FILE.path]: {} } }, [first, syncListener, last]);

    triggerOfflineRename(app, FILE, OLD_PATH);

    expect(vault.trigger).not.toHaveBeenCalled();
    expect(syncListener).not.toHaveBeenCalled();
    expect(calls).toEqual(['first', 'last']);
    expect(first).toHaveBeenCalledWith(FILE, OLD_PATH);
  });

  it('should keep calling the later listeners when one throws', () => {
    const syncListener = vi.fn();
    const throwing = vi.fn(() => {
      throw new Error('listener failed');
    });
    const last = vi.fn();
    const { app } = createApp({ boundOnFileRename: syncListener, localFiles: {} }, [throwing, syncListener, last]);

    triggerOfflineRename(app, FILE, OLD_PATH);

    expect(throwing).toHaveBeenCalled();
    expect(last).toHaveBeenCalledWith(FILE, OLD_PATH);
  });

  it('should do nothing when no rename listener is registered', () => {
    const { app, vault } = createApp({ boundOnFileRename: vi.fn(), localFiles: {} }, null);
    triggerOfflineRename(app, FILE, OLD_PATH);
    expect(vault.trigger).not.toHaveBeenCalled();
    expect(vault.tryTrigger).not.toHaveBeenCalled();
  });
});
