import type { App } from 'obsidian';

import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { printError } from '@mnaoumov/typescript-lib/error';
import { TwoWayMap } from '@mnaoumov/typescript-lib/two-way-map';
import { debounce } from 'obsidian';

const STORE_NAME = 'path-ino';
const IMPORT_MARKER = 'legacy-import-v1';
const PATH_PREFIX = 'path:';

/**
 * The modification time and size of a file, as Obsidian's own `TFile.stat` carries them.
 */
export interface FileStamp {
  readonly mtime: number;
  readonly size: number;
}

interface DatabaseEntry {
  // Absent from an entry written before 4.1.0.
  readonly birthtimeMs?: number;
  readonly ino: number;
  // Absent from an entry written before 4.1.0, and from a folder's.
  readonly mtime?: number;
  readonly path: string;
  // Absent from an entry written before 4.1.0, and from a folder's.
  readonly size?: number;
}

interface PathInoMapSetParams {
  readonly birthtimeMs: number;
  readonly ino: number;
  readonly path: string;
  // Only a file has one.
  readonly stamp?: FileStamp | undefined;
}

const DB_VERSION = 1;
const PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS = 5000;

export class PathInoMap implements Disposable {
  // The birth time vouches that an inode found at a new path after a restart is the same file, and not a freed inode
  // the file system handed to an unrelated new file.
  private readonly birthtimes = new Map<string, number>();

  private disposal: null | Promise<void> = null;

  private flush: null | Promise<void> = null;

  private initialization: null | Promise<void> = null;

  private isDisposed = false;

  private isInitialized = false;

  private readonly knownKeys = new Set<string>();

  private local: LocalDataStore | null = null;

  private pendingStoreActions: (readonly [string, DatabaseEntry | null])[] = [];

  private readonly processStoreActionsDebounced = debounce(() => {
    invokeAsyncSafely(() => this.processStoreActions().catch(printError));
  }, PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS);

  private shouldClearOnInitialize = false;

  // The stamp tells the startup pass which cached files may have been replaced while Obsidian was closed, so it stats
  // only those rather than the whole vault.
  private readonly stamps = new Map<string, FileStamp>();

  private readonly twoWayMap = new TwoWayMap<string, number>();

  public clear(): void {
    if (this.isDisposed) {
      return;
    }
    if (!this.isInitialized) {
      this.shouldClearOnInitialize = true;
    }
    this.twoWayMap.clear();
    this.birthtimes.clear();
    this.stamps.clear();
    for (const key of this.knownKeys) {
      this.addStoreAction([key, null]);
    }
  }

  public deletePath(path: string): void {
    if (this.isDisposed) {
      return;
    }
    this.twoWayMap.deleteKey(path);
    this.birthtimes.delete(path);
    this.stamps.delete(path);
    this.addStoreAction([PATH_PREFIX + path, null]);
  }

  public async disposeAsync(): Promise<void> {
    this.isDisposed = true;
    this.processStoreActionsDebounced.cancel();
    this.disposal ??= this.drainAndClose();
    await this.disposal;
  }

  public getBirthtime(path: string): number | undefined {
    return this.birthtimes.get(path);
  }

  public getIno(path: string): number | undefined {
    return this.twoWayMap.getValue(path);
  }

  public getPath(ino: number): string | undefined {
    return this.twoWayMap.getKey(ino);
  }

  public getPaths(): string[] {
    return [...this.twoWayMap.keys()];
  }

  public getStamp(path: string): FileStamp | undefined {
    return this.stamps.get(path);
  }

  public async init(app: App): Promise<void> {
    this.initialization ??= this.initialize(app);
    await this.initialization;
  }

  public set(params: PathInoMapSetParams): void {
    if (this.isDisposed) {
      return;
    }
    const { birthtimeMs, ino, path, stamp } = params;
    const oldPath = this.getPath(ino);
    const entry: DatabaseEntry = { birthtimeMs, ino, path, ...stamp && { mtime: stamp.mtime, size: stamp.size } };
    this.loadEntry(entry);
    if (oldPath !== undefined && oldPath !== path) {
      this.addStoreAction([PATH_PREFIX + oldPath, null]);
    }
    this.addStoreAction([PATH_PREFIX + path, entry]);
  }

  /**
   * Tears the map down: cancels the debounced flush, writes whatever is still queued while the connection is alive,
   * Then closes the connection.
   *
   * Idempotent, as `ComponentEx.registerDisposable` requires, because the owning component disposes the map it
   * Replaces on a second layout-ready and the registration disposes it again on unload.
   */
  public [Symbol.dispose](): void {
    invokeAsyncSafely(() => this.disposeAsync().catch(printError));
  }

  private addStoreAction(storeAction: readonly [string, DatabaseEntry | null]): void {
    this.knownKeys.add(storeAction[0]);
    this.pendingStoreActions.push(storeAction);
    this.processStoreActionsDebounced();
  }

  private async drainAndClose(): Promise<void> {
    try {
      await this.initialization;
      // A failed in-flight flush retains its prefix; disposal gets one final attempt.
      await this.flush?.catch(printError);
      await this.processStoreActions();
    } finally {
      this.local?.close();
      this.local = null;
    }
  }

