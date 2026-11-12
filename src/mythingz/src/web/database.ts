import type {
  Account,
  ActivityRecord,
  EventRecord,
  InboxItem,
  Loan,
  ListRecord,
  NoteRecord,
  ReminderRecord,
  TaskRecord,
  Transaction,
  Transfer,
} from '../services/database_types';

export type SqlParameter = string | number | null | Uint8Array | undefined;
export type DatabaseRunResult = { changes: number; lastInsertRowId: number };
type Row = Record<string, unknown>;

export type BrowserDatabase = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...params: SqlParameter[]) => Promise<DatabaseRunResult>;
  getAllAsync: <T>(sql: string, ...params: SqlParameter[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, ...params: SqlParameter[]) => Promise<T | null>;
  withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
};

const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const now = () => new Date().toISOString();

const tables: Record<string, Row[]> = {
  accounts: [
    { id: 1, name: 'Cash wallet', type: 'Cash wallet', opening_balance: 185000, is_default: 1 },
    { id: 2, name: 'Main bank account', type: 'Bank account', opening_balance: 2300000, is_default: 0 },
  ],
  transactions: [
    { id: 1, kind: 'expense', title: 'Market shopping', category: 'Food and groceries', amount: 85000, date: dateOffset(0), notes: 'Weekly groceries', loan_id: null, account_id: 1, transfer_id: null, refund_of_transaction_id: null },
    { id: 2, kind: 'income', title: 'Monthly salary', category: 'Salary', amount: 1800000, date: dateOffset(-1), notes: '', loan_id: null, account_id: 2, transfer_id: null, refund_of_transaction_id: null },
    { id: 3, kind: 'expense', title: 'Taxi to town', category: 'Transport', amount: 18000, date: dateOffset(-1), notes: '', loan_id: null, account_id: 1, transfer_id: null, refund_of_transaction_id: null },
  ],
  transfers: [
    { id: 1, from_account_id: 2, to_account_id: 1, amount: 50000, date: dateOffset(-2), notes: 'Weekly cash', charges: '[]' },
  ],
  loans: [
    { id: 1, lender: 'Sam', principal: 250000, fees: 0, due_date: dateOffset(8), notes: 'Sample loan', created_at: now(), repaid: 50000 },
  ],
  events: [
    { id: 1, title: 'Team check-in', category: 'Work', date: dateOffset(0), notes: 'Weekly planning', budget_count: 0 },
    { id: 2, title: 'Dentist appointment', category: 'Health', date: dateOffset(1), notes: '', budget_count: 0 },
    { id: 3, title: 'Family lunch', category: 'Personal', date: dateOffset(4), notes: '', budget_count: 0 },
  ],
  tasks: [
    { id: 1, title: 'Pick up groceries', category: 'Personal', date: dateOffset(0), notes: '', completed: 0, completed_at: null },
    { id: 2, title: 'Send project update', category: 'Work', date: dateOffset(0), notes: '', completed: 0, completed_at: null },
    { id: 3, title: 'Morning walk', category: 'Personal', date: dateOffset(-1), notes: '', completed: 1, completed_at: now() },
    { id: 4, title: 'Book car service', category: 'Errands', date: dateOffset(2), notes: '', completed: 0, completed_at: null },
  ],
  notes: [
    { id: 1, title: 'Ideas for the weekend', category: 'Personal', notes: 'Explore a new walking trail.', updated_at: now() },
    { id: 2, title: 'Project kickoff notes', category: 'Work', notes: 'Agree on scope and next steps.', updated_at: now() },
    { id: 3, title: 'Things to remember', category: 'Personal', notes: 'Renew the home internet plan.', updated_at: now() },
  ],
  lists: [
    { id: 1, title: 'Weekly groceries', notes: '', items: JSON.stringify([{ text: 'Vegetables', done: false, price: 60000, quantity: 1 }, { text: 'Fruit', done: false, price: 45000, quantity: 1 }]), budget_enabled: 1, finalized: 0, final_transaction_id: null, event_id: null },
    { id: 2, title: 'Home supplies', notes: '', items: JSON.stringify([{ text: 'Laundry soap', done: false, price: 32000, quantity: 1 }]), budget_enabled: 1, finalized: 0, final_transaction_id: null, event_id: null },
    { id: 3, title: 'Trip packing list', notes: '', items: JSON.stringify([{ text: 'Walking shoes', done: false, price: 0, quantity: 1 }]), budget_enabled: 0, finalized: 0, final_transaction_id: null, event_id: null },
  ],
  record_links: [],
  reminders: [
    { id: 1, title: 'Water bill', description: 'Pay this month’s water bill.', due_at: `${dateOffset(0)}T18:00:00`, status: 'pending', related_type: null, related_id: null, created_at: now(), completed_at: null },
    { id: 2, title: 'Renew subscription', description: '', due_at: `${dateOffset(5)}T09:00:00`, status: 'pending', related_type: null, related_id: null, created_at: now(), completed_at: null },
  ],
  inbox_items: [
    { id: 1, content: 'Check new book recommendation', captured_at: now(), suggested_type: 'idea', status: 'inbox', destination_type: null, destination_id: null },
    { id: 2, content: 'Look into a weekend hike', captured_at: now(), suggested_type: 'idea', status: 'inbox', destination_type: null, destination_id: null },
  ],
  activity_logs: [
    { id: 1, action: 'created', module: 'finances', record_id: 1, description: 'Added transaction: Market shopping', occurred_at: now() },
    { id: 2, action: 'completed', module: 'tasks', record_id: 3, description: 'Completed task: Morning walk', occurred_at: now() },
    { id: 3, action: 'updated', module: 'lists', record_id: 1, description: 'Updated list: Weekly groceries', occurred_at: now() },
  ],
  budgets: [
    { id: 1, name: 'Monthly essentials', title: 'Monthly essentials', type: 'normal', template_id: 1, start_date: dateOffset(-5), end_date: dateOffset(25), total_allocated: 800000, status: 'active', description: '', created_at: now(), updated_at: now(), closed_at: null },
    { id: 2, name: 'Weekend plans', title: 'Weekend plans', type: 'normal', template_id: null, start_date: dateOffset(-5), end_date: dateOffset(25), total_allocated: 250000, status: 'active', description: '', created_at: now(), updated_at: now(), closed_at: null },
    { id: 3, name: 'Transport', title: 'Transport', type: 'recurring', template_id: 2, start_date: dateOffset(-5), end_date: dateOffset(25), total_allocated: 150000, status: 'active', description: '', created_at: now(), updated_at: now(), closed_at: null },
  ],
  budget_items: [
    { id: 1, budget_id: 1, template_item_id: null, name: 'Food', allocated_amount: 800000, original_amount: 800000, rollover_amount: 0, saved_amount: 0, rollover: 'reset', alert_thresholds: '[80,100]', notes: '', description: '', metadata_json: '{}', position: 0, source_list_id: null, actual_amount: 512000, refunded_amount: 0, remaining_amount: 288000 },
    { id: 2, budget_id: 2, template_item_id: null, name: 'Weekend plans', allocated_amount: 250000, original_amount: 250000, rollover_amount: 0, saved_amount: 0, rollover: 'reset', alert_thresholds: '[80,100]', notes: '', description: '', metadata_json: '{}', position: 0, source_list_id: null, actual_amount: 198000, refunded_amount: 0, remaining_amount: 52000 },
    { id: 3, budget_id: 3, template_item_id: null, name: 'Transport', allocated_amount: 150000, original_amount: 150000, rollover_amount: 0, saved_amount: 0, rollover: 'carry', alert_thresholds: '[80,100]', notes: '', description: '', metadata_json: '{}', position: 0, source_list_id: null, actual_amount: 67000, refunded_amount: 0, remaining_amount: 83000 },
  ],
  budget_templates: [
    { id: 1, name: 'Monthly essentials', description: '', recurrence: 'monthly', start_date: dateOffset(-5), end_date: null, week_start_day: null, active: 1, archived: 0, created_at: now(), updated_at: now() },
    { id: 2, name: 'Transport', description: '', recurrence: 'monthly', start_date: dateOffset(-5), end_date: null, week_start_day: null, active: 1, archived: 0, created_at: now(), updated_at: now() },
  ],
  budget_template_items: [
    { id: 1, template_id: 1, name: 'Monthly essentials', description: '', allocated_amount: 800000, rollover: 'reset', alert_thresholds: '[80,100]', active: 1, position: 0 },
    { id: 2, template_id: 2, name: 'Transport', description: '', allocated_amount: 150000, rollover: 'carry', alert_thresholds: '[80,100]', active: 1, position: 0 },
  ],
  budget_periods: [
    { id: 1, template_id: 1, start_date: dateOffset(-5), end_date: dateOffset(25), status: 'active', created_at: now(), closed_at: null, template_name: 'Monthly essentials', recurrence: 'monthly' },
    { id: 2, template_id: 2, start_date: dateOffset(-5), end_date: dateOffset(25), status: 'active', created_at: now(), closed_at: null, template_name: 'Transport', recurrence: 'monthly' },
  ],
  budget_period_items: [
    { id: 1, period_id: 1, template_item_id: 1, name: 'Essentials', description: '', original_amount: 800000, rollover_amount: 0, saved_amount: 0, rollover: 'reset', alert_thresholds: '[80,100]', final_amount: 800000, actual_amount: 512000, refunded_amount: 0 },
    { id: 2, period_id: 2, template_item_id: 2, name: 'Transport', description: '', original_amount: 150000, rollover_amount: 0, saved_amount: 0, rollover: 'carry', alert_thresholds: '[80,100]', final_amount: 150000, actual_amount: 67000, refunded_amount: 0 },
  ],
  transaction_allocations: [],
  transaction_refunds: [],
  budget_refund_allocations: [],
  budget_adjustments: [],
  budget_period_closures: [],
  budget_alerts: [],
  legacy_budget_item_map: [],
  legacy_budgets: [],
  legacy_transaction_allocations: [],
  budget_item_refund_allocations: [],
  budget_item_adjustments: [],
  budget_item_alerts: [],
  budget_closures: [],
  budget_migration_runs: [],
};

