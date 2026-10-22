import type {
  ChokidarOptions,
  Scheduler,
  SchedulerTimer
} from 'chokidar';

import { FSWatcher } from 'chokidar';
import {
  clearTimeout as clearNodeTimeout,
  setTimeout as setNodeTimeout
} from 'node:timers';

type WatchOptions = ChokidarOptions;

class NodeSchedulerTimer implements SchedulerTimer {
  public constructor(public readonly timeout: NodeJS.Timeout) {}

  public ref(): this {
    this.timeout.ref();
    return this;
  }

  public unref(): this {
    this.timeout.unref();
    return this;
  }
}

/*
 * `chokidar` 6's default scheduler arms its timers with the global `setTimeout` and calls `unref()` on what it gets back.
 * Inside the app's renderer that global is the DOM one, whose handle is a plain number, so every directory the watcher
 * subscribes to fails with `timer.unref is not a function` and the watcher reports nothing at all.
 */
const NODE_TIMERS_SCHEDULER: Scheduler = {
  clearTimeout(timer: SchedulerTimer | undefined): void {
    if (timer instanceof NodeSchedulerTimer) {
      clearNodeTimeout(timer.timeout);
    }
  },
  now(): number {
    return Date.now();
  },
  setTimeout(callback: () => void, delay: number): SchedulerTimer {
    return new NodeSchedulerTimer(setNodeTimeout(callback, delay));
  }
};

/**
 * `chokidar`'s `watch`, on a scheduler that works inside the app's renderer.
 *
 * @param paths - The paths to watch.
 * @param options - The `chokidar` options.
 * @returns The watcher.
 */
export function watch(paths: string | string[], options: WatchOptions): FSWatcher {
  return new FSWatcher(options, NODE_TIMERS_SCHEDULER).add(paths);
}
