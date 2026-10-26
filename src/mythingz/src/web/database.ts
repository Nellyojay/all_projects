import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export type SqlParameter = string | number | null | Uint8Array | undefined;

export type DatabaseRunResult = {
  changes: number;
  lastInsertRowId: number;
};

export type BrowserDatabase = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...params: SqlParameter[]) => Promise<DatabaseRunResult>;
  getAllAsync: <T>(sql: string, ...params: SqlParameter[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, ...params: SqlParameter[]) => Promise<T | null>;
  withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
};

const storageName = 'mine-sqlite';
const storageKey = 'mine.db';
let databasePromise: Promise<BrowserDatabase> | undefined;

function openStorage() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(storageName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local SQLite storage.'));
  });
}

async function loadFile() {
  const storage = await openStorage();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const request = storage.transaction('files', 'readonly').objectStore('files').get(storageKey);
    request.onsuccess = () => {
      const value = request.result as ArrayBuffer | Uint8Array | undefined;
      storage.close();
      resolve(value ? (value instanceof Uint8Array ? value : new Uint8Array(value)) : undefined);
    };
    request.onerror = () => {
      storage.close();
      reject(request.error ?? new Error('Could not read the local SQLite database.'));
    };
  });
}

async function persistFile(database: SqlJsDatabase) {
  const bytes = database.export();
  const storage = await openStorage();
  await new Promise<void>((resolve, reject) => {
    const transaction = storage.transaction('files', 'readwrite');
    transaction.objectStore('files').put(bytes, storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local SQLite database.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the local SQLite database was aborted.'));
  }).finally(() => storage.close());
}

function asSqlValue(value: SqlParameter): SqlValue {
  return value ?? null;
}

function wrapDatabase(database: SqlJsDatabase): BrowserDatabase {
  let transactionDepth = 0;

  const persistIfReady = async () => {
    if (transactionDepth === 0) await persistFile(database);
  };

  const wrapper: BrowserDatabase = {
    async execAsync(sql: string) {
      database.exec(sql);
      await persistIfReady();
    },
    async runAsync(sql: string, ...params: SqlParameter[]) {
      database.run(sql, params.map(asSqlValue));
      const row = database.exec('SELECT changes() AS changes, last_insert_rowid() AS rowId')[0]?.values[0];
      const result = {
        changes: Number(row?.[0] ?? 0),
        lastInsertRowId: Number(row?.[1] ?? 0),
      };
      await persistIfReady();
      return result;
    },
    async getAllAsync<T>(sql: string, ...params: SqlParameter[]) {
      const statement = database.prepare(sql);
      try {
        statement.bind(params.map(asSqlValue));
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
    async getFirstAsync<T>(sql: string, ...params: SqlParameter[]) {
      const rows = await wrapper.getAllAsync<T>(sql, ...params);
      return rows[0] ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      database.run('BEGIN');
      transactionDepth += 1;
      try {
        await task();
        database.run('COMMIT');
      } catch (error) {
        database.run('ROLLBACK');
        throw error;
      } finally {
        transactionDepth -= 1;
      }
      await persistIfReady();
    },
  };

  return wrapper;
}

export function openBrowserDatabase() {
  databasePromise ??= (async () => {
    const SQL = await initSqlJs({ locateFile: () => sqliteWasmUrl });
    const existingFile = await loadFile();
    const database = new SQL.Database(existingFile);
    return wrapDatabase(database);
  })().catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}
