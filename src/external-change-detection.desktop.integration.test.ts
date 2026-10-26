import {
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Under the transport's ~30s per-closure cap, not at it. Every closure in this file spends its whole
 * budget on this one ceiling, so at 30_000 the ceiling was unreachable: the eval is killed at the cap
 * first and reported as a bare transport timeout naming the harness rather than the wait that overran.
 * What is waited on is the vault noticing an external change, which takes one poll of the default
 * 2000 ms interval — so what is left is still a tenfold margin for a cold machine.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

const CREATED_NOTE_PATH = 'external-change-detection-created.md';
const RENAMED_NOTE_PATH = 'external-change-detection-renamed.md';
// A dot file, as editors name their temp files, so neither Obsidian nor the plugin indexes it.
const TEMP_NOTE_PATH = '.external-change-detection-created.md.tmp';

// Obsidian keys the vault by the NFC form of a name, while the file on disk keeps its decomposed (NFD) one.
const DECOMPOSED_CREATED_NOTE_PATH = 'external-change-detection-й-created.md';
const DECOMPOSED_RENAMED_NOTE_PATH = 'external-change-detection-й-renamed.md';

const INITIAL_CONTENT = 'initial content';
const APPENDED_CONTENT = 'appended content';

const PLUGIN_ID = 'external-rename-handler';
const DEFAULT_POLLING_INTERVAL_IN_MILLISECONDS = 2000;

// Each `chokidar` backend pairs the `unlink` and `add` of a rename on its own, so every case runs under both.
const BACKENDS = [
  { backend: 'polling', pollingIntervalInMilliseconds: DEFAULT_POLLING_INTERVAL_IN_MILLISECONDS },
  { backend: 'auto', pollingIntervalInMilliseconds: 0 }
] as const;

// The slices of the plugin's component tree the backend switch reads: the settings component and the handler's `chokidar` watcher.
interface ComponentTreeNode {
  _children?: ComponentTreeNode[];
  editAndSave?: (editor: (settings: PollingSettings) => void) => Promise<void>;
  settings?: Partial<PollingSettings>;
  watcher?: null | WatcherSlice;
}

interface PollingSettings {
  pollingIntervalInMilliseconds: number;
}

interface WatcherOptionsSlice {
  backend: string;
}

interface WatcherSlice {
  options: WatcherOptionsSlice;
  readyEmitted: boolean;
}

function getFullPath(path: string): string {
  return join(getTemporaryVault().path, path);
}

async function openInNewLeaf(path: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, path: notePath }) {
      const file = app.vault.getFileByPath(notePath);
      if (!file) {
        throw new Error(`The note ${notePath} is not in the vault`);
      }
      await app.workspace.getLeaf('tab').openFile(file);
    },
    input: { path },
    vaultPath: getTemporaryVault().path
  });
}

async function removeExternally(path: string): Promise<void> {
  await rm(getFullPath(path), { force: true });
}

