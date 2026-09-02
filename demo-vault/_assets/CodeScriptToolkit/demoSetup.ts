import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  mkdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

// Everything here moves files with `node:fs`, never `app.fileManager` or `app.vault`.
// That is the whole point: a rename Obsidian performs itself is not an EXTERNAL rename, so a demo
// Built on the vault API would exercise none of this plugin.

const PLUGIN_ID = 'external-rename-handler';
const DEMO_FOLDER_PATH = 'Materials/01 External renames';
const REFERENCES_FOLDER_PATH = `${DEMO_FOLDER_PATH}/References`;
const ORIGINAL_NOTE_PATH = `${DEMO_FOLDER_PATH}/Rename me externally.md`;
const RENAMED_NOTE_PATH = `${DEMO_FOLDER_PATH}/Renamed externally.md`;
const MOVED_NOTE_PATH = `${REFERENCES_FOLDER_PATH}/Rename me externally.md`;

interface DemoSettingsPatch {
  deletionRenameDetectionTimeoutInMilliseconds?: number;
  pollingIntervalInMilliseconds?: number;
}

const FIXTURE_NOTES: Record<string, string> = {
  [ORIGINAL_NOTE_PATH]: '# Rename me externally\n\nThe note the walkthroughs rename from outside Obsidian. Two notes in `References/` link here.\n',
  [`${REFERENCES_FOLDER_PATH}/Link A.md`]: '# Link A\n\nLinks to [Rename me externally](<../Rename me externally.md>).\n',
  [`${REFERENCES_FOLDER_PATH}/Link B.md`]: '# Link B\n\nAlso links to [Rename me externally](<../Rename me externally.md>).\n'
};

function getAbsolutePath(app: App, vaultRelativePath: string): string {
  return join(app.vault.adapter.basePath, vaultRelativePath);
}

async function renameBehindObsidian(app: App, fromPath: string, toPath: string): Promise<boolean> {
  const from = getAbsolutePath(app, fromPath);
  const to = getAbsolutePath(app, toPath);
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renames the demo note on disk, the way your file manager would.
 *
 * Manual equivalent: switch to Finder / File Explorer, or run
 * `mv "Rename me externally.md" "Renamed externally.md"` in the vault folder, with Obsidian still open.
 */
export async function renameExternally(app: App): Promise<void> {
  const didRename = await renameBehindObsidian(app, ORIGINAL_NOTE_PATH, RENAMED_NOTE_PATH);
  new Notice(didRename ? 'Renamed on disk. Watch Link A and Link B follow it.' : 'Nothing to rename — reset the demo first.');
}

/**
 * Moves the demo note into `References/` on disk — an external MOVE, which is just a rename to a
 * different path.
 *
 * Manual equivalent: `mv "Rename me externally.md" "References/Rename me externally.md"`.
 */
export async function moveExternally(app: App): Promise<void> {
  const didMove = await renameBehindObsidian(app, ORIGINAL_NOTE_PATH, MOVED_NOTE_PATH);
  new Notice(didMove ? 'Moved on disk. The links should follow it into References/.' : 'Nothing to move — reset the demo first.');
}

/**
 * Renames the `References` folder on disk, so the folder case can be seen too.
 *
 * Manual equivalent: rename that folder in your file manager.
 */
export async function renameFolderExternally(app: App): Promise<void> {
  const didRename = await renameBehindObsidian(app, REFERENCES_FOLDER_PATH, `${DEMO_FOLDER_PATH}/Linked notes`);
  new Notice(didRename ? 'Folder renamed on disk. Links into it should be rewritten.' : 'Nothing to rename — reset the demo first.');
}

/**
 * Puts the three fixture notes back exactly as they ship, so the next variation starts clean.
 *
 * Written through `node:fs` as well, so the reset itself is invisible to Obsidian and cannot be
 * mistaken for another rename to detect.
 *
 * Manual equivalent: rename everything back by hand in your file manager.
 */
export async function resetDemo(app: App): Promise<void> {
  for (const path of [DEMO_FOLDER_PATH]) {
    await rm(getAbsolutePath(app, path), { force: true, recursive: true });
  }

  await mkdir(getAbsolutePath(app, REFERENCES_FOLDER_PATH), { recursive: true });
  for (const [path, content] of Object.entries(FIXTURE_NOTES)) {
    await writeFile(getAbsolutePath(app, path), content, 'utf-8');
  }

  new Notice('Fixtures restored on disk. Give Obsidian a moment to notice.');
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> External Rename
 * Handler**.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied.');
}
