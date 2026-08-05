import type { App } from 'obsidian';

import { debounce } from 'obsidian';
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

export class PathInoMap {
  private _database?: IDBDatabase;

  private pendingStoreActions: ((store: IDBObjectStore) => void)[] = [];

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
    const request = activeWindow.indexedDB.open(`${app.appId}/external-rename-handler`, DB_VERSION);
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

  private addStoreAction(storeAction: (store: IDBObjectStore) => void): void {
    this.pendingStoreActions.push(storeAction);
    this.processStoreActionsDebounced();
  }

  private processStoreActions(): void {
    const pendingStoreActions = this.pendingStoreActions;
    this.pendingStoreActions = [];

    const transaction = this.database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const action of pendingStoreActions) {
      action(store);
    }
    transaction.commit();
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