async function setPollingInterval(pollingIntervalInMilliseconds: number, expectedBackend: string): Promise<void> {
  await evalInObsidian({
    async callback({
      app,
      expectedBackend: backend,
      lib: { waitUntil },
      pluginId,
      pollingIntervalInMilliseconds: interval,
      WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds
    }) {
      function findNode(isMatch: (node: ComponentTreeNode) => boolean): ComponentTreeNode {
        const queue: ComponentTreeNode[] = [app.plugins.getPlugin(pluginId) as ComponentTreeNode];
        for (let node = queue.shift(); node; node = queue.shift()) {
          if (isMatch(node)) {
            return node;
          }
          queue.push(...node._children ?? []);
        }
        throw new Error('The component was not found.');
      }

      const settingsComponent = findNode((node) => typeof node.editAndSave === 'function' && typeof node.settings?.pollingIntervalInMilliseconds === 'number');
      await settingsComponent.editAndSave?.((settings) => {
        settings.pollingIntervalInMilliseconds = interval;
      });

      // Saving the settings re-creates the watcher, and an external change made before its initial scan is done can be missed.
      const handlerComponent = findNode((node) => node.watcher !== undefined);
      await waitUntil({
        message: `The watcher never became ready on the ${backend} backend`,
        predicate: () => handlerComponent.watcher?.options.backend === backend && handlerComponent.watcher.readyEmitted,
        timeoutInMilliseconds
      });
    },
    input: {
      expectedBackend,
      pluginId: PLUGIN_ID,
      pollingIntervalInMilliseconds,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

async function waitForOpenLeafToShow(path: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `No open leaf followed the note to ${notePath}`,
        predicate: () => app.workspace.getLeavesOfType('markdown').some((leaf) => leaf.getViewState().state?.['file'] === notePath),
        timeoutInMilliseconds
      });
    },
    input: {
      path,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

async function waitForVaultContent(path: string, expectedContent: string): Promise<string> {
  return await evalInObsidian({
    async callback({ app, expectedContent: content, lib: { waitUntil }, path: notePath, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `The vault never picked up the external edit of ${notePath}`,
        // `vault.read` reads the disk, so it sees an edit before the watcher does. The size is the vault's own record,
        // which only the watcher's event updates.
        predicate: async () => {
          const file = app.vault.getFileByPath(notePath);
          return file ? file.stat.size === new TextEncoder().encode(content).length && (await app.vault.read(file)) === content : false;
        },
        timeoutInMilliseconds
      });

      const file = app.vault.getFileByPath(notePath);
      return file ? await app.vault.read(file) : '';
    },
    input: {
      expectedContent,
      path,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    vaultPath: getTemporaryVault().path
  });
}

async function waitForVaultToSee(path: string, shouldExist: boolean): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, path: notePath, shouldExist: isExpectedToExist, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `The vault ${isExpectedToExist ? 'never saw' : 'still sees'} the externally changed note ${notePath}`,
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

async function writeExternally(path: string, content: string): Promise<void> {
  await writeFile(getFullPath(path), content, 'utf-8');
}

describe.each(BACKENDS)('External change detection on the $backend backend', ({ backend, pollingIntervalInMilliseconds }) => {
  beforeAll(async () => {
    await setPollingInterval(pollingIntervalInMilliseconds, backend);
  });

  afterAll(async () => {
    await setPollingInterval(DEFAULT_POLLING_INTERVAL_IN_MILLISECONDS, 'polling');
  });

  afterEach(async () => {
    await removeExternally(CREATED_NOTE_PATH);
    await removeExternally(RENAMED_NOTE_PATH);
    await removeExternally(TEMP_NOTE_PATH);
    await removeExternally(DECOMPOSED_CREATED_NOTE_PATH.normalize('NFD'));
    await removeExternally(DECOMPOSED_RENAMED_NOTE_PATH.normalize('NFD'));
    await waitForVaultToSee(CREATED_NOTE_PATH, false);
    await waitForVaultToSee(RENAMED_NOTE_PATH, false);
    await waitForVaultToSee(DECOMPOSED_CREATED_NOTE_PATH, false);
    await waitForVaultToSee(DECOMPOSED_RENAMED_NOTE_PATH, false);
  });

  it('should reflect an externally renamed note with a decomposed name under its normalized path', async () => {
    await writeExternally(DECOMPOSED_CREATED_NOTE_PATH.normalize('NFD'), INITIAL_CONTENT);
    await waitForVaultToSee(DECOMPOSED_CREATED_NOTE_PATH, true);
    await openInNewLeaf(DECOMPOSED_CREATED_NOTE_PATH);

    await rename(getFullPath(DECOMPOSED_CREATED_NOTE_PATH.normalize('NFD')), getFullPath(DECOMPOSED_RENAMED_NOTE_PATH.normalize('NFD')));

    await waitForVaultToSee(DECOMPOSED_RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(DECOMPOSED_CREATED_NOTE_PATH, false);

    // A real rename keeps the file's identity, so the leaf showing it follows it to the new path. A delete plus create, which
    // is what mixing the decomposed and normalized forms produced, closes the note in the leaf instead.
    await waitForOpenLeafToShow(DECOMPOSED_RENAMED_NOTE_PATH);
  });

  it('should reflect an externally created note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);
  });

  it('should reflect an externally edited note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);

    await writeExternally(CREATED_NOTE_PATH, APPENDED_CONTENT);

    expect(await waitForVaultContent(CREATED_NOTE_PATH, APPENDED_CONTENT)).toBe(APPENDED_CONTENT);
  });

  // A save that writes a temp file and renames it over the note gives the note a new inode. The plugin used to keep the old
  // one, so the note's next external rename arrived as a delete plus a create, and the leaf showing it was closed.
  it('should reflect an externally renamed note after a save that replaced it', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);
    await openInNewLeaf(CREATED_NOTE_PATH);

    await writeExternally(TEMP_NOTE_PATH, APPENDED_CONTENT);
    await rename(getFullPath(TEMP_NOTE_PATH), getFullPath(CREATED_NOTE_PATH));
    await waitForVaultContent(CREATED_NOTE_PATH, APPENDED_CONTENT);

    await rename(getFullPath(CREATED_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));

    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(CREATED_NOTE_PATH, false);
    await waitForOpenLeafToShow(RENAMED_NOTE_PATH);
  });

  it('should reflect an externally renamed note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);
    await openInNewLeaf(CREATED_NOTE_PATH);

    await rename(getFullPath(CREATED_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));

    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(CREATED_NOTE_PATH, false);
    await waitForOpenLeafToShow(RENAMED_NOTE_PATH);
  });

  it('should reflect an externally deleted note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);

    await removeExternally(CREATED_NOTE_PATH);

    await waitForVaultToSee(CREATED_NOTE_PATH, false);
  });
});
