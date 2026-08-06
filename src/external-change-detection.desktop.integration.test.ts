import {
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

// The default polling interval is 2000 ms, so every external change needs at least one poll to be noticed.
const WAIT_TIMEOUT_IN_MILLISECONDS = 30_000;

const CREATED_NOTE_PATH = 'external-change-detection-created.md';
const RENAMED_NOTE_PATH = 'external-change-detection-renamed.md';

const INITIAL_CONTENT = 'initial content';
const APPENDED_CONTENT = 'appended content';

function getFullPath(path: string): string {
  return join(getTempVault().path, path);
}

async function removeExternally(path: string): Promise<void> {
  await rm(getFullPath(path), { force: true });
}

async function waitForVaultToSee(path: string, shouldExist: boolean): Promise<void> {
  await evalInObsidian({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
    args: {
      path,
      shouldExist,
      WAIT_TIMEOUT_IN_MILLISECONDS
    },
    // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
    async fn({ app, lib: { waitUntil }, path: notePath, shouldExist: isExpectedToExist, WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds }) {
      await waitUntil({
        message: `The vault ${isExpectedToExist ? 'never saw' : 'still sees'} the externally changed note ${notePath}`,
        predicate: () => (app.vault.getAbstractFileByPath(notePath) !== null) === isExpectedToExist,
        timeoutInMilliseconds
      });
    },
    vaultPath: getTempVault().path
  });
}

async function writeExternally(path: string, content: string): Promise<void> {
  await writeFile(getFullPath(path), content, 'utf-8');
}

describe('External change detection', () => {
  afterEach(async () => {
    await removeExternally(CREATED_NOTE_PATH);
    await removeExternally(RENAMED_NOTE_PATH);
    await waitForVaultToSee(CREATED_NOTE_PATH, false);
    await waitForVaultToSee(RENAMED_NOTE_PATH, false);
  });

  it('should reflect an externally created note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);
  });

  it('should reflect an externally edited note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);

    await writeExternally(CREATED_NOTE_PATH, APPENDED_CONTENT);

    const content = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: {
        APPENDED_CONTENT,
        CREATED_NOTE_PATH,
        WAIT_TIMEOUT_IN_MILLISECONDS
      },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({
        app,
        APPENDED_CONTENT: expectedContent,
        CREATED_NOTE_PATH: notePath,
        lib: { waitUntil },
        WAIT_TIMEOUT_IN_MILLISECONDS: timeoutInMilliseconds
      }) {
        await waitUntil({
          message: `The vault never picked up the external edit of ${notePath}`,
          predicate: async () => {
            const file = app.vault.getFileByPath(notePath);
            if (!file) {
              return false;
            }
            return (await app.vault.read(file)) === expectedContent;
          },
          timeoutInMilliseconds
        });

        const file = app.vault.getFileByPath(notePath);
        return file ? await app.vault.read(file) : '';
      },
      vaultPath: getTempVault().path
    });

    expect(content).toBe(APPENDED_CONTENT);
  });

  it('should reflect an externally renamed note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);

    await rename(getFullPath(CREATED_NOTE_PATH), getFullPath(RENAMED_NOTE_PATH));

    await waitForVaultToSee(RENAMED_NOTE_PATH, true);
    await waitForVaultToSee(CREATED_NOTE_PATH, false);
  });

  it('should reflect an externally deleted note', async () => {
    await writeExternally(CREATED_NOTE_PATH, INITIAL_CONTENT);
    await waitForVaultToSee(CREATED_NOTE_PATH, true);

    await removeExternally(CREATED_NOTE_PATH);

    await waitForVaultToSee(CREATED_NOTE_PATH, false);
  });
});
