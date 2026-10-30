import type { BrowserDatabase } from '../web/database';

export type RecordKind =
  | 'income'
  | 'loan'
  | 'loan-repayment'
  | 'event'
  | 'task'
  | 'note'
  | 'list';

export const INCOME_CATEGORIES = [
  'Withdraw',
  'Allowance',
  'Salary',
  'Gift',
  'Donation',
  'Contribution',
  'Commission',
  'Bonus',
  'Balance'
] as const;

export type RecordDraft = {
  id?: number;
  title: string;
  category: string;
  amount?: number;
  date?: string;
  notes?: string;
  fees?: number;
  dueDate?: string;
  loanId?: number;
  budgetEnabled?: boolean;
  eventId?: number | null;
  listItems?: ListItem[];
};

export type ListItem = {
  text: string;
  done: boolean;
  price: number;
  quantity: number;
};

export type Transaction = {
  id: number;
  kind: 'expense' | 'income';
  title: string;
  category: string;
  amount: number;
  date: string;
  notes: string;
  loan_id: number | null;
};

export type Loan = {
  id: number;
  lender: string;
  principal: number;
  fees: number;
  due_date: string;
  notes: string;
  created_at: string;
  repaid: number;
};

export class InsufficientFundsError extends Error {
  readonly shortfall: number;

  constructor(shortfall: number) {
    super(`This list exceeds your available balance by UGX ${new Intl.NumberFormat('en-UG').format(shortfall)}.`);
    this.name = 'InsufficientFundsError';
    this.shortfall = shortfall;
  }
}

export class InsufficientBalanceError extends Error {
  readonly shortfall: number;

  constructor(shortfall: number) {
    super(`This change would make your all-time balance negative by UGX ${new Intl.NumberFormat('en-UG').format(shortfall)}.`);
    this.name = 'InsufficientBalanceError';
    this.shortfall = shortfall;
  }
}

export type EventRecord = {
  id: number;
  title: string;
  category: string;
  date: string;
  notes: string;
  budget_count: number;
};

export type TaskRecord = {
  id: number;
  title: string;
  category: string;
  date: string;
  notes: string;
  completed: number;
};

export type NoteRecord = {
  id: number;
  title: string;
  category: string;
  notes: string;
  updated_at: string;
};

export type ListRecord = {
  id: number;
  title: string;
  items: string;
  budget_enabled: number;
  finalized: number;
  final_transaction_id: number | null;
  event_id: number | null;
  event_title?: string | null;
};

export async function initializeDatabase(database: BrowserDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      loan_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lender TEXT NOT NULL,
      principal REAL NOT NULL CHECK (principal > 0),
      fees REAL NOT NULL DEFAULT 0 CHECK (fees >= 0),
      due_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Normal',
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Personal',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      budget_enabled INTEGER NOT NULL DEFAULT 0,
      finalized INTEGER NOT NULL DEFAULT 0,
      final_transaction_id INTEGER,
      event_id INTEGER
    );
  `);

  const listColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(lists)');
  const columnNames = new Set(listColumns.map((column) => column.name));
  if (!columnNames.has('budget_enabled')) {
    await database.execAsync('ALTER TABLE lists ADD COLUMN budget_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnNames.has('finalized')) {
    await database.execAsync('ALTER TABLE lists ADD COLUMN finalized INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnNames.has('final_transaction_id')) {
    await database.execAsync('ALTER TABLE lists ADD COLUMN final_transaction_id INTEGER');
  }
  if (!columnNames.has('event_id')) {
    await database.execAsync('ALTER TABLE lists ADD COLUMN event_id INTEGER');
  }
  await database.execAsync('CREATE INDEX IF NOT EXISTS lists_event_id_idx ON lists(event_id)');
  const transactionColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(transactions)',
  );
  if (!transactionColumns.some((column) => column.name === 'loan_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN loan_id INTEGER');
  }

  await database.withTransactionAsync(async () => {
    const legacyBudgets = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM budgets',
    );
    if ((legacyBudgets?.count ?? 0) > 0) {
      await database.runAsync(
        "INSERT INTO lists (title, items, budget_enabled) SELECT title, '[]', 1 FROM budgets",
      );
      await database.runAsync('DELETE FROM budgets');
    }
  });
}

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const today = () => localDateKey();

async function getAvailableBalance(database: BrowserDatabase) {
  const balance = await database.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) AS total
     FROM transactions`,
  );
  return balance?.total ?? 0;
}

