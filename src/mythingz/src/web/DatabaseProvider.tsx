import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  openBrowserDatabase,
  type BrowserDatabase,
} from './database';
import { initializeDatabase } from '../services/database';

const DatabaseContext = createContext<BrowserDatabase | null>(null);
let initializedDatabase: Promise<BrowserDatabase> | undefined;

function getInitializedDatabase() {
  initializedDatabase ??= openBrowserDatabase()
    .then(async (database) => {
      await initializeDatabase(database);
      return database;
    })
    .catch((error: unknown) => {
      initializedDatabase = undefined;
      throw error;
    });
  return initializedDatabase;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<BrowserDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getInitializedDatabase()
      .then((opened) => {
        if (active) setDatabase(opened);
      })
      .catch((reason: unknown) => {
        console.error('Unable to initialize the local SQLite database', reason);
        if (active) {
          setError(reason instanceof Error ? reason.message : 'The local database could not be opened.');
        }
      });
    return () => { active = false; };
  }, []);

  if (error) {
    return (
      <main className="database-error" role="alert">
        <h1>Unable to open your workspace</h1>
        <p>{error}</p>
        <p>Your browser may be blocking local storage. Enable site storage and reload.</p>
      </main>
    );
  }
  if (!database) {
    return <main className="database-loading" role="status">Opening your private workspace…</main>;
  }
  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const database = useContext(DatabaseContext);
  if (!database) throw new Error('The database is not available outside DatabaseProvider.');
  return database;
}
