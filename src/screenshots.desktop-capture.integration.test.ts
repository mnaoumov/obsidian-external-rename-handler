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
 * The subject is the RENAMED note itself, open in the editor, with the file
 * explorer beside it — so both halves of the story are in frame: the name on
 * disk changed, and the note the reader is looking at followed it rather than
 * closing and coming back as a stranger. Each shot asserts the path the open
 * leaf is on, so the pair cannot silently show the same frame twice.
 *
 * LINKS are deliberately out of frame. Since 4.0.0 this plugin reports the
 * rename and Advanced Rename and Delete Handler rewrites the links, and this
 * vault has only this plugin installed — so a link left pointing at the old name
 * is correct here, and putting it on the store listing would say the opposite of
 * what these frames are for.
 *
 * Desktop only — the manifest says `isDesktopOnly`, and renaming a file behind
 * Obsidian's back is a desktop situation.
 */

import type { TAbstractFile } from 'obsidian';

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

interface FileExplorerLike {
  revealInFolder(abstractFile: TAbstractFile): void;
}

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    // No heading: the NAME is the subject, and it is already on the tab, the
    // Breadcrumb and the explorer row. An `# Chapter one` in the body would sit
    // There unchanged after the rename and read as a contradiction.
    [OLD_TARGET_PATH]: 'This note is open right now. In a moment its file will be renamed on disk, by something that is not Obsidian.\n',
    [SOURCE_NOTE_PATH]: `# Reading list\n\nStart with [[${OLD_NOTE_NAME}]], then keep going.\n`
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, oldTargetPath, sourceNotePath }) {
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

      // The name is the whole subject of the second frame, and the folder holding
      // It starts collapsed — so without this the explorer shows nothing but a
      // Folder row and both frames look identical.
      const targetFile = app.vault.getFileByPath(oldTargetPath);
      const fileExplorer = app.internalPlugins.getEnabledPluginById('file-explorer') as FileExplorerLike | null;
      if (fileExplorer && targetFile) {
        fileExplorer.revealInFolder(targetFile);
      }

      // ON, deliberately: the file's name is the subject of both frames, and the
      // Inline title puts it in the editor too rather than only on the tab.
      app.vault.setConfig('showInlineTitle', true);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { oldTargetPath: OLD_TARGET_PATH, sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - the note before anything is renamed', async () => {
    const activePath = await openTargetNote();
    expect(activePath).toBe(OLD_TARGET_PATH);
    await shoot(1, `A note open in Obsidian, named ${OLD_NOTE_NAME}`);
  });

  it('2 - the same note after an external rename', async () => {
    renameOnDiskOutsideObsidian();
    const activePath = await waitForRenameToBeNoticed();
    expect(activePath).toBe(NEW_TARGET_PATH);
    await shoot(2, 'Renamed in your file manager — the open note followed it');
  });
});

/**
 * Clears the floating notices before a frame is taken.
 *
 * Every shot wants the subject, not the plugin talking over it. The notice suggesting Advanced Rename and
 * Delete Handler in particular is persistent — it carries buttons, so it waits for an answer rather than
 * timing out — and it lands squarely over the file explorer these frames are about.
 */
async function dismissNotices(): Promise<void> {
  await evalInObsidian({
    callback() {
      for (const noticeEl of document.querySelectorAll('.notice')) {
        noticeEl.detach();
      }
    },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the note that is about to be renamed, and reports where the active leaf
 * ended up.
 *
 * @returns The active file's path.
 */
async function openTargetNote(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, oldTargetPath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;

      const file = app.vault.getFileByPath(oldTargetPath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${oldTargetPath}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      // `source: true` forces RAW Markdown, so the frame shows the note as it is
      // Stored rather than a rendered view of it.
      await leaf.setViewState({
        state: { file: oldTargetPath, mode: 'source', source: true },
        type: 'markdown'
      });

      await waitUntil({
        message: 'the editor to render',
        predicate: () => Boolean(document.querySelector('.cm-content')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return app.workspace.getActiveFile()?.path ?? '';
    },
    input: { oldTargetPath: OLD_TARGET_PATH },
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
  await dismissNotices();

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
 * Waits for the plugin to notice the external rename, and reports where the open
 * leaf ended up.
 *
 * The open leaf is the point: a delete followed by a create would leave the
 * editor on a file that no longer exists, while a recognized rename carries it
 * to the new path.
 *
 * @returns The active file's path afterwards.
 */
async function waitForRenameToBeNoticed(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, newTargetPath }) {
      const RENAME_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      // Obsidian has to notice the change on disk first, and the plugin has to
      // Pair the delete with the create before the vault moves the file, so this
      // Wait is longer than most.
      await waitUntil({
        message: 'the open note to follow the renamed file',
        predicate: () => app.workspace.getActiveFile()?.path === newTargetPath,
        timeoutInMilliseconds: RENAME_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return app.workspace.getActiveFile()?.path ?? '';
    },
    input: { newTargetPath: NEW_TARGET_PATH },
    vaultPath: vaultPath()
  });
}