async function ensureAvailableBalance(database: BrowserDatabase, amount: number) {
  const availableBalance = await getAvailableBalance(database);
  if (amount > availableBalance) {
    throw new InsufficientBalanceError(amount - availableBalance);
  }
}

export async function saveRecord(
  database: BrowserDatabase,
  kind: RecordKind,
  draft: RecordDraft,
) {
  const title = draft.title.trim();
  const category = draft.category.trim() || 'Personal';
  const notes = draft.notes?.trim() ?? '';

  if (kind === 'income') {
    if (!INCOME_CATEGORIES.some((incomeCategory) => incomeCategory === category)) {
      throw new Error('Choose a valid income category.');
    }
    if (draft.id) {
      const id = draft.id;
      const amount = draft.amount ?? 0;
      await database.withTransactionAsync(async () => {
        const current = await database.getFirstAsync<{ amount: number }>(
          'SELECT amount FROM transactions WHERE id = ? AND kind = ?',
          id,
          kind,
        );
        const decrease = (current?.amount ?? amount) - amount;
        if (decrease > 0) await ensureAvailableBalance(database, decrease);
        await database.runAsync(
          'UPDATE transactions SET title = ?, category = ?, amount = ?, date = ?, notes = ? WHERE id = ? AND kind = ?',
          title,
          category,
          amount,
          draft.date || today(),
          notes,
          id,
          kind,
        );
      });
      return;
    }
    await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      kind,
      title,
      category,
      draft.amount ?? 0,
      draft.date || today(),
      notes,
    );
    return;
  }

  if (kind === 'loan') {
    const principal = draft.amount ?? 0;
    const fees = draft.fees ?? 0;
    if (!Number.isFinite(principal) || principal <= 0) {
      throw new Error('Loan principal must be greater than zero.');
    }
    if (!Number.isFinite(fees) || fees < 0) {
      throw new Error('Loan interest or fees cannot be negative.');
    }
    await database.withTransactionAsync(async () => {
      const loan = await database.runAsync(
        'INSERT INTO loans (lender, principal, fees, due_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        title,
        principal,
        fees,
        draft.dueDate || '',
        notes,
        today(),
      );
      await database.runAsync(
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'income',
        `Loan from ${title}`,
        'Loan',
        principal,
        today(),
        notes || `Principal received from ${title}`,
        loan.lastInsertRowId,
      );
    });
    return;
  }

  if (kind === 'loan-repayment') {
    const amount = draft.amount ?? 0;
    const loanId = draft.loanId;
    if (!loanId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Choose a loan and enter a repayment greater than zero.');
    }
    await database.withTransactionAsync(async () => {
      const loan = await database.getFirstAsync<{ lender: string; principal: number; fees: number }>(
        'SELECT lender, principal, fees FROM loans WHERE id = ?',
        loanId,
      );
      if (!loan) throw new Error('This loan no longer exists.');
      await ensureAvailableBalance(database, amount);
      const repayments = await database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE loan_id = ? AND kind = 'expense'",
        loanId,
      );
      const outstanding = loan.principal + loan.fees - (repayments?.total ?? 0);
      if (amount > outstanding) {
        throw new Error(`Repayment cannot exceed the outstanding ${new Intl.NumberFormat('en-UG').format(outstanding)} UGX.`);
      }
      await database.runAsync(
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'expense',
        `Loan repayment · ${loan.lender}`,
        'Loan repayment',
        amount,
        draft.date || today(),
        notes,
        loanId,
      );
    });
    return;
  }

  if (kind === 'event') {
    if (draft.id) {
      await database.runAsync(
        'UPDATE events SET title = ?, category = ?, date = ?, notes = ? WHERE id = ?',
        title,
        category,
        draft.date || today(),
        notes,
        draft.id,
      );
      return;
    }
    await database.runAsync(
      'INSERT INTO events (title, category, date, notes) VALUES (?, ?, ?, ?)',
      title,
      category,
      draft.date || today(),
      notes,
    );
    return;
  }

  if (kind === 'task') {
    if (draft.id) {
      await database.runAsync(
        'UPDATE tasks SET title = ?, category = ?, date = ?, notes = ? WHERE id = ?',
        title,
        category,
        draft.date || today(),
        notes,
        draft.id,
      );
      return;
    }
    await database.runAsync(
      'INSERT INTO tasks (title, category, date, notes) VALUES (?, ?, ?, ?)',
      title,
      category,
      draft.date || today(),
      notes,
    );
    return;
  }

  if (kind === 'note') {
    if (draft.id) {
      await database.runAsync(
        'UPDATE notes SET title = ?, category = ?, notes = ?, updated_at = ? WHERE id = ?',
        title,
        category,
        notes,
        new Date().toISOString(),
        draft.id,
      );
      return;
    }
    await database.runAsync(
      'INSERT INTO notes (title, category, notes, updated_at) VALUES (?, ?, ?, ?)',
      title,
      category,
      notes,
      new Date().toISOString(),
    );
    return;
  }

  const items: ListItem[] = (draft.listItems ?? notes
    .split(/\r?\n|,/)
    .map((item) => ({ text: item, done: false, price: 0, quantity: 1 })))
    .map((item) => ({
      text: item.text.trim(),
      done: item.done,
      price: Number.isFinite(item.price) && item.price >= 0 ? item.price : 0,
      quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    }))
    .filter((item) => item.text.length > 0);
  if (draft.id) {
    const listId = draft.id;
    await database.withTransactionAsync(async () => {
      const previous = await database.getFirstAsync<{
        items: string;
        budget_enabled: number;
        finalized: number;
        event_id: number | null;
      }>(
        'SELECT items, budget_enabled, finalized, event_id FROM lists WHERE id = ?',
        listId,
      );
      if (!previous) throw new Error('The list no longer exists.');
      if (previous.finalized) throw new Error('Reopen the list before editing it.');
      const completedItems: ListItem[] = JSON.parse(previous.items);
      const completionByText = new Map(completedItems.map((item) => [item.text, item.done]));
      for (const item of items) {
        item.done = draft.listItems
          ? item.done
          : completionByText.get(item.text) ?? false;
      }
      const budgetEnabled = Boolean(draft.budgetEnabled ?? previous.budget_enabled);
      const eventId = budgetEnabled
        ? draft.eventId === undefined ? previous.event_id : draft.eventId
        : null;
      if (eventId !== null) {
        const event = await database.getFirstAsync<{ id: number }>(
          'SELECT id FROM events WHERE id = ?',
          eventId,
        );
        if (!event) throw new Error('The selected event no longer exists.');
      }
      const update = await database.runAsync(
        'UPDATE lists SET title = ?, items = ?, budget_enabled = ?, event_id = ? WHERE id = ? AND finalized = 0',
        title,
        JSON.stringify(items),
        Number(budgetEnabled),
        eventId,
        listId,
      );
      if (update.changes === 0) throw new Error('Reopen the list before editing it.');
    });
    return;
  }
  const budgetEnabled = Boolean(draft.budgetEnabled ?? false);
  const eventId = budgetEnabled ? draft.eventId ?? null : null;
  await database.withTransactionAsync(async () => {
    if (eventId !== null) {
      const event = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM events WHERE id = ?',
        eventId,
      );
      if (!event) throw new Error('The selected event no longer exists.');
    }
    await database.runAsync(
      'INSERT INTO lists (title, items, budget_enabled, event_id) VALUES (?, ?, ?, ?)',
      title,
      JSON.stringify(items),
      Number(budgetEnabled),
      eventId,
    );
  });
}

