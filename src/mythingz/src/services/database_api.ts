import * as budgetOperations from './budget_database';
import * as financeOperations from './finance_database';
import * as listOperations from './list_database';
import * as noteOperations from './note_database';
import * as recordOperations from './record_database';
import * as recordsOperations from './records_database';
import {
  exportMyThingsData,
  refreshJsonBackupSnapshotIfDue,
} from './json_data';
import type { BrowserDatabase, SqlParameter } from '../web/database';

const tableDefinitions = {
  finance: {
    accounts: {
      table: 'accounts',
      columns: ['id', 'name', 'type', 'opening_balance', 'is_default'],
    },
    transactions: {
      table: 'transactions',
      columns: [
        'id', 'kind', 'title', 'category', 'amount', 'date', 'notes',
        'loan_id', 'account_id', 'transfer_id', 'refund_of_transaction_id',
      ],
    },
    transfers: {
      table: 'transfers',
      columns: ['id', 'from_account_id', 'to_account_id', 'amount', 'date', 'notes'],
    },
    loans: {
      table: 'loans',
      columns: ['id', 'lender', 'principal', 'fees', 'due_date', 'notes', 'created_at'],
    },
  },
  budgets: {
    budgets: {
      table: 'budgets',
      columns: [
        'id', 'name', 'type', 'template_id', 'start_date', 'end_date', 'total_allocated',
        'status', 'description', 'source_list_id', 'source_legacy_budget_id',
        'source_transaction_id', 'legacy_period_id', 'created_at', 'updated_at', 'closed_at',
      ],
    },
    budgetItems: {
      table: 'budget_items',
      columns: [
        'id', 'budget_id', 'template_item_id', 'name', 'allocated_amount', 'original_amount',
        'rollover_amount', 'saved_amount', 'rollover', 'alert_thresholds', 'notes',
        'description', 'metadata_json', 'position', 'source_list_id', 'created_at', 'updated_at',
      ],
    },
    budgetTemplates: {
      table: 'budget_templates',
      columns: [
        'id', 'name', 'description', 'recurrence', 'start_date', 'end_date', 'week_start_day',
        'active', 'archived', 'created_at', 'updated_at',
      ],
    },
    budgetTemplateItems: {
      table: 'budget_template_items',
      columns: [
        'id', 'template_id', 'name', 'description', 'allocated_amount', 'rollover',
        'alert_thresholds', 'active', 'position',
      ],
    },
    budgetPeriods: {
      table: 'budget_periods',
      columns: ['id', 'template_id', 'start_date', 'end_date', 'status', 'created_at', 'closed_at'],
    },
    budgetPeriodItems: {
      table: 'budget_period_items',
      columns: [
        'id', 'period_id', 'template_item_id', 'name', 'description', 'original_amount',
        'rollover_amount', 'saved_amount', 'rollover', 'alert_thresholds',
      ],
    },
    transactionAllocations: {
      table: 'transaction_allocations',
      columns: [
        'id', 'transaction_id', 'budget_id', 'budget_item_id', 'period_item_id', 'amount', 'created_at',
      ],
    },
    transactionRefunds: {
      table: 'transaction_refunds',
      columns: ['id', 'original_transaction_id', 'refund_transaction_id', 'amount', 'created_at'],
    },
    budgetRefundAllocations: {
      table: 'budget_refund_allocations',
      columns: ['id', 'refund_id', 'period_item_id', 'amount'],
    },
    budgetAdjustments: {
      table: 'budget_adjustments',
      columns: ['id', 'period_item_id', 'previous_amount', 'new_amount', 'difference', 'reason', 'created_at'],
    },
    budgetPeriodClosures: {
      table: 'budget_period_closures',
      columns: ['id', 'period_id', 'action', 'note', 'created_at'],
    },
    budgetAlerts: {
      table: 'budget_alerts',
      columns: ['id', 'period_item_id', 'threshold', 'created_at'],
    },
    legacyBudgetItemMap: {
      table: 'legacy_budget_item_map',
      columns: ['period_item_id', 'budget_item_id'],
      primaryKey: 'period_item_id',
    },
    legacyBudgets: {
      table: 'legacy_budgets',
      columns: ['id', 'title', 'category', 'amount', 'notes'],
    },
    legacyTransactionAllocations: {
      table: 'legacy_transaction_allocations',
      columns: ['id', 'transaction_id', 'period_item_id', 'amount', 'created_at'],
    },
    budgetItemRefundAllocations: {
      table: 'budget_item_refund_allocations',
      columns: ['id', 'refund_id', 'budget_item_id', 'amount'],
    },
    budgetItemAdjustments: {
      table: 'budget_item_adjustments',
      columns: ['id', 'budget_item_id', 'previous_amount', 'new_amount', 'difference', 'reason', 'created_at'],
    },
    budgetItemAlerts: {
      table: 'budget_item_alerts',
      columns: ['id', 'budget_item_id', 'threshold', 'created_at'],
    },
    budgetClosures: {
      table: 'budget_closures',
      columns: ['id', 'budget_id', 'action', 'note', 'created_at'],
    },
    migrationRuns: {
      table: 'budget_migration_runs',
      columns: [
        'version', 'status', 'started_at', 'completed_at', 'source_counts',
        'destination_counts', 'error',
      ],
      primaryKey: 'version',
    },
  },
  records: {
    events: {
      table: 'events',
      columns: ['id', 'title', 'category', 'date', 'notes'],
    },
    tasks: {
      table: 'tasks',
      columns: ['id', 'title', 'category', 'date', 'notes', 'completed', 'completed_at'],
    },
    notes: {
      table: 'notes',
      columns: ['id', 'title', 'category', 'notes', 'updated_at'],
    },
    lists: {
      table: 'lists',
      columns: [
        'id', 'title', 'notes', 'items', 'budget_enabled', 'finalized',
        'final_transaction_id', 'event_id',
      ],
    },
    links: {
      table: 'record_links',
      columns: ['id', 'source_type', 'source_id', 'target_type', 'target_id', 'created_at'],
    },
    reminders: {
      table: 'reminders',
      columns: [
        'id', 'title', 'description', 'due_at', 'status', 'related_type',
        'related_id', 'created_at', 'completed_at',
      ],
    },
    inboxItems: {
      table: 'inbox_items',
      columns: [
        'id', 'content', 'captured_at', 'suggested_type', 'status',
        'destination_type', 'destination_id',
      ],
    },
    activityLogs: {
      table: 'activity_logs',
      columns: ['id', 'action', 'module', 'record_id', 'description', 'occurred_at'],
    },
  },
} as const;

