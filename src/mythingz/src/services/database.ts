import type { BrowserDatabase } from '../web/database';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/finance';

export { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/finance';

export type RecordKind =
  | 'income'
  | 'loan'
  | 'loan-repayment'
  | 'transfer'
  | 'event'
  | 'task'
  | 'note'
  | 'list';

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
  accountId?: number;
  fromAccountId?: number;
  toAccountId?: number;
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

export type ExpenseDraft = {
  title: string;
  category: string;
  notes: string;
  accountId: number;
  items: ListItem[];
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
  account_id: number | null;
  account_name?: string | null;
};

export type Account = {
  id: number;
  name: string;
  type: string;
  opening_balance: number;
  is_default: number;
  balance: number;
};

export type Transfer = {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  date: string;
  notes: string;
  from_account_name?: string;
  to_account_name?: string;
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
    super(`This account is short by UGX ${new Intl.NumberFormat('en-UG').format(shortfall)}.`);
    this.name = 'InsufficientFundsError';
    this.shortfall = shortfall;
  }
}

export class InsufficientBalanceError extends Error {
  readonly shortfall: number;

  constructor(shortfall: number) {
    super(`This change exceeds the selected account balance by UGX ${new Intl.NumberFormat('en-UG').format(shortfall)}.`);
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
      loan_id INTEGER,
      account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
      is_default INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_id INTEGER NOT NULL REFERENCES accounts(id),
      to_account_id INTEGER NOT NULL REFERENCES accounts(id),
      amount REAL NOT NULL CHECK (amount > 0),
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      CHECK (from_account_id != to_account_id)
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
  if (!transactionColumns.some((column) => column.name === 'account_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)');
  }
  if (transactionColumns.some((column) => column.name === 'reference_number')) {
    await database.execAsync('ALTER TABLE transactions DROP COLUMN reference_number');
  }
  if (transactionColumns.some((column) => column.name === 'receipt_data')) {
    await database.execAsync('ALTER TABLE transactions DROP COLUMN receipt_data');
  }
  await database.execAsync('DROP TABLE IF EXISTS recurring_income');
  await database.withTransactionAsync(async () => {
    let defaultAccount = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM accounts WHERE is_default = 1 ORDER BY id LIMIT 1',
    );
    if (!defaultAccount) {
      defaultAccount = await database.getFirstAsync<{ id: number }>(
        "SELECT id FROM accounts WHERE name = 'Cash' ORDER BY id LIMIT 1",
      );
      if (defaultAccount) {
        await database.runAsync('UPDATE accounts SET is_default = 1 WHERE id = ?', defaultAccount.id);
      } else {
        const inserted = await database.runAsync(
          "INSERT INTO accounts (name, type, opening_balance, is_default) VALUES ('Cash', 'Cash wallet', 0, 1)",
        );
        defaultAccount = { id: inserted.lastInsertRowId };
      }
    }
    await database.runAsync(
      'UPDATE transactions SET account_id = ? WHERE account_id IS NULL',
      defaultAccount.id,
    );
  });
  await database.execAsync('CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS transfers_from_account_id_idx ON transfers(from_account_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS transfers_to_account_id_idx ON transfers(to_account_id)');
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

export async function getAccounts(database: BrowserDatabase) {
  return database.getAllAsync<Account>(
    `SELECT accounts.*,
      accounts.opening_balance
        + COALESCE((SELECT SUM(CASE WHEN transactions.kind = 'income' THEN transactions.amount ELSE -transactions.amount END)
          FROM transactions WHERE transactions.account_id = accounts.id AND transactions.date <= ?), 0)
        + COALESCE((SELECT SUM(transfers.amount) FROM transfers WHERE transfers.to_account_id = accounts.id AND transfers.date <= ?), 0)
        - COALESCE((SELECT SUM(transfers.amount) FROM transfers WHERE transfers.from_account_id = accounts.id AND transfers.date <= ?), 0) AS balance
     FROM accounts ORDER BY is_default DESC, name COLLATE NOCASE`,
    today(),
    today(),
    today(),
  );
}

export async function createAccount(
  database: BrowserDatabase,
  account: { name: string; type: string; openingBalance: number },
) {
  const name = account.name.trim();
  if (!name) throw new Error('Enter an account name.');
  if (!Number.isFinite(account.openingBalance) || account.openingBalance < 0) {
    throw new Error('Opening balance must be zero or more.');
  }
  await database.runAsync(
    'INSERT INTO accounts (name, type, opening_balance) VALUES (?, ?, ?)',
    name,
    account.type,
    account.openingBalance,
  );
}

async function ensureAccountBalance(database: BrowserDatabase, accountId: number, amount: number) {
  const accounts = await getAccounts(database);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('Choose a valid account.');
  if (account.balance < amount) {
    throw new InsufficientBalanceError(amount - account.balance);
  }
}

export async function saveExpense(database: BrowserDatabase, draft: ExpenseDraft) {
  const title = draft.title.trim();
  const category = draft.category.trim();
  const notes = draft.notes.trim();
  if (!title) throw new Error('Enter an expense title.');
  if (!EXPENSE_CATEGORIES.some((expenseCategory) => expenseCategory === category)) {
    throw new Error('Choose a valid expense category.');
  }
  if (!draft.accountId) throw new Error('Choose the account paying for this expense.');
  if (!draft.items.length || draft.items.some((item) =>
    !item.text.trim()
    || !Number.isFinite(item.price)
    || item.price < 0
    || !Number.isInteger(item.quantity)
    || item.quantity < 1
  )) {
    throw new Error('Add expense items with valid quantities and unit prices.');
  }

  const amount = draft.items.reduce((total, item) => total + item.price * item.quantity, 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('The expense total must be greater than zero.');
  }
  const itemDetails = draft.items.map((item) =>
    `${item.quantity} × ${item.text.trim()} · UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(item.price)} each`,
  ).join('\n');
  const transactionNotes = [notes, `Items:\n${itemDetails}`].filter(Boolean).join('\n\n');
  const date = today();

  await database.withTransactionAsync(async () => {
    await ensureAccountBalance(database, draft.accountId, amount);
    await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'expense',
      title,
      category,
      amount,
      date,
      transactionNotes,
      draft.accountId,
    );
  });
}