export async function deleteRecord(
  database: BrowserDatabase,
  table: 'transactions' | 'events' | 'tasks' | 'notes' | 'lists',
  id: number,
) {
  if (table === 'lists') {
    await database.withTransactionAsync(async () => {
      const list = await database.getFirstAsync<{ final_transaction_id: number | null }>(
        'SELECT final_transaction_id FROM lists WHERE id = ?',
        id,
      );
      if (list?.final_transaction_id) {
        await database.runAsync('DELETE FROM transactions WHERE id = ?', list.final_transaction_id);
      }
      await database.runAsync('DELETE FROM lists WHERE id = ?', id);
    });
    return;
  }
  if (table === 'events') {
    await database.withTransactionAsync(async () => {
      await database.runAsync('UPDATE lists SET event_id = NULL WHERE event_id = ?', id);
      await database.runAsync('DELETE FROM events WHERE id = ?', id);
    });
    return;
  }
  if (table === 'transactions') {
    await database.withTransactionAsync(async () => {
      const transaction = await database.getFirstAsync<{ kind: string; amount: number }>(
        'SELECT kind, amount FROM transactions WHERE id = ?',
        id,
      );
      if (transaction?.kind === 'income') {
        await ensureAvailableBalance(database, transaction.amount);
      }
      await database.runAsync('DELETE FROM transactions WHERE id = ?', id);
    });
    return;
  }
  await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
}

