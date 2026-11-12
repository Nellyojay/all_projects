import type { Database } from '../types/database.types';
import { getSupabaseClient } from '../lib/supabase';

export type TableName = keyof Database['public']['Tables'];
export type TableRow<Name extends TableName> = Database['public']['Tables'][Name]['Row'];
export type TableInsert<Name extends TableName> = Database['public']['Tables'][Name]['Insert'];
type AnyUpdate = { [Name in TableName]: Database['public']['Tables'][Name]['Update'] }[TableName];
export type OwnedKey = string | number | Record<string, string | number>;

function getKeyEntries(keyColumns: readonly string[], key: OwnedKey) {
  const entries = typeof key === 'object'
    ? Object.entries(key)
    : [[keyColumns[0], key] as [string, string | number]];
  if (entries.length !== keyColumns.length || entries.some(([column]) => !keyColumns.includes(column))) {
    throw new Error(`Provide all key columns: ${keyColumns.join(', ')}.`);
  }
  return entries;
}

async function requireUserId() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw new Error(`Could not verify the current user: ${error.message}`);
  if (!data.user) throw new Error('Sign in before accessing cloud data.');
  return data.user.id;
}

export async function listOwnedRows<Name extends TableName>(table: Name): Promise<TableRow<Name>[]> {
  const userId = await requireUserId();
  const { data, error } = await getSupabaseClient()
    .from(table as TableName)
    .select('*')
    .eq('user_id' as never, userId as never);
  if (error) throw new Error(`Could not load ${table}: ${error.message}`);
  return (data ?? []) as unknown as TableRow<Name>[];
}

export async function createOwnedRow<Name extends TableName>(
  table: Name,
  values: Omit<TableInsert<Name>, 'user_id'>,
): Promise<TableRow<Name>> {
  const userId = await requireUserId();
  const row = { ...values, user_id: userId };
  const { data, error } = await getSupabaseClient()
    .from(table as TableName)
    .insert(row as never)
    .select('*')
    .single();
  if (error) throw new Error(`Could not create ${table} record: ${error.message}`);
  return data as unknown as TableRow<Name>;
}

export async function updateOwnedRow<Name extends TableName>(
  table: Name,
  keyColumns: readonly string[],
  key: OwnedKey,
  patch: Partial<Omit<TableRow<Name>, 'user_id' | 'id'>>,
): Promise<boolean> {
  const userId = await requireUserId();
  let query = getSupabaseClient()
    .from(table as TableName)
    .update(patch as AnyUpdate)
    .eq('user_id' as never, userId as never);
  for (const [column, value] of getKeyEntries(keyColumns, key)) query = query.eq(column as never, value as never);
  const { data, error } = await query.select('user_id');
  if (error) throw new Error(`Could not update ${table} record: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function deleteOwnedRow(
  table: TableName,
  keyColumns: readonly string[],
  key: OwnedKey,
): Promise<boolean> {
  const userId = await requireUserId();
  let query = getSupabaseClient()
    .from(table as TableName)
    .delete()
    .eq('user_id' as never, userId as never);
  for (const [column, value] of getKeyEntries(keyColumns, key)) query = query.eq(column as never, value as never);
  const { data, error } = await query.select('user_id');
  if (error) throw new Error(`Could not delete ${table} record: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export function createOwnedTableApi<Name extends TableName>(
  table: Name,
  keyColumns: readonly string[] = ['id'],
) {
  return {
    list: () => listOwnedRows(table),
    create: (values: Omit<TableInsert<Name>, 'user_id'>) => createOwnedRow(table, values),
    update: (
      key: OwnedKey,
      patch: Partial<Omit<TableRow<Name>, 'user_id' | 'id'>>,
    ) => updateOwnedRow(table, keyColumns, key, patch),
    delete: (key: OwnedKey) => deleteOwnedRow(table, keyColumns, key),
  };
}