type TableDefinitions = typeof tableDefinitions;
type DatabaseValue = Exclude<SqlParameter, undefined>;
type TableRow<Columns extends readonly string[]> = {
  [Column in Columns[number]]: DatabaseValue;
};
type ListOptions<Columns extends readonly string[]> = {
  where?: Partial<TableRow<Columns>>;
  orderBy?: Columns[number];
  direction?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
};

export type TableApi<
  Columns extends readonly string[],
  PrimaryKey extends string = 'id',
> = {
  primaryKey: PrimaryKey;
  list: (options?: ListOptions<Columns>) => Promise<TableRow<Columns>[]>;
  findFirst: (options?: Omit<ListOptions<Columns>, 'limit' | 'offset'>) => Promise<TableRow<Columns> | null>;
  getById: (id: number) => Promise<TableRow<Columns> | null>;
  getByKey: (key: DatabaseValue) => Promise<TableRow<Columns> | null>;
  count: (where?: Partial<TableRow<Columns>>) => Promise<number>;
  create: (record: Partial<TableRow<Columns>>) => Promise<number>;
  update: (id: number, patch: Partial<TableRow<Columns>>) => Promise<boolean>;
  updateByKey: (key: DatabaseValue, patch: Partial<TableRow<Columns>>) => Promise<boolean>;
  delete: (id: number) => Promise<boolean>;
  deleteByKey: (key: DatabaseValue) => Promise<boolean>;
};

