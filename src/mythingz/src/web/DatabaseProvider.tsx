import { createContext, useContext, type ReactNode } from 'react';
import { createSampleDatabase, type BrowserDatabase } from './database';

const DatabaseContext = createContext<BrowserDatabase | null>(null);
const sampleDatabase = createSampleDatabase();

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return <DatabaseContext.Provider value={sampleDatabase}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const database = useContext(DatabaseContext);
  if (!database) throw new Error('The sample data provider is not available.');
  return database;
}
