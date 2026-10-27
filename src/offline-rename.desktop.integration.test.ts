import {
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

// Under the transport's ~30s per-closure cap, as in `external-change-detection.desktop.integration.test.ts`.
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

const PLUGIN_ID = 'external-rename-handler';
const ORIGINAL_NOTE_PATH = 'offline-rename-original.md';
const RENAMED_NOTE_PATH = 'offline-rename-renamed.md';
// A dot file, so that neither Obsidian nor the plugin indexes the copy before it is swapped in.
const REPLACEMENT_TEMP_PATH = '.offline-rename-replacement.tmp';
const REPLACED_CONTENT = 'content replaced by a save that swapped a new copy in';

interface ComponentTreeNode {
  readonly _children?: ComponentTreeNode[];
  readonly watcher?: null | WatcherSlice;
}

interface RenameRecord {
  readonly newPath: string;
  readonly oldPath: string;
}

interface RenameRecorderWindow {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Each test resets the shared listener's recorded renames.
  offlineRenameRecords?: RenameRecord[];
}

interface WatcherSlice {
  readonly readyEmitted: boolean;
}

function getFullPath(path: string): string {
  return join(getTemporaryVault().path, path);
}

async function setPluginEnabled(isEnabled: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, isEnabled: shouldEnable, pluginId }) {
      if (shouldEnable) {
        await app.plugins.enablePlugin(pluginId);
      } else {
        await app.plugins.disablePlugin(pluginId);
      }
    },
    input: { isEnabled, pluginId: PLUGIN_ID },
    vaultPath: getTemporaryVault().path
  });
}

async function startRecordingRenames(): Promise<void> {
  await evalInObsidian({
    callback({ app }) {
      const recorderWindow = window as RenameRecorderWindow;
      // One listener for the whole run: each test only empties the records, so none counts a rename twice.
      const isListening = recorderWindow.offlineRenameRecords !== undefined;
      recorderWindow.offlineRenameRecords = [];
      if (isListening) {
        return;
      }
      app.vault.on('rename', (file, oldPath) => {
        recorderWindow.offlineRenameRecords?.push({ newPath: file.path, oldPath });
      });
    },
    input: {},
    vaultPath: getTemporaryVault().path
  });
}

async function waitForRecordedRename(record: RenameRecord): Promise<RenameRecord[]> {
  return await evalInObsidian({
    async callback({ lib: { waitUntil }, newPath, oldPath, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      const recorderWindow = window as RenameRecorderWindow;
      await waitUntil({
        message: `No vault rename ${oldPath} -> ${newPath} was reported`,
        predicate: () => recorderWindow.offlineRenameRecords?.some((r) => r.newPath === newPath && r.oldPath === oldPath) ?? false,
        timeoutInMilliseconds
      });
      return recorderWindow.offlineRenameRecords ?? [];
    },
    input: { ...record, WAIT_TIMEOUT_IN_MILLISECONDS },
    vaultPath: getTemporaryVault().path
  });
}

async function waitForVaultToSee(path: string, shouldExist: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath, shouldExist: isExpectedToExist, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `The vault ${isExpectedToExist ? 'never saw' : 'still sees'} the note ${notePath}`,
        predicate: () => (app.vault.getAbstractFileByPath(notePath) !== null) === isExpectedToExist,
        timeoutInMilliseconds
      });
    },
    input: {
      path,
      shouldExist,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

async function waitForVaultToSeeSize(path: string, size: number): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath, size: expectedSize, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `The vault never saw the note ${notePath} at ${String(expectedSize)} bytes`,
        predicate: () => app.vault.getFileByPath(notePath)?.stat.size === expectedSize,
        timeoutInMilliseconds
      });
    },
    input: {
      path,
      size,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

// The watcher starts only once the startup pass is done, so its readiness is when the pass has refreshed the map.
async function waitForWatcherReady(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      function hasReadyWatcher(node: ComponentTreeNode | undefined): boolean {
        return node?.watcher?.readyEmitted === true || (node?._children ?? []).some((child) => hasReadyWatcher(child));
      }

      await waitUntil({
        message: 'The watcher never became ready',
        predicate: () => hasReadyWatcher(app.plugins.getPlugin(pluginId) as ComponentTreeNode | null ?? undefined),
        timeoutInMilliseconds
      });
    },
    input: { pluginId: PLUGIN_ID, WAIT_TIMEOUT_IN_MILLISECONDS },
    vaultPath: getTemporaryVault().path
  });
}