const tablePattern = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`]?([a-z_]+)["`]?(?:\s+(?:AS\s+)?([a-z_]+))?/i;

function getTable(sql: string) {
  const match = tablePattern.exec(sql);
  if (!match) return '';
  return match[1].toLowerCase();
}

function enrichRows(table: string, rows: Row[]) {
  if (table === 'transactions') {
    const accounts = tables.accounts;
    return rows.map((row) => ({
      ...row,
      account_name: accounts.find((account) => account.id === row.account_id)?.name ?? null,
    }));
  }
  if (table === 'accounts') {
    return rows.map((row) => {
      const accountTransactions = tables.transactions.filter((transaction) => transaction.account_id === row.id);
      const accountTransfers = tables.transfers.filter((transfer) =>
        transfer.from_account_id === row.id || transfer.to_account_id === row.id);
      const income = accountTransactions.reduce((sum, transaction) =>
        sum + (transaction.kind === 'income' ? Number(transaction.amount) : -Number(transaction.amount)), 0);
      const transferBalance = accountTransfers.reduce((sum, transfer) =>
        sum + (transfer.to_account_id === row.id ? Number(transfer.amount) : -Number(transfer.amount)), 0);
      return { ...row, balance: Number(row.opening_balance ?? 0) + income + transferBalance };
    });
  }
  if (table === 'transfers') {
    return rows.map((row) => ({
      ...row,
      from_account_name: tables.accounts.find((account) => account.id === row.from_account_id)?.name ?? '',
      to_account_name: tables.accounts.find((account) => account.id === row.to_account_id)?.name ?? '',
      charges: [],
    }));
  }
  if (table === 'loans') {
    return rows.map((row) => ({ ...row, repaid: Number(row.repaid ?? 0) }));
  }
  if (table === 'lists') {
    return rows.map((row) => ({
      ...row,
      event_title: tables.events.find((event) => event.id === row.event_id)?.title ?? null,
    }));
  }
  return rows;
}

