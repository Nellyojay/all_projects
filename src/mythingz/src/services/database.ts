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

export type LinkedRecordType =
  | 'event'
  | 'task'
  | 'note'
  | 'budget'
  | 'transaction'
  | 'list'
  | 'reminder'
  | 'inbox';

export type ReminderStatus = 'pending' | 'completed' | 'dismissed';
export type InboxStatus = 'inbox' | 'converted' | 'linked' | 'dismissed';

const FEES = {
  'bank-to-cash': 1400,
  'bank-to-mobilemoney': 1700,
  'bank-to-mobilemoney-tax': 255,
} as const;

export type TransferCharge = { label: string; amount: number };

export function getTransferCharges(sourceType: string, destinationType: string): TransferCharge[] {
  if (sourceType !== 'Bank account') return [];
  if (destinationType === 'Cash wallet') {
    return [{ label: 'Transfer charge', amount: FEES['bank-to-cash'] }];
  }
  if (destinationType === 'Mobile money') {
    return [
      { label: 'Transfer charge', amount: FEES['bank-to-mobilemoney'] },
      { label: 'Transfer tax', amount: FEES['bank-to-mobilemoney-tax'] },
    ];
  }
  return [];
}

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
  charges: { title: string; amount: number }[];
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
  completed_at: string | null;
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
  notes: string;
  items: string;
  budget_enabled: number;
  finalized: number;
  final_transaction_id: number | null;
  event_id: number | null;
  event_title?: string | null;
};

export type RecordLink = {
  id: number;
  source_type: LinkedRecordType;
  source_id: number;
  target_type: LinkedRecordType;
  target_id: number;
  created_at: string;
};

export type RelatedRecord = {
  linkId: number;
  type: LinkedRecordType;
  id: number;
  title: string;
};

function sameLinkedRecord(
  left: { type: LinkedRecordType; id: number },
  right: { type: LinkedRecordType; id: number },
) {
  const sameType = left.type === right.type
    || (left.type === 'list' || left.type === 'budget')
    && (right.type === 'list' || right.type === 'budget');
  return sameType && left.id === right.id;
}

export type ReminderRecord = {
  id: number;
  title: string;
  description: string;
  due_at: string;
  status: ReminderStatus;
  related_type: LinkedRecordType | null;
  related_id: number | null;
  created_at: string;
  completed_at: string | null;
};

export type InboxItem = {
  id: number;
  content: string;
  captured_at: string;
  suggested_type: 'note' | 'task' | 'event' | 'reminder' | 'list' | 'budget' | 'idea' | null;
  status: InboxStatus;
  destination_type: LinkedRecordType | null;
  destination_id: number | null;
};

export type ActivityRecord = {
  id: number;
  action: string;
  module: string;
  record_id: number | null;
  description: string;
  occurred_at: string;
};

export type UniversalSearchModule =
  | 'Notes'
  | 'Tasks'
  | 'Events'
  | 'Finances'
  | 'Lists'
  | 'Reminders';
export type UniversalSearchFilter = 'All' | UniversalSearchModule;
export type UniversalSearchResult = {
  id: number;
  kind: 'note' | 'task' | 'event' | 'transaction' | 'transfer' | 'budget' | 'list' | 'reminder';
  module: UniversalSearchModule;
  title: string;
  detail: string;
};

