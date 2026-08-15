/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs
 * (T461-P21), driving a staged vault in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * TWO shots, and the rename between them is REAL. The suite runs in Node, so it
 * renames the file with `fs.rename` while Obsidian is running — which is exactly
 * the situation the plugin exists for, a rename Obsidian did not perform and
 * would otherwise see as a delete followed by a create.
 *
 * Both frames show the file explorer beside the linking note, because the story
 * needs both halves: the file got a new name, and the link followed it. Each
 * shot asserts the link text, so the pair cannot silently show the same note
 * twice.
 *
 * Desktop only — the manifest says `isDesktopOnly`, and renaming a file behind
 * Obsidian's back is a desktop situation.
 */

import {
  mkdirSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const OLD_NOTE_NAME = 'Chapter one';
const NEW_NOTE_NAME = 'Renamed chapter';

const TARGET_FOLDER = 'Book';
const SOURCE_NOTE_PATH = 'Book/Reading list.md';
const OLD_TARGET_PATH = `${TARGET_FOLDER}/${OLD_NOTE_NAME}.md`;
const NEW_TARGET_PATH = `${TARGET_FOLDER}/${NEW_NOTE_NAME}.md`;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [OLD_TARGET_PATH]: `# ${OLD_NOTE_NAME}\n\nThe note that is about to be renamed from outside.\n`,
    [SOURCE_NOTE_PATH]: `# Reading list\n\nStart with [[${OLD_NOTE_NAME}]], then keep going.\n`
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, sourceNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(sourceNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // Both halves of the story are on screen at once: the file explorer for
      // The name, the editor for the link.
      app.workspace.leftSplit.expand();
      const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
      if (fileExplorerLeaf) {
        await app.workspace.revealLeaf(fileExplorerLeaf);
      }

      app.vault.setConfig('showInlineTitle', false);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - the link before anything is renamed', async () => {
    const content = await openSourceNote();
    expect(content).toContain(`[[${OLD_NOTE_NAME}]]`);
    await shoot(1, `A note linking to ${OLD_NOTE_NAME}`);
  });

  it('2 - the link after an external rename', async () => {
    renameOnDiskOutsideObsidian();
    const content = await waitForLinkToFollow();
    expect(content).toContain(`[[${NEW_NOTE_NAME}]]`);
    expect(content).not.toContain(`[[${OLD_NOTE_NAME}]]`);
    await shoot(2, 'Renamed in your file manager — and the link followed it');
  });
});

/**
 * Opens the linking note and returns its content.
 *
 * @returns The note's Markdown.
 */
async function openSourceNote(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, sourceNotePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;

      const file = app.vault.getFileByPath(sourceNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${sourceNotePath}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      // `source: true` forces RAW Markdown: the link TEXT is the subject, and
      // Reading view would render it away.
      await leaf.setViewState({
        state: { file: sourceNotePath, mode: 'source', source: true },
        type: 'markdown'
      });

      await waitUntil({
        message: 'the editor to render',
        predicate: () => Boolean(document.querySelector('.cm-content')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return await app.vault.read(file);
    },
    input: { sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Renames the target file with Node's own `fs`, behind Obsidian's back.
 *
 * This is the whole point: a rename Obsidian did not perform, of the kind a file
 * manager, a script or a sync client makes. Nothing here goes through the
 * Obsidian API, so the app sees only what it would see in real life.
 */
function renameOnDiskOutsideObsidian(): void {
  renameSync(join(vaultPath(), OLD_TARGET_PATH), join(vaultPath(), NEW_TARGET_PATH));
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

/**
 * Waits for the plugin to notice the external rename and rewrite the link.
 *
 * @returns The linking note's content afterwards.
 */
async function waitForLinkToFollow(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, newNoteName, sourceNotePath }) {
      const RENAME_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const file = app.vault.getFileByPath(sourceNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${sourceNotePath}`);
      }

      // Obsidian has to notice the change on disk first, and the plugin has to
      // Pair the delete with the create before it can rewrite anything, so this
      // Wait is longer than most.
      await waitUntil({
        message: 'the link to follow the renamed file',
        predicate: async () => {
          const content = await app.vault.read(file);
          return content.includes(newNoteName);
        },
        timeoutInMilliseconds: RENAME_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return await app.vault.read(file);
    },
    input: { newNoteName: NEW_NOTE_NAME, sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
}
