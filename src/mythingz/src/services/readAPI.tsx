import { useMemo } from 'react';
import { useDatabase } from '../web/DatabaseProvider';
import { createDatabaseApi } from './database_api';

export function useMyThingsDb() {
  const database = useDatabase();

  return useMemo(() => createDatabaseApi(database), [database]);
}