async function ensureListNotesColumn(database: BrowserDatabase) {
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(lists)');
  if (!columns.some((column) => column.name === 'notes')) {
    await database.execAsync("ALTER TABLE lists ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
}

async function installActivityTriggers(database: BrowserDatabase) {
  await database.execAsync(`
    CREATE TRIGGER IF NOT EXISTS activity_events_insert AFTER INSERT ON events BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'events', NEW.id, 'Event created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_events_update AFTER UPDATE ON events
      WHEN OLD.title IS NOT NEW.title OR OLD.category IS NOT NEW.category
        OR OLD.date IS NOT NEW.date OR OLD.notes IS NOT NEW.notes BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('updated', 'events', NEW.id, 'Event updated', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_events_delete AFTER DELETE ON events BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'events', OLD.id, 'Event deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_tasks_insert AFTER INSERT ON tasks BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'tasks', NEW.id, 'Task created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_tasks_update AFTER UPDATE ON tasks
      WHEN OLD.title IS NOT NEW.title OR OLD.category IS NOT NEW.category OR OLD.date IS NOT NEW.date
        OR OLD.notes IS NOT NEW.notes OR OLD.completed IS NOT NEW.completed BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES (
        CASE WHEN OLD.completed IS NOT NEW.completed
          THEN CASE WHEN NEW.completed = 1 THEN 'completed' ELSE 'reopened' END
          ELSE 'updated' END,
        'tasks', NEW.id,
        CASE WHEN OLD.completed IS NOT NEW.completed
          THEN CASE WHEN NEW.completed = 1 THEN 'Task completed' ELSE 'Task reopened' END
          ELSE 'Task updated' END,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS activity_tasks_delete AFTER DELETE ON tasks BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'tasks', OLD.id, 'Task deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_notes_insert AFTER INSERT ON notes BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'notes', NEW.id, 'Note created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_notes_update AFTER UPDATE ON notes
      WHEN OLD.title IS NOT NEW.title OR OLD.category IS NOT NEW.category OR OLD.notes IS NOT NEW.notes BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('updated', 'notes', NEW.id, 'Note updated', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_notes_delete AFTER DELETE ON notes BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'notes', OLD.id, 'Note deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_lists_insert AFTER INSERT ON lists BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'lists', NEW.id, 'List created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_lists_update AFTER UPDATE ON lists
      WHEN OLD.title IS NOT NEW.title OR OLD.notes IS NOT NEW.notes OR OLD.items IS NOT NEW.items
        OR OLD.budget_enabled IS NOT NEW.budget_enabled OR OLD.finalized IS NOT NEW.finalized BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES (
        CASE WHEN OLD.finalized IS NOT NEW.finalized THEN 'finalized' ELSE 'updated' END,
        'lists', NEW.id,
        CASE WHEN OLD.finalized IS NOT NEW.finalized
          THEN CASE WHEN NEW.finalized = 1 THEN 'Budget list finalized' ELSE 'Budget list reopened' END
          ELSE 'List updated' END,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS activity_lists_delete AFTER DELETE ON lists BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'lists', OLD.id, 'List deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_transactions_insert AFTER INSERT ON transactions BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES (
        'created', 'finances', NEW.id,
        CASE WHEN NEW.loan_id IS NOT NULL THEN 'Loan transaction recorded'
          WHEN NEW.category = 'Fees and charges' THEN 'Transfer charge recorded'
          WHEN NEW.kind = 'expense' THEN 'Expense recorded'
          ELSE 'Income recorded' END,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS activity_transactions_update AFTER UPDATE ON transactions
      WHEN OLD.kind IS NOT NEW.kind OR OLD.title IS NOT NEW.title OR OLD.category IS NOT NEW.category
        OR OLD.amount IS NOT NEW.amount OR OLD.date IS NOT NEW.date OR OLD.notes IS NOT NEW.notes BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('updated', 'finances', NEW.id, 'Transaction updated', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_transactions_delete AFTER DELETE ON transactions BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'finances', OLD.id, 'Transaction removed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_transfers_insert AFTER INSERT ON transfers BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'finances', NEW.id, 'Transfer recorded', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_transfers_delete AFTER DELETE ON transfers BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'finances', OLD.id, 'Transfer removed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_reminders_insert AFTER INSERT ON reminders BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('created', 'reminders', NEW.id, 'Reminder created', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_reminders_update AFTER UPDATE ON reminders
      WHEN OLD.title IS NOT NEW.title OR OLD.description IS NOT NEW.description
        OR OLD.due_at IS NOT NEW.due_at OR OLD.status IS NOT NEW.status BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES (
        CASE WHEN OLD.status IS NOT NEW.status AND NEW.status = 'completed' THEN 'completed'
          ELSE 'updated' END,
        'reminders', NEW.id,
        CASE WHEN OLD.status IS NOT NEW.status AND NEW.status = 'completed'
          THEN 'Reminder completed' ELSE 'Reminder updated' END,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;
    CREATE TRIGGER IF NOT EXISTS activity_reminders_delete AFTER DELETE ON reminders BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'reminders', OLD.id, 'Reminder deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_inbox_insert AFTER INSERT ON inbox_items BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('captured', 'inbox', NEW.id, 'Quick capture added to inbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_inbox_update AFTER UPDATE ON inbox_items
      WHEN OLD.status IS NOT NEW.status OR OLD.content IS NOT NEW.content BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('organized', 'inbox', NEW.id, 'Inbox item organized', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_inbox_delete AFTER DELETE ON inbox_items BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('deleted', 'inbox', OLD.id, 'Inbox item deleted', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_links_insert AFTER INSERT ON record_links BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('linked', 'links', NEW.id, 'Records linked', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
    CREATE TRIGGER IF NOT EXISTS activity_links_delete AFTER DELETE ON record_links BEGIN
      INSERT INTO activity_logs (action, module, record_id, description, occurred_at)
      VALUES ('unlinked', 'links', OLD.id, 'Record link removed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    END;
  `);
}

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
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT
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
      notes TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL DEFAULT '[]',
      budget_enabled INTEGER NOT NULL DEFAULT 0,
      finalized INTEGER NOT NULL DEFAULT 0,
      final_transaction_id INTEGER,
      event_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS record_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (source_type, source_id, target_type, target_id),
      CHECK (source_type != target_type OR source_id != target_id)
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'dismissed')),
      related_type TEXT,
      related_id INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      CHECK ((related_type IS NULL) = (related_id IS NULL))
    );
    CREATE TABLE IF NOT EXISTS inbox_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      suggested_type TEXT,
      status TEXT NOT NULL DEFAULT 'inbox'
        CHECK (status IN ('inbox', 'converted', 'linked', 'dismissed')),
      destination_type TEXT,
      destination_id INTEGER,
      CHECK ((destination_type IS NULL) = (destination_id IS NULL))
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_id INTEGER,
      description TEXT NOT NULL,
      occurred_at TEXT NOT NULL
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
  await ensureListNotesColumn(database);
  const taskColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(tasks)');
  if (!taskColumns.some((column) => column.name === 'completed_at')) {
    await database.execAsync('ALTER TABLE tasks ADD COLUMN completed_at TEXT');
    await database.execAsync(
      "UPDATE tasks SET completed_at = datetime('now') WHERE completed = 1 AND completed_at IS NULL",
    );
  }
  await database.execAsync('CREATE INDEX IF NOT EXISTS lists_event_id_idx ON lists(event_id)');
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS record_links_source_idx ON record_links(source_type, source_id)',
  );
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS record_links_target_idx ON record_links(target_type, target_id)',
  );
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS reminders_due_status_idx ON reminders(status, due_at)',
  );
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS inbox_items_status_idx ON inbox_items(status, captured_at)',
  );
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS activity_logs_occurred_at_idx ON activity_logs(occurred_at)',
  );
  const transactionColumns = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(transactions)',
  );
  if (!transactionColumns.some((column) => column.name === 'loan_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN loan_id INTEGER');
  }
  if (!transactionColumns.some((column) => column.name === 'account_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)');
  }
  if (!transactionColumns.some((column) => column.name === 'transfer_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN transfer_id INTEGER');
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
  await installActivityTriggers(database);
}

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const today = () => localDateKey();

