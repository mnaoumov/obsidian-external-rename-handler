import type { FSWatcher } from 'node:fs';

import { watch } from 'node:fs';
import {
  mkdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  clearTimeout as clearNodeTimeout,
  setTimeout as setNodeTimeout
} from 'node:timers';

const PROBE_TIMEOUT_IN_MILLISECONDS = 3000;

/* eslint-disable typescript-dev-toolkit/readonly-interface-members -- Filled in by the promise executor, read by the cleanup. */
interface ProbeState {
  timeout: NodeJS.Timeout | null;
  watcher: FSWatcher | null;
}
/* eslint-enable typescript-dev-toolkit/readonly-interface-members -- Filled in by the promise executor, read by the cleanup. */

/**
 * Finds out whether the native file system watcher reports an entry created on the volume.
 *
 * On a local disk it does, and the native backend of `chokidar` 6 then sees every external change, bursts included,
 * without the cost of polling, which `stat`s every file of the vault per interval. A network share (SMB) and
 * `\\wsl.localhost` deliver no native notification at all, and polling is the only way to see a change there.
 *
 * It creates a probe folder in `parentPath`, watches it with `fs.watch`, creates an entry in it, and waits up to 3
 * seconds for any notification.
 *
 * @param parentPath - The folder to create the probe folder in, on the volume in question.
 * @returns `true` when a notification arrived, or when the probe folder could not be made, so that nothing is decided on
 * a guess; `false` when none arrived, or when the folder cannot be watched at all.
 */
export async function doesNativeWatcherSeeNewEntries(parentPath: string): Promise<boolean> {
  const probePath = join(parentPath, `.external-rename-handler-watch-probe-${String(Date.now())}`);
  try {
    await mkdir(probePath);
  } catch {
    return true;
  }

  const state: ProbeState = { timeout: null, watcher: null };
  try {
    const notified = new Promise<boolean>((resolve) => {
      try {
        state.watcher = watch(probePath, { persistent: false }, () => {
          resolve(true);
        });
      } catch {
        // A file system that cannot be watched at all.
        resolve(false);
        return;
      }
      state.watcher.on('error', () => {
        resolve(false);
      });
      state.timeout = setNodeTimeout(() => {
        resolve(false);
      }, PROBE_TIMEOUT_IN_MILLISECONDS);
    });
    await writeFile(join(probePath, 'entry'), '');
    return await notified;
  } catch {
    return true;
  } finally {
    if (state.timeout) {
      clearNodeTimeout(state.timeout);
    }
    state.watcher?.close();
    await rm(probePath, { force: true, recursive: true }).catch(() => undefined);
  }
}
