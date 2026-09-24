import type { App } from 'obsidian';

import { debounce } from 'obsidian';
import { printError } from 'obsidian-dev-utils/error';
import { TwoWayMap } from 'obsidian-dev-utils/two-way-map';

const STORE_NAME = 'path-ino';

interface DatabaseEntry {
  ino: number;
  path: string;
}

interface PathInoMapSetParams {
  readonly ino: number;
  readonly path: string;
}

const DB_VERSION = 1;
const PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS = 5000;

export class PathInoMap implements Disposable {
  private _database?: IDBDatabase;

  private isDisposed = false;

  private readonly pendingStoreActions: ((store: IDBObjectStore) => void)[] = [];

  private readonly processStoreActionsDebounced = debounce(() => {
    this.processStoreActions();
  }, PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS);

  private readonly twoWayMap = new TwoWayMap<string, number>();

  private get database(): IDBDatabase {
    if (!this._database) {
      throw new Error('database is not initialized');
    }
    return this._database;
  }

  public clear(): void {
    this.twoWayMap.clear();
    this.addStoreAction((store) => store.clear());
  }

  public deletePath(path: string): void {
    this.twoWayMap.deleteKey(path);
    this.addStoreAction((store) => store.delete(path));
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

  public async init(app: App): Promise<void> {
    // `window`, never `activeWindow`: the store is keyed by `app.appId`, so it belongs to the vault rather than to
    // whichever window happened to have focus when the layout became ready. Opening it on a focused popout binds the
    // connection to that popout, and closing the popout then closes the connection under a plugin that is still
    // loaded and still queueing writes.
    const request = window.indexedDB.open(`${app.appId}/external-rename-handler`, DB_VERSION);
    request.addEventListener('upgradeneeded', (event) => {
      if (event.newVersion !== 1) {
        return;
      }
      const database = request.result;
      database.createObjectStore(STORE_NAME, {
        keyPath: 'path'
      });
    });

    const database = await getResult(request);

    this._database = database;
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const databaseEntries = await getResult(store.getAll()) as DatabaseEntry[];
    for (const entry of databaseEntries) {
      this.twoWayMap.set(entry.path, entry.ino);
    }
  }

  public set(params: PathInoMapSetParams): void {
    const { ino, path } = params;
    const oldPath = this.getPath(ino);
    this.twoWayMap.set(path, ino);

    this.addStoreAction((store) => {
      store.delete(path);
      if (oldPath !== undefined && oldPath !== path) {
        store.delete(oldPath);
      }
      store.add({ ino, path });
    });
  }

  /**
   * Tears the map down: cancels the debounced flush, writes whatever is still queued while the connection is alive,
   * Then closes the connection.
   *
   * Idempotent, as `ComponentEx.registerDisposable` requires, because the owning component disposes the map it
   * Replaces on a second layout-ready and the registration disposes it again on unload.
   */
  public [Symbol.dispose](): void {
    if (this.isDisposed) {
      return;
    }

    this.processStoreActionsDebounced.cancel();
    this.processStoreActions();
    this.isDisposed = true;
    this._database?.close();
  }

  private addStoreAction(storeAction: (store: IDBObjectStore) => void): void {
    if (this.isDisposed) {
      return;
    }

    this.pendingStoreActions.push(storeAction);
    this.processStoreActionsDebounced();
  }

  private processStoreActions(): void {
    if (this.pendingStoreActions.length === 0) {
      return;
    }

    try {
      const transaction = this.database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const flushedStoreActionCount = this.pendingStoreActions.length;
      for (const storeAction of this.pendingStoreActions.slice(0, flushedStoreActionCount)) {
        storeAction(store);
      }
      transaction.commit();

      // Dropped only once the transaction has been accepted. Swapping the queue out first — as this method used to —
      // is what made a failed flush silent: the in-memory map and the store then disagree, and the divergence
      // survives to the next start.
      this.pendingStoreActions.splice(0, flushedStoreActionCount);
    } catch (error) {
      printError(new Error('Could not persist the pending path-ino store actions. They stay queued for the next flush.', { cause: error }));
    }
  }
}

async function getResult<T>(request: IDBRequest<T>): Promise<T> {
  if (request.readyState === 'done') {
    return request.result;
  }

  return await new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(new Error('IndexedDB request failed', { cause: request.error }));
    });
  });
}