function filterRows(rows: Row[], sql: string, params: SqlParameter[]) {
  const whereIndex = sql.toUpperCase().indexOf(' WHERE ');
  if (whereIndex < 0) return rows;
  const where = sql.slice(whereIndex + 7).split(/\bORDER BY\b|\bGROUP BY\b|\bLIMIT\b/i)[0];
  const clauses = [...where.matchAll(/(AND|OR)?\s*\(?\s*([a-z_]+(?:\.[a-z_]+)?)\s*(=|!=|<>|>=|<=|>|<|LIKE|IN)\s*(\?|\'[^\']*\'|-?\d+(?:\.\d+)?)/gi)];
  if (!clauses.length) return rows;
  let paramIndex = 0;
  const predicates = clauses.map((match) => {
    const qualifiedColumn = match[2].toLowerCase();
    const column = qualifiedColumn === 'source.name'
      ? 'from_account_name'
      : qualifiedColumn === 'destination.name' ? 'to_account_name'
        : (qualifiedColumn.split('.').pop() ?? '');
    const op = match[3].toUpperCase();
    let value: SqlParameter;
    if (match[4] === '?') value = params[paramIndex++];
    else if (match[4].startsWith("'")) value = match[4].slice(1, -1);
    else value = Number(match[4]);
    return (row: Row) => {
      const actual = row[column];
      switch (op) {
        case '=': return actual == value;
        case '!=':
        case '<>': return actual != value;
        case '>': return Number(actual) > Number(value);
        case '>=': return Number(actual) >= Number(value);
        case '<': return Number(actual) < Number(value);
        case '<=': return Number(actual) <= Number(value);
        case 'LIKE': return String(actual ?? '').toLowerCase().includes(String(value ?? '').replace(/%/g, '').toLowerCase());
        case 'IN': return true;
        default: return true;
      }
    };
  });
  return rows.filter((row) => {
    let result = predicates[0](row);
    for (let index = 1; index < predicates.length; index += 1) {
      if (clauses[index][1]?.toUpperCase() === 'OR') {
        result = result || predicates[index](row);
      } else {
        result = result && predicates[index](row);
      }
    }
    return result;
  });
}

function sortAndLimit(rows: Row[], sql: string, params: SqlParameter[]) {
  const orderMatch = /\bORDER BY\s+([a-z_.,\s]+?)(?:\s+LIMIT\b|\s+OFFSET\b|$)/i.exec(sql);
  if (orderMatch) {
    const order = orderMatch[1].split(',').map((field) => field.trim().split(/\s+/));
    rows.sort((a, b) => {
      for (const [rawColumn, direction] of order) {
        const column = rawColumn.split('.').pop() ?? rawColumn;
        const left = a[column];
        const right = b[column];
        const compare = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left ?? '').localeCompare(String(right ?? ''));
        if (compare !== 0) return direction?.toUpperCase() === 'DESC' ? -compare : compare;
      }
      return 0;
    });
  }
  const limitMatch = /\bLIMIT\s+(\?|\d+)/i.exec(sql);
  const offsetMatch = /\bOFFSET\s+(\?|\d+)/i.exec(sql);
  const limit = limitMatch
    ? Number(limitMatch[1] === '?' ? params[params.length - (offsetMatch ? 2 : 1)] : limitMatch[1])
    : undefined;
  const offset = offsetMatch
    ? Number(offsetMatch[1] === '?' ? params[params.length - 1] : offsetMatch[1])
    : 0;
  return rows.slice(offset, limit === undefined || !Number.isFinite(limit) ? undefined : offset + limit);
}

export function createSampleDatabase(): BrowserDatabase {
  let nextId = 100;
  const getAllAsync = async <T>(sql: string, ...params: SqlParameter[]): Promise<T[]> => {
    const table = getTable(sql);
    let rows = enrichRows(table, [...(tables[table] ?? [])]);
    rows = filterRows(rows, sql, params);
    rows = sortAndLimit(rows, sql, params);
    return rows as T[];
  };
  return {
    async execAsync() {},
    async getAllAsync<T>(sql: string, ...params: SqlParameter[]) {
      return getAllAsync<T>(sql, ...params);
    },
    async getFirstAsync<T>(sql: string, ...params: SqlParameter[]) {
      const table = getTable(sql);
      const rows = filterRows([...(tables[table] ?? [])], sql, params);
      if (/COUNT\s*\(/i.test(sql)) return { count: rows.length, total: rows.length } as T;
      const sumColumn = /SUM\s*\(\s*([a-z_]+)\s*\)/i.exec(sql)?.[1];
      if (sumColumn) {
        const total = rows.reduce((sum, row) => sum + (Number(row[sumColumn]) || 0), 0);
        return { total } as T;
      }
      return (await getAllAsync<T>(sql, ...params))[0] ?? null;
    },
    async runAsync(sql, ...params) {
      const table = getTable(sql);
      const rows = tables[table] ?? (tables[table] = []);
      if (/^\s*INSERT\b/i.test(sql)) {
        const columns = /\(([^)]+)\)\s*VALUES\s*\(/i.exec(sql)?.[1]
          ?.split(',').map((column) => column.trim().replace(/["`]/g, ''));
        if (!columns) return { changes: 0, lastInsertRowId: 0 };
        const row = Object.fromEntries(columns.map((column, index) => [column, params[index] ?? null]));
        if (!('id' in row)) row.id = nextId++;
        rows.push(row);
        return { changes: 1, lastInsertRowId: Number(row.id) };
      }
      if (/^\s*DELETE\b/i.test(sql)) {
        const before = rows.length;
        const remaining = filterRows(rows, sql, params);
        tables[table] = rows.filter((row) => !remaining.includes(row));
        return { changes: before - tables[table].length, lastInsertRowId: 0 };
      }
      if (/^\s*UPDATE\b/i.test(sql)) {
        const setMatch = /\bSET\s+([\s\S]+?)\s+WHERE\b/i.exec(sql);
        const whereId = /\bWHERE\s+(?:[a-z_]+\.)?id\s*=\s*\?/i.test(sql);
        if (!setMatch) return { changes: 0, lastInsertRowId: 0 };
        const setters = [...setMatch[1].matchAll(/([a-z_]+)\s*=\s*\?/gi)];
        const values = params.slice(0, setters.length);
        const id = whereId ? params[setters.length] : undefined;
        let changes = 0;
        for (const row of rows) {
          if (id !== undefined && row.id !== id) continue;
          setters.forEach((setter, index) => { row[setter[1]] = values[index] ?? null; });
          changes += 1;
        }
        return { changes, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    },
    async withTransactionAsync(task) { await task(); },
  };
}

export const sampleTables = tables;

export function exportSampleData() {
  return JSON.stringify({
    metadata: {
      appName: 'myThings sample preview',
      formatVersion: 1,
      exportedAt: now(),
      persistent: false,
    },
    tables,
  }, null, 2);
}

export function restoreSampleData(json: string) {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !('tables' in parsed)
    || !parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error('This file is not a myThings sample-data export.');
  }
  const imported = parsed.tables as Record<string, unknown>;
  for (const [tableName, currentRows] of Object.entries(tables)) {
    const importedRows = imported[tableName];
    if (!Array.isArray(importedRows)
      || importedRows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`The sample data for ${tableName} is missing or invalid.`);
    }
    currentRows.splice(0, currentRows.length, ...importedRows as Row[]);
  }
}

export type SampleRows = {
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  loans: Loan[];
  events: EventRecord[];
  tasks: TaskRecord[];
  notes: NoteRecord[];
  lists: ListRecord[];
  reminders: ReminderRecord[];
  inbox_items: InboxItem[];
  activity_logs: ActivityRecord[];
};