type GroupApi<Definitions> = {
  [Name in keyof Definitions]: Definitions[Name] extends {
    columns: infer Columns extends readonly string[];
    primaryKey?: infer PrimaryKey extends string;
  }
    ? TableApi<Columns, PrimaryKey>
    : never;
};

export type DatabaseTablesApi = {
  [Group in keyof TableDefinitions]: GroupApi<TableDefinitions[Group]>;
};

type BoundOperations<Operations> = {
  [Name in keyof Operations as Operations[Name] extends (
    database: BrowserDatabase,
    ...args: infer _Args
  ) => unknown ? Name : never]: Operations[Name] extends (
    database: BrowserDatabase,
    ...args: infer Args
  ) => infer Result ? (...args: Args) => Result : never;
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function createTableApi<const Columns extends readonly string[]>(
  database: BrowserDatabase,
  table: string,
  columns: Columns,
  primaryKey = 'id',
): TableApi<Columns, typeof primaryKey> {
  const allowedColumns = new Set<string>(columns);
  const idIsColumn = allowedColumns.has('id');
  if (!allowedColumns.has(primaryKey)) {
    throw new Error(`Unknown ${table} primary key: ${primaryKey}`);
  }
  const assertColumn = (column: string) => {
    if (!allowedColumns.has(column)) throw new Error(`Unknown ${table} column: ${column}`);
  };
  const buildWhere = (where: Partial<TableRow<Columns>> = {}) => {
    const conditions: string[] = [];
    const values: SqlParameter[] = [];
    const entries = Object.entries(where) as [string, SqlParameter][];
    for (const [column, value] of entries) {
      if (value === undefined) continue;
      assertColumn(column);
      if (value === null) conditions.push(`${quoteIdentifier(column)} IS NULL`);
      else {
        conditions.push(`${quoteIdentifier(column)} = ?`);
        values.push(value);
      }
    }
    return {
      sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
      values,
    };
  };
  const buildRecord = (
    record: Partial<TableRow<Columns>>,
    operation: string,
    isUpdate = false,
  ) => {
    const entries = (Object.entries(record) as [string, SqlParameter][])
      .filter(([, value]) => value !== undefined);
    for (const [column] of entries) {
      assertColumn(column);
      if (column === primaryKey && isUpdate) {
        throw new Error(`Do not change the ${table} primary key when ${operation}.`);
      }
      if (column === 'id' && !isUpdate) {
        throw new Error(`Do not provide an id when ${operation} ${table}.`);
      }
    }
    if (!entries.length) throw new Error(`Provide at least one field when ${operation} ${table}.`);
    return entries;
  };

  const api: TableApi<Columns, typeof primaryKey> = {
    primaryKey,
    async list(options = {}) {
      const { sql: whereSql, values } = buildWhere(options.where);
      let orderSql = '';
      if (options.orderBy) {
        assertColumn(options.orderBy);
        const direction = options.direction ?? 'ASC';
        orderSql = ` ORDER BY ${quoteIdentifier(options.orderBy)} ${direction}`;
      } else if (idIsColumn) {
        orderSql = ' ORDER BY "id" ASC';
      }
      let pagingSql = '';
      if (options.limit !== undefined) {
        if (!Number.isInteger(options.limit) || options.limit < 0) {
          throw new Error('The list limit must be a non-negative integer.');
        }
        pagingSql = ' LIMIT ?';
        values.push(options.limit);
        if (options.offset !== undefined) {
          if (!Number.isInteger(options.offset) || options.offset < 0) {
            throw new Error('The list offset must be a non-negative integer.');
          }
          pagingSql += ' OFFSET ?';
          values.push(options.offset);
        }
      } else if (options.offset !== undefined) {
        if (!Number.isInteger(options.offset) || options.offset < 0) {
          throw new Error('The list offset must be a non-negative integer.');
        }
        pagingSql = ' LIMIT -1 OFFSET ?';
        values.push(options.offset);
      }
      return database.getAllAsync<TableRow<Columns>>(
        `SELECT * FROM ${quoteIdentifier(table)}${whereSql}${orderSql}${pagingSql}`,
        ...values,
      );
    },
    async findFirst(options = {}) {
      const rows = await api.list({ ...options, limit: 1 });
      return rows[0] ?? null;
    },
    async getById(id) {
      if (!idIsColumn) throw new Error(`${table} has no id column.`);
      return api.getByKey(id);
    },
    async getByKey(key) {
      const row = await database.getFirstAsync<TableRow<Columns>>(
        `SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(primaryKey)} = ?`,
        key,
      );
      return row;
    },
    async count(where) {
      const { sql, values } = buildWhere(where);
      const result = await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}${sql}`,
        ...values,
      );
      return result?.count ?? 0;
    },
    async create(record) {
      const entries = buildRecord(record, 'creating');
      const names = entries.map(([column]) => quoteIdentifier(column)).join(', ');
      const placeholders = entries.map(() => '?').join(', ');
      const result = await database.runAsync(
        `INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${placeholders})`,
        ...entries.map(([, value]) => value),
      );
      return result.lastInsertRowId;
    },
    async update(id, patch) {
      if (!idIsColumn) throw new Error(`${table} has no id column.`);
      return api.updateByKey(id, patch);
    },
    async updateByKey(key, patch) {
      const entries = buildRecord(patch, 'updating', true);
      const assignments = entries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(', ');
      const result = await database.runAsync(
        `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${quoteIdentifier(primaryKey)} = ?`,
        ...entries.map(([, value]) => value),
        key,
      );
      return result.changes > 0;
    },
    async delete(id) {
      if (!idIsColumn) throw new Error(`${table} has no id column.`);
      return api.deleteByKey(id);
    },
    async deleteByKey(key) {
      const result = await database.runAsync(
        `DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(primaryKey)} = ?`,
        key,
      );
      return result.changes > 0;
    },
  };
  return api;
}

function createTableGroup<const Definitions extends Record<string, {
  readonly table: string;
  readonly columns: readonly string[];
  readonly primaryKey?: string;
}>>(database: BrowserDatabase, definitions: Definitions): GroupApi<Definitions> {
  const group: Record<string, TableApi<readonly string[], string>> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    group[name] = createTableApi(
      database,
      definition.table,
      definition.columns,
      definition.primaryKey,
    );
  }
  return group as GroupApi<Definitions>;
}

function bindOperations<Operations extends Record<string, (...args: never[]) => unknown>>(
  database: BrowserDatabase,
  operations: Operations,
): BoundOperations<Operations> {
  const bound: Record<string, (...args: never[]) => unknown> = {};
  for (const [name, operation] of Object.entries(operations)) {
    if (typeof operation === 'function' && operation.length > 0) {
      bound[name] = (...args: never[]) => Reflect.apply(operation, undefined, [database, ...args]);
    }
  }
  return bound as BoundOperations<Operations>;
}

export function createDatabaseApi(database: BrowserDatabase) {
  return {
    tables: {
      finance: createTableGroup(database, tableDefinitions.finance),
      budgets: createTableGroup(database, tableDefinitions.budgets),
      records: createTableGroup(database, tableDefinitions.records),
    },
    finance: bindOperations(database, financeOperations),
    budgets: bindOperations(database, budgetOperations),
    records: bindOperations(database, recordsOperations),
    recordEditor: bindOperations(database, recordOperations),
    lists: bindOperations(database, listOperations),
    notes: bindOperations(database, noteOperations),
    backups: {
      exportSqlite: () => database.exportDatabaseAsync(),
      restoreSqlite: (bytes: Uint8Array) => database.restoreDatabaseAsync(bytes),
      exportJson: () => exportMyThingsData(database),
      refreshJsonSnapshot: () => refreshJsonBackupSnapshotIfDue(database),
      getJsonSnapshot: () => database.getJsonBackupSnapshotAsync(),
    },
    transaction: (task: () => Promise<void>) => database.withTransactionAsync(task),
  };
}