export async function toggleTask(database: BrowserDatabase, id: number, completed: boolean) {
  await database.runAsync(
    'UPDATE tasks SET completed = ? WHERE id = ?',
    completed ? 0 : 1,
    id,
  );
}

export async function toggleListItem(
  database: BrowserDatabase,
  list: ListRecord,
  itemIndex: number,
) {
  await database.withTransactionAsync(async () => {
    const current = await database.getFirstAsync<{ items: string; finalized: number }>(
      'SELECT items, finalized FROM lists WHERE id = ?',
      list.id,
    );
    if (!current) throw new Error('The list no longer exists.');
    if (current.finalized) throw new Error('Reopen the list before changing its items.');
    const items: ListItem[] = JSON.parse(current.items);
    if (!items[itemIndex]) return;
    items[itemIndex].done = !items[itemIndex].done;
    const result = await database.runAsync(
      'UPDATE lists SET items = ? WHERE id = ? AND finalized = 0',
      JSON.stringify(items),
      list.id,
    );
    if (result.changes === 0) throw new Error('Reopen the list before changing its items.');
  });
}

export async function finalizeBudgetList(database: BrowserDatabase, listId: number) {
  const finalization: {
    value?: { transactionId: number; total: number; checkedCount: number };
  } = {};
  await database.withTransactionAsync(async () => {
    const list = await database.getFirstAsync<{
      title: string;
      items: string;
      budget_enabled: number;
      finalized: number;
    }>('SELECT title, items, budget_enabled, finalized FROM lists WHERE id = ?', listId);
    if (!list) throw new Error('The list no longer exists.');
    if (list.finalized) throw new Error('This list is already finalized.');
    if (!list.budget_enabled) throw new Error('Enable list budgeting before finalizing.');

    const items: ListItem[] = JSON.parse(list.items);
    const checkedItems = items.filter((item) => item.done);
    if (!checkedItems.length) throw new Error('Check at least one item before finalizing.');
    if (checkedItems.some((item) =>
      !Number.isFinite(item.price) || item.price <= 0 ||
      !Number.isInteger(item.quantity) || item.quantity <= 0
    )) {
      throw new Error('Add a valid quantity and unit price greater than zero to every checked item.');
    }

    const total = checkedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const availableBalance = await getAvailableBalance(database);
    if (total > availableBalance) {
      throw new InsufficientFundsError(total - availableBalance);
    }
    const insert = await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      'expense',
      list.title,
      'Expense',
      total,
      today(),
      `Finalized list · ${checkedItems.length} checked items`,
    );
    const transactionId = insert.lastInsertRowId;
    const update = await database.runAsync(
      'UPDATE lists SET finalized = 1, final_transaction_id = ? WHERE id = ? AND finalized = 0',
      transactionId,
      listId,
    );
    if (update.changes === 0) throw new Error('This list has already been finalized.');
    finalization.value = { transactionId, total, checkedCount: checkedItems.length };
  });
  if (!finalization.value) throw new Error('List finalization did not complete.');
  return finalization.value;
}

export async function reopenBudgetList(database: BrowserDatabase, listId: number) {
  await database.withTransactionAsync(async () => {
    const list = await database.getFirstAsync<{
      finalized: number;
      final_transaction_id: number | null;
    }>('SELECT finalized, final_transaction_id FROM lists WHERE id = ?', listId);
    if (!list) throw new Error('The list no longer exists.');
    if (!list.finalized) return;
    if (list.final_transaction_id) {
      await database.runAsync('DELETE FROM transactions WHERE id = ?', list.final_transaction_id);
    }
    await database.runAsync(
      'UPDATE lists SET finalized = 0, final_transaction_id = NULL WHERE id = ?',
      listId,
    );
  });
}
