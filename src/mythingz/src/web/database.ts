import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js';
import sqliteWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { initializeDatabase } from '../services/schema_database';

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
  exportDatabaseAsync: () => Promise<Uint8Array>;
  restoreDatabaseAsync: (bytes: Uint8Array) => Promise<void>;
  createBackupAsync: (backupKey: string) => Promise<void>;
};

const storageName = 'mine-sqlite';
const storageKey = 'mine.db';
const storageObjectStoreName = 'files';
let databasePromise: Promise<BrowserDatabase> | undefined;

function openStorage() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(storageName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storageObjectStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local SQLite storage.'));
  });
}

async function loadFile() {
  const storage = await openStorage();
  return new Promise<Uint8Array | undefined>((resolve, reject) => {
    const request = storage.transaction(storageObjectStoreName, 'readonly')
      .objectStore(storageObjectStoreName)
      .get(storageKey);
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
    const transaction = storage.transaction(storageObjectStoreName, 'readwrite');
    transaction.objectStore(storageObjectStoreName).put(bytes, storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local SQLite database.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the local SQLite database was aborted.'));
  }).finally(() => storage.close());
}

function asSqlValue(value: SqlParameter): SqlValue {
  return value ?? null;
}

function wrapDatabase(
  initialDatabase: SqlJsDatabase,
  createDatabase: (bytes: Uint8Array) => SqlJsDatabase,
  persistChanges = true,
): BrowserDatabase {
  let database = initialDatabase;
  let transactionDepth = 0;
  let transactionQueue = Promise.resolve();

  const persistIfReady = async () => {
    if (persistChanges && transactionDepth === 0) await persistFile(database);
  };

  const wrapper: BrowserDatabase = {
    async createBackupAsync(backupKey: string) {
      if (!backupKey || backupKey === storageKey) {
        throw new Error('Choose a distinct name for the database backup.');
      }
      const bytes = database.export();
      const storage = await openStorage();
      try {
        let created = false;
        await new Promise<void>((resolve, reject) => {
          const transaction = storage.transaction(storageObjectStoreName, 'readwrite');
          const store = transaction.objectStore(storageObjectStoreName);
          const request = store.get(backupKey);
          request.onsuccess = () => {
            if (request.result === undefined) {
              store.put(bytes, backupKey);
              created = true;
            }
          };
          request.onerror = () => reject(request.error ?? new Error('Could not inspect the database backup.'));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the database backup.'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Saving the database backup was aborted.'));
        });
        const verified = await new Promise<Uint8Array>((resolve, reject) => {
          const transaction = storage.transaction(storageObjectStoreName, 'readonly');
          const request = transaction.objectStore(storageObjectStoreName).get(backupKey);
          request.onsuccess = () => {
            const value = request.result as ArrayBuffer | Uint8Array | undefined;
            if (!value) {
              reject(new Error('The database backup could not be verified.'));
              return;
            }
            resolve(value instanceof Uint8Array ? value : new Uint8Array(value));
          };
          request.onerror = () => reject(request.error ?? new Error('Could not verify the database backup.'));
        });
        if (verified.length === 0) {
          throw new Error('The saved database backup is empty and cannot be verified.');
        }
        if (created && (verified.length !== bytes.length
          || verified.some((byte, index) => byte !== bytes[index]))) {
          throw new Error('The saved database backup does not match the current database.');
        }
      } finally {
        storage.close();
      }
    },
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
    async exportDatabaseAsync() {
      return database.export();
    },
    async restoreDatabaseAsync(bytes: Uint8Array) {
      if (bytes.length < 16
        || new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\u0000') {
        throw new Error('This is not a valid SQLite backup file.');
      }

      const previousTransaction = transactionQueue;
      let releaseTransaction!: () => void;
      transactionQueue = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;

      let restoredDatabase: SqlJsDatabase | undefined;
      try {
        restoredDatabase = createDatabase(bytes);
        const restoredWrapper = wrapDatabase(restoredDatabase, createDatabase, false);
        const checkIntegrity = async () => {
          const result = await restoredWrapper.getFirstAsync<{ integrity_check: string }>(
            'PRAGMA integrity_check',
          );
          if (result?.integrity_check !== 'ok') {
            throw new Error('The selected database file is damaged and cannot be restored.');
          }
        };
        const checkAppDatabase = async () => {
          const tables = await restoredWrapper.getAllAsync<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table'",
          );
          if (!tables.some((table) => table.name === 'accounts')
            || !tables.some((table) => table.name === 'transactions')) {
            throw new Error('This file does not contain a compatible Mine backup.');
          }
        };

        await checkIntegrity();
        await checkAppDatabase();
        await initializeDatabase(restoredWrapper);
        await checkIntegrity();
        await persistFile(restoredDatabase);
        const previousDatabase = database;
        database = restoredDatabase;
        restoredDatabase = undefined;
        previousDatabase.close();
      } finally {
        restoredDatabase?.close();
        releaseTransaction();
      }
    },
    async withTransactionAsync(task: () => Promise<void>) {
      const previousTransaction = transactionQueue;
      let releaseTransaction!: () => void;
      transactionQueue = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      try {
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
      } finally {
        releaseTransaction();
      }
    },
  };

  return wrapper;
}

export function openBrowserDatabase() {
  databasePromise ??= (async () => {
    const SQL = await initSqlJs({ locateFile: () => sqliteWasmUrl });
    const existingFile = await loadFile();
    const database = new SQL.Database(existingFile);
    return wrapDatabase(database, (bytes) => new SQL.Database(bytes));
  })().catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}
