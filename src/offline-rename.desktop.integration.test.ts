import {
  rename,
  rm,
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

interface RenameRecord {
  readonly newPath: string;
  readonly oldPath: string;
}

interface RenameRecorderWindow {
  offlineRenameRecords?: RenameRecord[];
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
      recorderWindow.offlineRenameRecords = [];
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

describe('Renames made while the plugin was not running', () => {
  afterEach(async () => {
    await setPluginEnabled(true);
    await rm(getFullPath(ORIGINAL_NOTE_PATH), { force: true });
    await rm(getFullPath(RENAMED_NOTE_PATH), { force: true });
    await waitForVaultToSee(ORIGINAL_NOTE_PATH, false);
    await waitForVaultToSee(RENAMED_NOTE_PATH, false);
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
});