const linkedRecordQueries = {
  event: 'SELECT id FROM events WHERE id = ?',
  task: 'SELECT id FROM tasks WHERE id = ?',
  note: 'SELECT id FROM notes WHERE id = ?',
  budget: 'SELECT id FROM lists WHERE id = ? AND budget_enabled = 1',
  transaction: 'SELECT id FROM transactions WHERE id = ?',
  list: 'SELECT id FROM lists WHERE id = ?',
  reminder: 'SELECT id FROM reminders WHERE id = ?',
  inbox: "SELECT id FROM inbox_items WHERE id = ? AND status IN ('inbox', 'converted', 'linked')",
} satisfies Record<LinkedRecordType, string>;

async function requireLinkedRecord(
  database: BrowserDatabase,
  type: LinkedRecordType,
  id: number,
) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Choose a valid linked record.');
  const record = await database.getFirstAsync<{ id: number }>(linkedRecordQueries[type], id);
  if (!record) throw new Error(`The selected ${type} no longer exists.`);
}

export async function recordActivity(
  database: BrowserDatabase,
  activity: Omit<ActivityRecord, 'id' | 'occurred_at'> & { occurred_at?: string },
) {
  const description = activity.description.trim();
  if (!activity.action.trim() || !activity.module.trim() || !description) {
    throw new Error('Activity action, module, and description are required.');
  }
  await database.runAsync(
    'INSERT INTO activity_logs (action, module, record_id, description, occurred_at) VALUES (?, ?, ?, ?, ?)',
    activity.action,
    activity.module,
    activity.record_id,
    description,
    activity.occurred_at ?? new Date().toISOString(),
  );
}

export function getRecentActivity(database: BrowserDatabase, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Activity limit must be positive.');
  return database.getAllAsync<ActivityRecord>(
    'SELECT * FROM activity_logs ORDER BY occurred_at DESC, id DESC LIMIT ?',
    limit,
  );
}

