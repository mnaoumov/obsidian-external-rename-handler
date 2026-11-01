import {
  mkdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PROBE_ATTEMPT_COUNT = 12;
const PROBE_ATTEMPT_DELAY_IN_MILLISECONDS = 250;

/**
 * Finds out whether a folder's modification time changes when an entry is created in it.
 *
 * The polling backend of `chokidar` 6 notices a new entry only through its parent folder's size or modification time.
 * The FAT32 and exFAT drivers of Windows update neither, so there it reports no new file at all.
 *
 * It creates a probe folder in `parentPath` and entries in it, one every 250 ms for 3 seconds at most, because a
 * folder's time can lag its first entry even on NTFS, and FAT32 keeps it only to 2 seconds. It stops at the first change.
 *
 * @param parentPath - The folder to create the probe folder in, on the volume in question.
 * @returns `true` when the time changed, or when the probe could not be made, so that nothing is decided on a guess;
 * `false` when it never changed.
 */
export async function doesFolderMtimeTrackNewEntries(parentPath: string): Promise<boolean> {
  const probePath = join(parentPath, `.external-rename-handler-probe-${String(Date.now())}`);
  try {
    await mkdir(probePath);
    const { mtimeMs: initialMtimeMs } = await stat(probePath);
    for (let attempt = 0; attempt < PROBE_ATTEMPT_COUNT; attempt++) {
      if (attempt > 0) {
        await sleep(PROBE_ATTEMPT_DELAY_IN_MILLISECONDS);
      }
      await writeFile(join(probePath, String(attempt)), '');
      const { mtimeMs } = await stat(probePath);
      if (mtimeMs !== initialMtimeMs) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  } finally {
    await rm(probePath, { force: true, recursive: true }).catch(() => undefined);
  }
}