describe('Renames made while the plugin was not running', () => {
  afterEach(async () => {
    await setPluginEnabled(true);
    await rm(getFullPath(REPLACEMENT_TEMP_PATH), { force: true });
    await rm(getFullPath(ORIGINAL_NOTE_PATH), { force: true });
    await rm(getFullPath(RENAMED_NOTE_PATH), { force: true });
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, false);
    await waitForVaultToSee(RENAMED_NOTE_PATH, false);
  });

  it('imports the legacy device observations and detects an offline rename without vault data files', async () => {
    await writeFile(getFullPath(ORIGINAL_NOTE_PATH), 'legacy content', 'utf-8');
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, true);
    await setPluginEnabled(false);
    const rootStats = await stat(getFullPath(''));
    const noteStats = await stat(getFullPath(ORIGINAL_NOTE_PATH));
    await rename(getFullPath(ORIGINAL_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));
    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, false);
    await evalInObsidian({
      async callback({ app, entries }) {
        // This is the isolated harness vault. Removing its new store simulates the first upgraded startup.
        await new Promise<void>((resolve, reject) => {
          const request = window.indexedDB.deleteDatabase(`obsidian-lib:${JSON.stringify([app.appId, 'external-rename-handler', 'path-ino-v1'])}`);
          request.addEventListener('success', () => {
            resolve();
          });
          request.addEventListener('error', () => {
            reject(new Error('Could not reset the test store'));
          });
        });
        await new Promise<void>((resolve, reject) => {
          const request = window.indexedDB.deleteDatabase(`${app.appId}/external-rename-handler`);
          request.addEventListener('success', () => {
            resolve();
          });
          request.addEventListener('error', () => {
            reject(new Error('Could not reset the legacy test store'));
          });
        });
        await new Promise<void>((resolve, reject) => {
          const request = window.indexedDB.open(`${app.appId}/external-rename-handler`, 1);
          request.addEventListener('upgradeneeded', () => {
            request.result.createObjectStore('path-ino', { keyPath: 'path' });
          });
          request.addEventListener('error', () => {
            reject(new Error('Could not seed legacy observations'));
          });
          request.addEventListener('success', () => {
            const database = request.result;
            const transaction = database.transaction('path-ino', 'readwrite');
            const store = transaction.objectStore('path-ino');
            store.clear();
            for (const entry of entries) {
              store.put(entry);
            }
            transaction.addEventListener('complete', () => {
              database.close();
              resolve();
            });
            transaction.addEventListener('abort', () => {
              database.close();
              reject(new Error('Legacy seed aborted'));
            });
          });
        });
      },
      input: {
        entries: [
          { birthtimeMs: Math.trunc(rootStats.birthtimeMs), ino: rootStats.ino, path: '/' },
          { birthtimeMs: Math.trunc(noteStats.birthtimeMs), ino: noteStats.ino, path: ORIGINAL_NOTE_PATH }
        ]
      },
      vaultPath: getTemporaryVault().path
    });
    await startRecordingRenames();
    await setPluginEnabled(true);
    const records = await waitForRecordedRename({ newPath: RENAMED_NOTE_PATH, oldPath: ORIGINAL_NOTE_PATH });
    expect(records.filter((record) => record.newPath === RENAMED_NOTE_PATH)).toHaveLength(1);
    const dataFiles = await evalInObsidian({
      callback: ({ app }) => app.vault.getFiles().filter((file) => file.path.startsWith('Plugin data/')).map((file) => file.path),
      input: {},
      vaultPath: getTemporaryVault().path
    });
    expect(dataFiles).toEqual([]);
  });

  /*
   * Disabling the plugin stands in for closing Obsidian: with the plugin's patch gone, Obsidian's own watcher sees the
   * rename as a delete plus a create, which is exactly the state a restart leaves - the vault knows only the new path,
   * and the metadata cache has dropped the old one. What the plugin has to go on is its persisted path/inode map, which
   * the unload flushed.
   */
  it('should report the rename when the plugin loads again', async () => {
    await writeFile(getFullPath(ORIGINAL_NOTE_PATH), 'content', 'utf-8');
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, true);

    await setPluginEnabled(false);
    await rename(getFullPath(ORIGINAL_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));
    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, false);

    await startRecordingRenames();
    await setPluginEnabled(true);

    const records = await waitForRecordedRename({ newPath: RENAMED_NOTE_PATH, oldPath: ORIGINAL_NOTE_PATH });
    expect(records.filter((r) => r.newPath === RENAMED_NOTE_PATH)).toHaveLength(1);
  });

  /*
   * Regression test: a save that swaps a new copy in for the note gives it a new inode. Made while the plugin was not
   * running, it went unseen, because the startup pass trusted the inode it had cached for the path, and the note's next
   * rename was then missed. The modification time and size Obsidian read from the disk tell the pass to look again.
   */
  it('should report the rename of a note a save replaced while the plugin was not running', async () => {
    await writeFile(getFullPath(ORIGINAL_NOTE_PATH), 'content', 'utf-8');
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, true);

    await setPluginEnabled(false);
    await writeFile(getFullPath(REPLACEMENT_TEMP_PATH), REPLACED_CONTENT, 'utf-8');
    await rename(getFullPath(REPLACEMENT_TEMP_PATH), getFullPath(ORIGINAL_NOTE_PATH));
    await waitForVaultToSeeSize(ORIGINAL_NOTE_PATH, REPLACED_CONTENT.length);
    await setPluginEnabled(true);
    await waitForWatcherReady();

    await setPluginEnabled(false);
    await rename(getFullPath(ORIGINAL_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));
    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, false);

    await startRecordingRenames();
    await setPluginEnabled(true);

    const records = await waitForRecordedRename({ newPath: RENAMED_NOTE_PATH, oldPath: ORIGINAL_NOTE_PATH });
    expect(records.filter((r) => r.newPath === RENAMED_NOTE_PATH)).toHaveLength(1);
  });
});