export async function getTransfers(database: BrowserDatabase) {
  return database.getAllAsync<Transfer>(
    `SELECT transfers.*, source.name AS from_account_name, destination.name AS to_account_name
     FROM transfers
     JOIN accounts AS source ON source.id = transfers.from_account_id
     JOIN accounts AS destination ON destination.id = transfers.to_account_id
     ORDER BY transfers.date DESC, transfers.id DESC LIMIT 50`,
  );
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
    const accountId = draft.accountId;
    if (!accountId) throw new Error('Choose the account receiving this income.');
    if (draft.id) {
      const id = draft.id;
      const amount = draft.amount ?? 0;
      await database.withTransactionAsync(async () => {
        const current = await database.getFirstAsync<{ amount: number; account_id: number | null }>(
          'SELECT amount, account_id FROM transactions WHERE id = ? AND kind = ?',
          id,
          kind,
        );
        if (current && current.account_id === accountId && current.amount > amount) {
          await ensureAccountBalance(database, accountId, current.amount - amount);
        } else if (current && current.account_id !== accountId) {
          if (current.account_id !== null) await ensureAccountBalance(database, current.account_id, current.amount);
          await ensureAccountBalance(database, accountId, 0);
        }
        await database.runAsync(
          'UPDATE transactions SET title = ?, category = ?, amount = ?, date = ?, notes = ?, account_id = ? WHERE id = ? AND kind = ?',
          title,
          category,
          amount,
          today(),
          notes,
          accountId,
          id,
          kind,
        );
      });
      return;
    }
    await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      kind,
      title,
      category,
      draft.amount ?? 0,
      today(),
      notes,
      accountId,
    );
    return;
  }

  if (kind === 'loan') {
    const principal = draft.amount ?? 0;
    const fees = draft.fees ?? 0;
    const accountId = draft.accountId;
    if (!accountId) throw new Error('Choose the account receiving the loan proceeds.');
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
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'income',
        `Loan from ${title}`,
        'Loan',
        principal,
        today(),
        notes || `Principal received from ${title}`,
        loan.lastInsertRowId,
        accountId,
      );
    });
    return;
  }

  if (kind === 'loan-repayment') {
    const amount = draft.amount ?? 0;
    const loanId = draft.loanId;
    const accountId = draft.accountId;
    if (!loanId || !accountId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Choose a loan and enter a repayment greater than zero.');
    }
    await database.withTransactionAsync(async () => {
      const loan = await database.getFirstAsync<{ lender: string; principal: number; fees: number }>(
        'SELECT lender, principal, fees FROM loans WHERE id = ?',
        loanId,
      );
      if (!loan) throw new Error('This loan no longer exists.');
      await ensureAccountBalance(database, accountId, amount);
      const repayments = await database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE loan_id = ? AND kind = 'expense'",
        loanId,
      );
      const outstanding = loan.principal + loan.fees - (repayments?.total ?? 0);
      if (amount > outstanding) {
        throw new Error(`Repayment cannot exceed the outstanding ${new Intl.NumberFormat('en-UG').format(outstanding)} UGX.`);
      }
      await database.runAsync(
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'expense',
        `Loan repayment · ${loan.lender}`,
        'Loan repayment',
        amount,
        today(),
        notes,
        loanId,
        accountId,
      );
    });
    return;
  }

  if (kind === 'transfer') {
    const amount = draft.amount ?? 0;
    const fromAccountId = draft.fromAccountId;
    const toAccountId = draft.toAccountId;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a transfer amount greater than zero.');
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      throw new Error('Choose two different accounts for this transfer.');
    }
    await database.withTransactionAsync(async () => {
      await ensureAccountBalance(database, fromAccountId, amount);
      await database.runAsync(
        'INSERT INTO transfers (from_account_id, to_account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
        fromAccountId,
        toAccountId,
        amount,
        today(),
        notes,
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
      const transaction = await database.getFirstAsync<{
        kind: string;
        amount: number;
        account_id: number | null;
      }>(
        'SELECT kind, amount, account_id FROM transactions WHERE id = ?',
        id,
      );
      if (transaction?.kind === 'income' && transaction.account_id !== null) {
        await ensureAccountBalance(database, transaction.account_id, transaction.amount);
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

export async function finalizeBudgetList(database: BrowserDatabase, listId: number, accountId: number) {
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
    if (!accountId) throw new Error('Choose the account paying for this budget list.');

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
    await ensureAccountBalance(database, accountId, total);
    const insert = await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'expense',
      list.title,
      'Expense',
      total,
      today(),
      `Finalized list · ${checkedItems.length} checked items`,
      accountId,
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