export async function createRecordLink(
  database: BrowserDatabase,
  source: { type: LinkedRecordType; id: number },
  target: { type: LinkedRecordType; id: number },
) {
  await requireLinkedRecord(database, source.type, source.id);
  await requireLinkedRecord(database, target.type, target.id);
  if (sameLinkedRecord(source, target)) {
    throw new Error('A record cannot be linked to itself.');
  }

  const existingLinks = await getRecordLinks(database, source);
  const existing = existingLinks.find((link) => {
    const linkedRecord = sameLinkedRecord(source, { type: link.source_type, id: link.source_id })
      ? { type: link.target_type, id: link.target_id }
      : { type: link.source_type, id: link.source_id };
    return sameLinkedRecord(linkedRecord, target);
  });
  if (existing) return existing.id;

  const endpoints = [source, target].sort((left, right) =>
    `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`),
  );
  const [first, second] = endpoints;
  const result = await database.runAsync(
    `INSERT INTO record_links (source_type, source_id, target_type, target_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    first.type,
    first.id,
    second.type,
    second.id,
    new Date().toISOString(),
  );
  return result.lastInsertRowId;
}

export function getRecordLinks(
  database: BrowserDatabase,
  record: { type: LinkedRecordType; id: number },
) {
  const types = record.type === 'budget' || record.type === 'list'
    ? ['budget', 'list']
    : [record.type];
  const placeholders = types.map(() => '?').join(', ');
  return database.getAllAsync<RecordLink>(
    `SELECT * FROM record_links
     WHERE (source_type IN (${placeholders}) AND source_id = ?)
        OR (target_type IN (${placeholders}) AND target_id = ?)
     ORDER BY id`,
    ...types,
    record.id,
    ...types,
    record.id,
  );
}

export async function getRelatedRecords(
  database: BrowserDatabase,
  record: { type: LinkedRecordType; id: number },
) {
  const links = await getRecordLinks(database, record);
  const relatedRecords = await Promise.all(links.map(async (link): Promise<RelatedRecord | null> => {
    const isSource = sameLinkedRecord(
      { type: link.source_type, id: link.source_id },
      record,
    );
    const type = isSource ? link.target_type : link.source_type;
    const id = isSource ? link.target_id : link.source_id;
    const titleQueries = {
      event: 'SELECT title FROM events WHERE id = ?',
      task: 'SELECT title FROM tasks WHERE id = ?',
      note: 'SELECT title FROM notes WHERE id = ?',
      budget: 'SELECT title FROM lists WHERE id = ? AND budget_enabled = 1',
      transaction: 'SELECT title FROM transactions WHERE id = ?',
      list: 'SELECT title FROM lists WHERE id = ?',
      reminder: 'SELECT title FROM reminders WHERE id = ?',
      inbox: "SELECT substr(content, 1, 80) AS title FROM inbox_items WHERE id = ? AND status != 'dismissed'",
    } satisfies Record<LinkedRecordType, string>;
    const row = await database.getFirstAsync<{ title: string }>(titleQueries[type], id);
    if (!row) return null;
    return {
      linkId: link.id,
      type,
      id,
      title: row.title,
    };
  }));
  return relatedRecords.filter((related): related is RelatedRecord => related !== null);
}

export async function deleteRecordLink(database: BrowserDatabase, id: number) {
  await database.withTransactionAsync(async () => {
    const link = await database.getFirstAsync<Pick<RecordLink,
      'source_type' | 'source_id' | 'target_type' | 'target_id'
    >>('SELECT source_type, source_id, target_type, target_id FROM record_links WHERE id = ?', id);
    if (!link) throw new Error('This record link no longer exists.');
    await database.runAsync('DELETE FROM record_links WHERE id = ?', id);
    const inboxId = link.source_type === 'inbox'
      ? link.source_id
      : link.target_type === 'inbox' ? link.target_id : null;
    if (inboxId !== null) {
      await database.runAsync(
        `UPDATE inbox_items
         SET destination_type = NULL, destination_id = NULL,
             status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
         WHERE id = ?`,
        inboxId,
      );
    }
  });
}

export async function createReminder(
  database: BrowserDatabase,
  reminder: {
    title: string;
    description?: string;
    dueAt: string;
    related?: { type: LinkedRecordType; id: number } | null;
  },
) {
  const title = reminder.title.trim();
  if (!title) throw new Error('Enter a reminder title.');
  if (!reminder.dueAt.trim() || Number.isNaN(Date.parse(reminder.dueAt))) {
    throw new Error('Enter a valid reminder date and time.');
  }
  if (reminder.related) {
    await requireLinkedRecord(database, reminder.related.type, reminder.related.id);
  }
  const result = await database.runAsync(
    `INSERT INTO reminders
      (title, description, due_at, related_type, related_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    title,
    reminder.description?.trim() ?? '',
    reminder.dueAt,
    reminder.related?.type ?? null,
    reminder.related?.id ?? null,
    new Date().toISOString(),
  );
  return result.lastInsertRowId;
}

export function getReminders(database: BrowserDatabase, status?: ReminderStatus) {
  if (status) {
    return database.getAllAsync<ReminderRecord>(
      'SELECT * FROM reminders WHERE status = ? ORDER BY due_at, id',
      status,
    );
  }
  return database.getAllAsync<ReminderRecord>('SELECT * FROM reminders ORDER BY due_at, id');
}

export async function setReminderStatus(
  database: BrowserDatabase,
  id: number,
  status: ReminderStatus,
) {
  const result = await database.runAsync(
    'UPDATE reminders SET status = ?, completed_at = ? WHERE id = ?',
    status,
    status === 'completed' ? new Date().toISOString() : null,
    id,
  );
  if (!result.changes) throw new Error('This reminder no longer exists.');
}

export async function deleteReminder(database: BrowserDatabase, id: number) {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `DELETE FROM record_links
       WHERE (source_type = 'reminder' AND source_id = ?)
          OR (target_type = 'reminder' AND target_id = ?)`,
      id,
      id,
    );
    await database.runAsync(
      "UPDATE reminders SET related_type = NULL, related_id = NULL WHERE related_type = 'reminder' AND related_id = ?",
      id,
    );
    await database.runAsync(
      `UPDATE inbox_items
       SET destination_type = NULL, destination_id = NULL,
           status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
       WHERE destination_type = 'reminder' AND destination_id = ?`,
      id,
    );
    const result = await database.runAsync('DELETE FROM reminders WHERE id = ?', id);
    if (!result.changes) throw new Error('This reminder no longer exists.');
  });
}

export async function createInboxItem(
  database: BrowserDatabase,
  content: string,
  suggestedType: InboxItem['suggested_type'] = null,
) {
  const value = content.trim();
  if (!value) throw new Error('Capture some text before saving.');
  const result = await database.runAsync(
    'INSERT INTO inbox_items (content, captured_at, suggested_type) VALUES (?, ?, ?)',
    value,
    new Date().toISOString(),
    suggestedType,
  );
  return result.lastInsertRowId;
}