  private async flushPendingActions(): Promise<void> {
    await this.initialization;
    while (this.pendingStoreActions.length > 0) {
      const local = this.local;
      if (!local) {
        throw new Error('path-ino store is not initialized; pending actions stay queued');
      }
      const count = this.pendingStoreActions.length;
      const changes = new Map(this.pendingStoreActions.slice(0, count));
      const entries: [string, DatabaseEntry][] = [];
      const removedKeys: string[] = [];
      for (const [key, value] of changes) {
        if (value === null) {
          removedKeys.push(key);
        } else {
          entries.push([key, value]);
        }
      }
      await local.commit({ entries, removedKeys });
      this.pendingStoreActions.splice(0, count);
    }
  }

  private async initialize(app: App): Promise<void> {
    // `window`, never `activeWindow`: the store is keyed by `app.appId`, so it belongs to the vault rather than to
    // whichever window happened to have focus when the layout became ready. Opening it on a focused popout binds the
    // connection to that popout, and closing the popout then closes the connection under a plugin that is still
    // loaded and still queueing writes.
    const local = await LocalDataStore.open({
      factory: window.indexedDB,
      pluginId: 'external-rename-handler',
      storeId: 'path-ino-v1',
      vaultId: app.appId
    });
    this.local = local;
    try {
      if (await local.get(IMPORT_MARKER) !== true) {
        const entries = await readLegacyEntries(app.appId);
        await local.commit({
          entries: [
            ...entries.map((entry): readonly [string, DatabaseEntry] => [PATH_PREFIX + entry.path, entry]),
            [IMPORT_MARKER, true]
          ]
        });
      }
      for (const [key, value] of await local.entries()) {
        if (!key.startsWith(PATH_PREFIX)) {
          continue;
        }
        this.knownKeys.add(key);
        if (!checkEntry(value) || key !== PATH_PREFIX + value.path) {
          continue;
        }
        this.loadEntry(value);
      }
      if (this.shouldClearOnInitialize) {
        this.twoWayMap.clear();
        this.birthtimes.clear();
        this.stamps.clear();
        this.pendingStoreActions = [
          ...[...this.knownKeys].map((key): readonly [string, null] => [key, null]),
          ...this.pendingStoreActions
        ];
      }
      // Mutations accepted during open are newer than the observations just read from disk.
      const pendingStoreActions = this.pendingStoreActions;
      this.pendingStoreActions = [];
      for (const [key, entry] of pendingStoreActions) {
        if (entry === null) {
          const path = key.slice(PATH_PREFIX.length);
          this.twoWayMap.deleteKey(path);
          this.birthtimes.delete(path);
          this.stamps.delete(path);
        } else {
          const oldPath = this.getPath(entry.ino);
          if (oldPath !== undefined && oldPath !== entry.path) {
            this.pendingStoreActions.push([PATH_PREFIX + oldPath, null]);
          }
          this.loadEntry(entry);
        }
        this.pendingStoreActions.push([key, entry]);
      }
      this.isInitialized = true;
    } catch (error) {
      local.close();
      this.local = null;
      throw error;
    }
  }

  private loadEntry(entry: DatabaseEntry): void {
    const oldPath = this.getPath(entry.ino);
    if (oldPath !== undefined) {
      this.birthtimes.delete(oldPath);
      this.stamps.delete(oldPath);
    }
    this.twoWayMap.set(entry.path, entry.ino);
    this.birthtimes.delete(entry.path);
    this.stamps.delete(entry.path);
    if (entry.birthtimeMs !== undefined) {
      this.birthtimes.set(entry.path, entry.birthtimeMs);
    }
    if (entry.mtime !== undefined && entry.size !== undefined) {
      this.stamps.set(entry.path, { mtime: entry.mtime, size: entry.size });
    }
  }

  private async processStoreActions(): Promise<void> {
    this.flush ??= this.flushPendingActions().finally(() => {
      this.flush = null;
    });
    await this.flush;
  }
}

function checkEntry(value: unknown): value is DatabaseEntry {
  return typeof value === 'object' && value !== null
    && 'path' in value && typeof value.path === 'string'
    && 'ino' in value && typeof value.ino === 'number' && Number.isFinite(value.ino)
    && (!('birthtimeMs' in value) || (typeof value.birthtimeMs === 'number' && Number.isFinite(value.birthtimeMs)))
    && (!('mtime' in value) || (typeof value.mtime === 'number' && Number.isFinite(value.mtime)))
    && (!('size' in value) || (typeof value.size === 'number' && Number.isFinite(value.size)));
}

async function getResult<T>(request: IDBRequest<T>): Promise<T> {
  return await new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(new Error('IndexedDB request failed', { cause: request.error }));
    });
  });
}

async function readLegacyEntries(vaultId: string): Promise<DatabaseEntry[]> {
  const request = window.indexedDB.open(`${vaultId}/external-rename-handler`, DB_VERSION);
  const database = await getResult(request);
  try {
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      return [];
    }
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const values: unknown[] = await getResult(transaction.objectStore(STORE_NAME).getAll());
    return values.filter(checkEntry);
  } finally {
    database.close();
  }
}