export function getInboxItems(database: BrowserDatabase, status: InboxStatus | 'active' = 'active') {
  if (status === 'active') {
    return database.getAllAsync<InboxItem>(
      "SELECT * FROM inbox_items WHERE status != 'dismissed' ORDER BY captured_at DESC, id DESC",
    );
  }
  return database.getAllAsync<InboxItem>(
    'SELECT * FROM inbox_items WHERE status = ? ORDER BY captured_at DESC, id DESC',
    status,
  );
}

export async function linkInboxItem(
  database: BrowserDatabase,
  inboxId: number,
  target: { type: LinkedRecordType; id: number },
) {
  await requireLinkedRecord(database, target.type, target.id);
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{ id: number; destination_type: string | null; destination_id: number | null }>(
      "SELECT id, destination_type, destination_id FROM inbox_items WHERE id = ? AND status != 'dismissed'",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    await linkRecordToInboxGroup(database, inboxId, target);
    const result = await database.runAsync(
      `UPDATE inbox_items
       SET status = 'linked',
           destination_type = COALESCE(destination_type, ?),
           destination_id = COALESCE(destination_id, ?)
       WHERE id = ? AND status != 'dismissed'`,
      item.destination_type ?? target.type,
      item.destination_id ?? target.id,
      inboxId,
    );
    if (!result.changes) throw new Error('This inbox item is no longer available.');
  });
}

async function linkRecordToInboxGroup(
  database: BrowserDatabase,
  inboxId: number,
  record: { type: LinkedRecordType; id: number },
) {
  const links = await getRecordLinks(database, { type: 'inbox', id: inboxId });
  for (const link of links) {
    const related = link.source_type === 'inbox'
      ? { type: link.target_type, id: link.target_id }
      : { type: link.source_type, id: link.source_id };
    if (related.type === 'inbox') continue;
    if (sameLinkedRecord(related, record)) continue;
    await createRecordLink(database, record, related);
  }
  await createRecordLink(database, { type: 'inbox', id: inboxId }, record);
}

export async function dismissInboxItem(database: BrowserDatabase, inboxId: number) {
  const result = await database.runAsync(
    `UPDATE inbox_items SET status = 'dismissed' WHERE id = ? AND status IN ('inbox', 'converted', 'linked')`,
    inboxId,
  );
  if (!result.changes) throw new Error('This inbox item is no longer available.');
}

export async function deleteInboxItem(database: BrowserDatabase, inboxId: number) {
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{ id: number }>(
      "SELECT id FROM inbox_items WHERE id = ? AND status IN ('inbox', 'converted', 'linked')",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    await database.runAsync(
      `DELETE FROM record_links
       WHERE (source_type = 'inbox' AND source_id = ?)
          OR (target_type = 'inbox' AND target_id = ?)`,
      inboxId,
      inboxId,
    );
    const result = await database.runAsync('DELETE FROM inbox_items WHERE id = ?', inboxId);
    if (!result.changes) throw new Error('This inbox item is no longer available.');
  });
}

export async function convertInboxItem(
  database: BrowserDatabase,
  inboxId: number,
  destination: 'note' | 'task' | 'event' | 'list' | 'reminder',
  dueAt?: string,
) {
  if (destination === 'list') await ensureListNotesColumn(database);
  if (destination === 'reminder' && (!dueAt || Number.isNaN(Date.parse(dueAt)))) {
    throw new Error('Choose a valid date and time for this reminder.');
  }
  let destinationId: number | null = null;
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{
      content: string;
      destination_type: string | null;
      destination_id: number | null;
    }>(
      "SELECT content, destination_type, destination_id FROM inbox_items WHERE id = ? AND status != 'dismissed'",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    const title = (item.content.split(/\r?\n/, 1)[0].trim() || 'Quick capture').slice(0, 32);
    if (destination === 'note') {
      const result = await database.runAsync(
        'INSERT INTO notes (title, category, notes, updated_at) VALUES (?, ?, ?, ?)',
        title,
        'Personal',
        item.content,
        new Date().toISOString(),
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'task') {
      const result = await database.runAsync(
        'INSERT INTO tasks (title, category, date, notes) VALUES (?, ?, ?, ?)',
        title,
        'Normal',
        today(),
        item.content,
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'event') {
      const result = await database.runAsync(
        'INSERT INTO events (title, category, date, notes) VALUES (?, ?, ?, ?)',
        title,
        'Personal',
        today(),
        item.content,
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'list') {
      const result = await database.runAsync(
        'INSERT INTO lists (title, notes, items, budget_enabled) VALUES (?, ?, ?, 0)',
        title,
        item.content,
        '[]',
      );
      destinationId = result.lastInsertRowId;
    } else {
      const result = await database.runAsync(
        'INSERT INTO reminders (title, description, due_at, created_at) VALUES (?, ?, ?, ?)',
        title,
        item.content,
        dueAt,
        new Date().toISOString(),
      );
      destinationId = result.lastInsertRowId;
    }

    await linkRecordToInboxGroup(database, inboxId, { type: destination, id: destinationId });
    const update = await database.runAsync(
      `UPDATE inbox_items
       SET status = CASE WHEN status = 'linked' THEN 'linked' ELSE 'converted' END,
           suggested_type = ?,
           destination_type = COALESCE(destination_type, ?),
           destination_id = COALESCE(destination_id, ?)
       WHERE id = ? AND status != 'dismissed'`,
      destination,
      destination,
      destinationId,
      inboxId,
    );
    if (!update.changes) throw new Error('This inbox item is no longer available.');
  });
  if (destinationId === null) throw new Error('Inbox conversion did not complete.');
  return { type: destination, id: destinationId };
}

async function getLinkedSearchResult(
  database: BrowserDatabase,
  type: LinkedRecordType,
  id: number,
): Promise<UniversalSearchResult | null> {
  if (type === 'event') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM events WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Events', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'task') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM tasks WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Tasks', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'note') {
    const row = await database.getFirstAsync<{ title: string; category: string }>(
      'SELECT title, category FROM notes WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Notes', title: row.title, detail: row.category } : null;
  }
  if (type === 'budget' || type === 'list') {
    const row = await database.getFirstAsync<{ title: string }>(
      'SELECT title FROM lists WHERE id = ? AND budget_enabled = ?',
      id,
      Number(type === 'budget'),
    );
    return row ? {
      id,
      kind: type,
      module: type === 'budget' ? 'Finances' : 'Lists',
      title: row.title,
      detail: type === 'budget' ? 'Budget' : 'List',
    } : null;
  }
  if (type === 'transaction') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM transactions WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Finances', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'reminder') {
    const row = await database.getFirstAsync<{ title: string; status: string; due_at: string }>(
      'SELECT title, status, due_at FROM reminders WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Reminders', title: row.title, detail: `${row.status} · ${row.due_at}` } : null;
  }
  return null;
}

export async function searchRecords(
  database: BrowserDatabase,
  query: string,
  filter: UniversalSearchFilter = 'All',
) {
  const search = query.trim();
  if (!search) return [];
  const pattern = `%${search.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`;
  const results: UniversalSearchResult[] = [];
  const searchNotes = filter === 'All' || filter === 'Notes';
  const searchTasks = filter === 'All' || filter === 'Tasks';
  const searchEvents = filter === 'All' || filter === 'Events';
  const searchFinance = filter === 'All' || filter === 'Finances';
  const searchLists = filter === 'All' || filter === 'Lists';
  const searchReminders = filter === 'All' || filter === 'Reminders';
  const [notes, tasks, events, transactions, transfers, budgets, lists, reminders] = await Promise.all([
    searchNotes
      ? database.getAllAsync<{ id: number; title: string; category: string }>(
        `SELECT id, title, category FROM notes
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY updated_at DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchTasks
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM tasks
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date, id LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchEvents
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM events
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date, id LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM transactions
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date DESC, id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{
        id: number;
        date: string;
        notes: string;
        from_account_name: string;
        to_account_name: string;
      }>(
        `SELECT transfers.id, transfers.date, transfers.notes,
           source.name AS from_account_name, destination.name AS to_account_name
         FROM transfers
         JOIN accounts AS source ON source.id = transfers.from_account_id
         JOIN accounts AS destination ON destination.id = transfers.to_account_id
         WHERE source.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR destination.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR transfers.notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY transfers.date DESC, transfers.id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{ id: number; title: string; notes: string; items: string }>(
        `SELECT id, title, notes, items FROM lists WHERE budget_enabled = 1
         AND (title LIKE ? ESCAPE '!' COLLATE NOCASE
           OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
           OR items LIKE ? ESCAPE '!' COLLATE NOCASE)
         ORDER BY id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchLists
      ? database.getAllAsync<{ id: number; title: string; notes: string; items: string }>(
        `SELECT id, title, notes, items FROM lists WHERE budget_enabled = 0
         AND (title LIKE ? ESCAPE '!' COLLATE NOCASE
           OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
           OR items LIKE ? ESCAPE '!' COLLATE NOCASE)
         ORDER BY id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchReminders
      ? database.getAllAsync<{ id: number; title: string; due_at: string; status: string }>(
        `SELECT id, title, due_at, status FROM reminders
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR description LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY due_at DESC LIMIT 40`,
        pattern, pattern,
      )
      : [],
  ]);
  results.push(
    ...notes.map((record) => ({
      id: record.id,
      kind: 'note' as const,
      module: 'Notes' as const,
      title: record.title,
      detail: record.category,
    })),
    ...tasks.map((record) => ({
      id: record.id,
      kind: 'task' as const,
      module: 'Tasks' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...events.map((record) => ({
      id: record.id,
      kind: 'event' as const,
      module: 'Events' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...transactions.map((record) => ({
      id: record.id,
      kind: 'transaction' as const,
      module: 'Finances' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...transfers.map((record) => ({
      id: record.id,
      kind: 'transfer' as const,
      module: 'Finances' as const,
      title: `${record.from_account_name} → ${record.to_account_name}`,
      detail: `Transfer · ${record.date}`,
    })),
    ...budgets.map((record) => ({
      id: record.id,
      kind: 'budget' as const,
      module: 'Finances' as const,
      title: record.title,
      detail: 'Budget',
    })),
    ...lists.map((record) => ({
      id: record.id,
      kind: 'list' as const,
      module: 'Lists' as const,
      title: record.title,
      detail: 'List',
    })),
    ...reminders.map((record) => ({
      id: record.id,
      kind: 'reminder' as const,
      module: 'Reminders' as const,
      title: record.title,
      detail: `${record.status} · ${record.due_at}`,
    })),
  );

  const seedRecords = results.filter((record) => record.kind !== 'transfer');
  const visited = new Set(seedRecords.map((record) => `${record.kind}:${record.id}`));
  const linkedKeys = new Set<string>();
  let frontier = seedRecords.map((record) => ({
    type: record.kind as LinkedRecordType,
    id: record.id,
  }));
  for (let depth = 0; depth < 4 && frontier.length > 0; depth += 1) {
    const nextFrontier: { type: LinkedRecordType; id: number }[] = [];
    for (let index = 0; index < frontier.length; index += 200) {
      const batch = frontier.slice(index, index + 200);
      const frontierKeys = new Set(batch.map((record) => `${record.type}:${record.id}`));
      const conditions = batch.map(() =>
        '((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))',
      );
      const parameters = batch.flatMap((record) => [
        record.type,
        record.id,
        record.type,
        record.id,
      ]);
      const links = await database.getAllAsync<Pick<RecordLink,
        'source_type' | 'source_id' | 'target_type' | 'target_id'
      >>(`SELECT source_type, source_id, target_type, target_id
          FROM record_links WHERE ${conditions.join(' OR ')}`, ...parameters);
      for (const link of links) {
        const sourceKey = `${link.source_type}:${link.source_id}`;
        const targetKey = `${link.target_type}:${link.target_id}`;
        const endpoint = frontierKeys.has(sourceKey)
          ? { key: targetKey, type: link.target_type, id: link.target_id }
          : frontierKeys.has(targetKey)
            ? { key: sourceKey, type: link.source_type, id: link.source_id }
            : null;
        if (endpoint && !visited.has(endpoint.key)) {
          visited.add(endpoint.key);
          linkedKeys.add(endpoint.key);
          nextFrontier.push({ type: endpoint.type, id: endpoint.id });
        }
      }
    }
    frontier = nextFrontier.filter((record) => record.type !== 'inbox');
  }
  for (const linkedKey of linkedKeys) {
    const separator = linkedKey.indexOf(':');
    const type = linkedKey.slice(0, separator) as LinkedRecordType;
    const id = Number(linkedKey.slice(separator + 1));
    if (!Number.isSafeInteger(id) || id < 1) continue;
    const linked = await getLinkedSearchResult(database, type, id);
    if (!linked || (filter !== 'All' && linked.module !== filter)) continue;
    if (results.some((result) => result.kind === linked.kind && result.id === linked.id)) continue;
    results.push(linked);
  }
  return results;
}

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

type TransferRow = Omit<Transfer, 'charges'>;

async function attachTransferCharges(database: BrowserDatabase, transfers: TransferRow[]) {
  if (!transfers.length) return [];
  const transferIds = transfers.map((transfer) => transfer.id);
  const placeholders = transferIds.map(() => '?').join(', ');
  const charges = await database.getAllAsync<{
    transfer_id: number;
    title: string;
    amount: number;
  }>(
    `SELECT transfer_id, title, amount
     FROM transactions
     WHERE transfer_id IN (${placeholders}) AND category = 'Fees and charges'
     ORDER BY id`,
    ...transferIds,
  );
  const chargesByTransfer = new Map<number, { title: string; amount: number }[]>();
  for (const charge of charges) {
    const transferCharges = chargesByTransfer.get(charge.transfer_id) ?? [];
    transferCharges.push({ title: charge.title, amount: charge.amount });
    chargesByTransfer.set(charge.transfer_id, transferCharges);
  }
  return transfers.map((transfer) => ({
    ...transfer,
    charges: chargesByTransfer.get(transfer.id) ?? [],
  }));
}

export async function getTransfers(database: BrowserDatabase) {
  const transfers = await database.getAllAsync<TransferRow>(
    `SELECT transfers.*, source.name AS from_account_name, destination.name AS to_account_name
     FROM transfers
     JOIN accounts AS source ON source.id = transfers.from_account_id
     JOIN accounts AS destination ON destination.id = transfers.to_account_id
     ORDER BY transfers.date DESC, transfers.id DESC LIMIT 50`,
  );
  return attachTransferCharges(database, transfers);
}

export async function getTransferById(database: BrowserDatabase, id: number) {
  const transfer = await database.getFirstAsync<TransferRow>(
    `SELECT transfers.*, source.name AS from_account_name, destination.name AS to_account_name
     FROM transfers
     JOIN accounts AS source ON source.id = transfers.from_account_id
     JOIN accounts AS destination ON destination.id = transfers.to_account_id
     WHERE transfers.id = ?`,
    id,
  );
  if (!transfer) return null;
  return (await attachTransferCharges(database, [transfer]))[0];
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
      const source = await database.getFirstAsync<{ name: string; type: string }>(
        'SELECT name, type FROM accounts WHERE id = ?',
        fromAccountId,
      );
      const destination = await database.getFirstAsync<{ name: string; type: string }>(
        'SELECT name, type FROM accounts WHERE id = ?',
        toAccountId,
      );
      if (!source || !destination) throw new Error('Choose valid source and destination accounts.');
      const charges = getTransferCharges(source.type, destination.type);
      const chargeTotal = charges.reduce((total, charge) => total + charge.amount, 0);
      await ensureAccountBalance(database, fromAccountId, amount + chargeTotal);
      const transfer = await database.runAsync(
        'INSERT INTO transfers (from_account_id, to_account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
        fromAccountId,
        toAccountId,
        amount,
        today(),
        notes,
      );
      for (const charge of charges) {
        await database.runAsync(
          'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id, transfer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'expense',
          `${charge.label}`,
          'Fees and charges',
          charge.amount,
          today(),
          `${source.name} to ${destination.name} transfer.`,
          fromAccountId,
          transfer.lastInsertRowId,
        );
      }
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
  await ensureListNotesColumn(database);
  if (draft.id) {
    const listId = draft.id;
    await database.withTransactionAsync(async () => {
      const previous = await database.getFirstAsync<{
        items: string;
        notes: string;
        budget_enabled: number;
        finalized: number;
        event_id: number | null;
      }>(
        'SELECT items, notes, budget_enabled, finalized, event_id FROM lists WHERE id = ?',
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
        'UPDATE lists SET title = ?, notes = ?, items = ?, budget_enabled = ?, event_id = ? WHERE id = ? AND finalized = 0',
        title,
        draft.notes?.trim() ?? previous.notes,
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
      'INSERT INTO lists (title, notes, items, budget_enabled, event_id) VALUES (?, ?, ?, ?, ?)',
      title,
      draft.notes?.trim() ?? '',
      JSON.stringify(items),
      Number(budgetEnabled),
      eventId,
    );
  });
}

async function detachRecordReferences(
  database: BrowserDatabase,
  type: LinkedRecordType,
  recordId: number,
) {
  await database.runAsync(
    `DELETE FROM record_links
     WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)`,
    type,
    recordId,
    type,
    recordId,
  );
  await database.runAsync(
    'UPDATE reminders SET related_type = NULL, related_id = NULL WHERE related_type = ? AND related_id = ?',
    type,
    recordId,
  );
  await database.runAsync(
    `UPDATE inbox_items
     SET destination_type = NULL, destination_id = NULL,
         status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
     WHERE destination_type = ? AND destination_id = ?`,
    type,
    recordId,
  );
}

export async function deleteRecord(
  database: BrowserDatabase,
  table: 'transactions' | 'events' | 'tasks' | 'notes' | 'lists',
  id: number,
) {
  const recordTypes: LinkedRecordType[] = table === 'lists'
    ? ['list', 'budget']
    : [table === 'transactions' ? 'transaction' : table === 'events' ? 'event' : table === 'tasks' ? 'task' : 'note'];
  const detachReferences = (type: LinkedRecordType, recordId: number) =>
    detachRecordReferences(database, type, recordId);
  if (table === 'lists') {
    await database.withTransactionAsync(async () => {
      const list = await database.getFirstAsync<{ final_transaction_id: number | null }>(
        'SELECT final_transaction_id FROM lists WHERE id = ?',
        id,
      );
      if (list?.final_transaction_id) {
        await detachReferences('transaction', list.final_transaction_id);
        await database.runAsync('DELETE FROM transactions WHERE id = ?', list.final_transaction_id);
      }
      for (const type of recordTypes) await detachReferences(type, id);
      await database.runAsync('DELETE FROM lists WHERE id = ?', id);
    });
    return;
  }
  if (table === 'events') {
    await database.withTransactionAsync(async () => {
      await detachReferences('event', id);
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
      await detachReferences('transaction', id);
      await database.runAsync('DELETE FROM transactions WHERE id = ?', id);
    });
    return;
  }
  await database.withTransactionAsync(async () => {
    for (const type of recordTypes) await detachReferences(type, id);
    await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
  });
}

export async function toggleTask(database: BrowserDatabase, id: number, completed: boolean) {
  const nextCompleted = completed ? 0 : 1;
  const result = await database.runAsync(
    'UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ? AND completed = ?',
    nextCompleted,
    nextCompleted ? new Date().toISOString() : null,
    id,
    completed ? 1 : 0,
  );
  if (!result.changes) throw new Error('This task no longer exists or has already changed.');
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
  await ensureListNotesColumn(database);
  const finalization: {
    value?: { transactionId: number; total: number; checkedCount: number };
  } = {};
  await database.withTransactionAsync(async () => {
    const list = await database.getFirstAsync<{
      title: string;
      notes: string;
      items: string;
      budget_enabled: number;
      finalized: number;
    }>('SELECT title, notes, items, budget_enabled, finalized FROM lists WHERE id = ?', listId);
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
    const notes = [
      [`Finalized list · ${checkedItems.length} checked items`, list.notes.trim()]
        .filter(Boolean)
        .join('\n'),
      'Items:',
      ...checkedItems.map((item) =>
        `${item.quantity} × ${item.text.replace(/\s+/g, ' ').trim()} · UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 20 }).format(item.price)
        } each`,
      ),
    ].join('\n');
    const insert = await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'expense',
      list.title,
      'Expense',
      total,
      today(),
      notes,
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
