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
  budgetAllocations?: { periodItemId: number; amount: number }[];
};

export type BudgetRecurrence = 'daily' | 'weekly' | 'monthly';
export type BudgetRollover = 'reset' | 'carry' | 'save';
export type BudgetTemplate = {
  id: number;
  name: string;
  description: string;
  recurrence: BudgetRecurrence;
  start_date: string;
  end_date: string | null;
  week_start_day: number | null;
  active: number;
  archived: number;
  created_at: string;
  updated_at: string;
};
export type BudgetTemplateItem = {
  id?: number;
  name: string;
  description: string;
  allocated_amount: number;
  category: string;
  rollover: BudgetRollover;
  alert_thresholds: number[];
  active: boolean;
};
type BudgetTemplateItemRow = Omit<BudgetTemplateItem, 'alert_thresholds' | 'active'> & {
  alert_thresholds: string;
  active: number;
};
export type BudgetPeriod = {
  id: number;
  template_id: number;
  template_name: string;
  recurrence: BudgetRecurrence;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'active' | 'awaiting_review' | 'closed' | 'cancelled';
  created_at: string;
  closed_at: string | null;
};
export type BudgetPeriodItem = {
  id: number;
  period_id: number;
  template_item_id: number | null;
  name: string;
  description: string;
  category: string;
  original_amount: number;
  rollover_amount: number;
  saved_amount: number;
  rollover: BudgetRollover;
  alert_thresholds: string;
  final_amount: number;
  actual_amount: number;
  refunded_amount: number;
};
export type BudgetSummary = BudgetPeriod & {
  allocated_amount: number;
  actual_amount: number;
  remaining_amount: number;
};
export type BudgetAlert = {
  id: number;
  period_item_id: number;
  threshold: number;
  created_at: string;
  template_name: string;
  item_name: string;
  start_date: string;
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
  refund_of_transaction_id: number | null;
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
      account_id INTEGER,
      refund_of_transaction_id INTEGER REFERENCES transactions(id)
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
    CREATE TABLE IF NOT EXISTS budget_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      recurrence TEXT NOT NULL CHECK (recurrence IN ('daily', 'weekly', 'monthly')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      week_start_day INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (week_start_day IS NULL OR week_start_day BETWEEN 0 AND 6),
      CHECK (end_date IS NULL OR end_date >= start_date)
    );
    CREATE TABLE IF NOT EXISTS budget_template_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES budget_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      allocated_amount INTEGER NOT NULL CHECK (allocated_amount >= 0),
      category TEXT NOT NULL DEFAULT '',
      rollover TEXT NOT NULL DEFAULT 'reset'
        CHECK (rollover IN ('reset', 'carry', 'save')),
      alert_thresholds TEXT NOT NULL DEFAULT '[50,75,90,100]',
      active INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS budget_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES budget_templates(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('upcoming', 'active', 'awaiting_review', 'closed', 'cancelled')),
      created_at TEXT NOT NULL,
      closed_at TEXT,
      UNIQUE (template_id, start_date, end_date),
      CHECK (end_date >= start_date)
    );
    CREATE TABLE IF NOT EXISTS budget_period_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
      template_item_id INTEGER,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      original_amount INTEGER NOT NULL CHECK (original_amount >= 0),
      rollover_amount INTEGER NOT NULL DEFAULT 0 CHECK (rollover_amount >= 0),
      saved_amount INTEGER NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
      rollover TEXT NOT NULL DEFAULT 'reset' CHECK (rollover IN ('reset', 'carry', 'save')),
      alert_thresholds TEXT NOT NULL DEFAULT '[50,75,90,100]',
      UNIQUE (period_id, template_item_id)
    );
    CREATE TABLE IF NOT EXISTS transaction_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      period_item_id INTEGER NOT NULL REFERENCES budget_period_items(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL,
      UNIQUE (transaction_id, period_item_id)
    );
    CREATE TABLE IF NOT EXISTS transaction_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
      refund_transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_refund_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_id INTEGER NOT NULL REFERENCES transaction_refunds(id) ON DELETE CASCADE,
      period_item_id INTEGER NOT NULL REFERENCES budget_period_items(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      UNIQUE (refund_id, period_item_id)
    );
    CREATE TABLE IF NOT EXISTS budget_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_item_id INTEGER NOT NULL REFERENCES budget_period_items(id) ON DELETE CASCADE,
      previous_amount INTEGER NOT NULL CHECK (previous_amount >= 0),
      new_amount INTEGER NOT NULL CHECK (new_amount >= 0),
      difference INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_period_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id INTEGER NOT NULL REFERENCES budget_periods(id),
      action TEXT NOT NULL CHECK (action IN ('closed', 'reopened')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_item_id INTEGER NOT NULL REFERENCES budget_period_items(id) ON DELETE CASCADE,
      threshold INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (period_item_id, threshold)
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
  await database.execAsync('CREATE INDEX IF NOT EXISTS budget_templates_active_idx ON budget_templates(active, archived)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS budget_periods_dates_idx ON budget_periods(start_date, end_date, status)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS budget_period_items_period_idx ON budget_period_items(period_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS transaction_allocations_transaction_idx ON transaction_allocations(transaction_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS transaction_allocations_item_idx ON transaction_allocations(period_item_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS transaction_refunds_original_idx ON transaction_refunds(original_transaction_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS budget_refund_allocations_item_idx ON budget_refund_allocations(period_item_id)');
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
  if (!transactionColumns.some((column) => column.name === 'refund_of_transaction_id')) {
    await database.execAsync('ALTER TABLE transactions ADD COLUMN refund_of_transaction_id INTEGER REFERENCES transactions(id)');
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

function dateFromKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid calendar date.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (localDateKey(date) !== value) throw new Error('Enter a valid calendar date.');
  return date;
}

function addCalendarDays(value: string, days: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function monthlyDate(year: number, month: number, anchorDay: number) {
  return localDateKey(new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0).getDate()), 12));
}

type BudgetTemplateDraft = {
  id?: number;
  name: string;
  description: string;
  recurrence: BudgetRecurrence;
  startDate: string;
  endDate?: string | null;
  weekStartDay?: number | null;
  active?: boolean;
  archived?: boolean;
  items: BudgetTemplateItem[];
};

function validateBudgetTemplate(draft: BudgetTemplateDraft) {
  if (!draft.name.trim()) throw new Error('Enter a name for this budget.');
  dateFromKey(draft.startDate);
  if (draft.endDate) {
    dateFromKey(draft.endDate);
    if (draft.endDate < draft.startDate) throw new Error('The end date must be on or after the start date.');
  }
  if (!['daily', 'weekly', 'monthly'].includes(draft.recurrence)) {
    throw new Error('Choose a valid budget recurrence.');
  }
  if (draft.recurrence === 'weekly'
    && (!Number.isInteger(draft.weekStartDay) || (draft.weekStartDay ?? -1) < 0 || (draft.weekStartDay ?? 7) > 6)) {
    throw new Error('Choose the starting day for weekly budgets.');
  }
  if (!draft.items.length) throw new Error('Add at least one budget item.');
  for (const item of draft.items) {
    if (!item.name.trim()) throw new Error('Every budget item needs a name.');
    if (!Number.isSafeInteger(item.allocated_amount) || item.allocated_amount < 0) {
      throw new Error('Budget allocations must be whole, non-negative amounts.');
    }
    if (!['reset', 'carry', 'save'].includes(item.rollover)) {
      throw new Error('Choose a valid rollover preference.');
    }
    if (item.alert_thresholds.some((threshold) =>
      !Number.isSafeInteger(threshold) || threshold < 1 || threshold > 1000
    )) {
      throw new Error('Alert thresholds must be whole percentages between 1 and 1000.');
    }
  }
}

export async function saveBudgetTemplate(database: BrowserDatabase, draft: BudgetTemplateDraft) {
  validateBudgetTemplate(draft);
  const timestamp = new Date().toISOString();
  let templateId = draft.id ?? null;
  await database.withTransactionAsync(async () => {
    if (templateId !== null) {
      const current = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM budget_templates WHERE id = ?',
        templateId,
      );
      if (!current) throw new Error('This budget template no longer exists.');
      await database.runAsync(
        `UPDATE budget_templates SET name = ?, description = ?, recurrence = ?, start_date = ?,
           end_date = ?, week_start_day = ?, active = ?, archived = ?, updated_at = ?
         WHERE id = ?`,
        draft.name.trim(),
        draft.description.trim(),
        draft.recurrence,
        draft.startDate,
        draft.endDate || null,
        draft.recurrence === 'weekly' ? draft.weekStartDay ?? 0 : null,
        Number(draft.active ?? true),
        Number(draft.archived ?? false),
        timestamp,
        templateId,
      );
    } else {
      const result = await database.runAsync(
        `INSERT INTO budget_templates
          (name, description, recurrence, start_date, end_date, week_start_day, active, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        draft.name.trim(),
        draft.description.trim(),
        draft.recurrence,
        draft.startDate,
        draft.endDate || null,
        draft.recurrence === 'weekly' ? draft.weekStartDay ?? 0 : null,
        Number(draft.active ?? true),
        Number(draft.archived ?? false),
        timestamp,
        timestamp,
      );
      templateId = result.lastInsertRowId;
    }
    if (templateId === null) throw new Error('Budget template could not be saved.');
    await database.runAsync(
      'UPDATE budget_template_items SET active = 0 WHERE template_id = ?',
      templateId,
    );
    for (const [position, item] of draft.items.entries()) {
      const values = [
        item.name.trim(),
        item.description.trim(),
        item.allocated_amount,
        item.category.trim(),
        item.rollover,
        JSON.stringify(item.alert_thresholds),
        Number(item.active),
        position,
      ];
      if (item.id !== undefined) {
        const updated = await database.runAsync(
          `UPDATE budget_template_items
           SET name = ?, description = ?, allocated_amount = ?, category = ?, rollover = ?,
               alert_thresholds = ?, active = ?, position = ?
           WHERE id = ? AND template_id = ?`,
          ...values,
          item.id,
          templateId,
        );
        if (!updated.changes) throw new Error('A budget item no longer belongs to this template.');
      } else {
        await database.runAsync(
          `INSERT INTO budget_template_items
            (template_id, name, description, allocated_amount, category, rollover, alert_thresholds, active, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          templateId,
          ...values,
        );
      }
    }
    if (draft.id !== undefined) {
      const futurePeriods = await database.getAllAsync<{ id: number }>(
        `SELECT id FROM budget_periods
         WHERE template_id = ? AND start_date > ? AND status = 'upcoming'`,
        templateId,
        today(),
      );
      const activeItems = await database.getAllAsync<BudgetTemplateItemRow>(
        'SELECT * FROM budget_template_items WHERE template_id = ? AND active = 1 ORDER BY position, id',
        templateId,
      );
      for (const period of futurePeriods) {
        for (const item of activeItems) {
          const updated = await database.runAsync(
            `UPDATE budget_period_items
             SET name = ?, description = ?, category = ?, original_amount = ?,
                 rollover = ?, alert_thresholds = ?
             WHERE period_id = ? AND template_item_id = ?`,
            item.name,
            item.description,
            item.category,
            item.allocated_amount,
            item.rollover,
            item.alert_thresholds,
            period.id,
            item.id,
          );
          if (!updated.changes) {
            await database.runAsync(
              `INSERT OR IGNORE INTO budget_period_items
                (period_id, template_item_id, name, description, category, original_amount,
                 rollover, alert_thresholds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              period.id,
              item.id,
              item.name,
              item.description,
              item.category,
              item.allocated_amount,
              item.rollover,
              item.alert_thresholds,
            );
          }
        }
        await database.runAsync(
          `DELETE FROM budget_period_items
           WHERE period_id = ?
             AND template_item_id NOT IN (
               SELECT id FROM budget_template_items WHERE template_id = ? AND active = 1
             )
             AND NOT EXISTS (
               SELECT 1 FROM transaction_allocations WHERE period_item_id = budget_period_items.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM budget_adjustments WHERE period_item_id = budget_period_items.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM budget_alerts WHERE period_item_id = budget_period_items.id
             )`,
          period.id,
          templateId,
        );
      }
    }
  });
  return templateId;
}

export async function getBudgetTemplates(database: BrowserDatabase, includeArchived = false) {
  const templates = await database.getAllAsync<BudgetTemplate>(
    `SELECT * FROM budget_templates ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY active DESC, name COLLATE NOCASE`,
  );
  const withItems = await Promise.all(templates.map(async (template) => ({
    ...template,
    items: await database.getAllAsync<BudgetTemplateItemRow>(
      'SELECT * FROM budget_template_items WHERE template_id = ? ORDER BY position, id',
      template.id,
    ).then((items) => items.map((item) => ({
      ...item,
      alert_thresholds: JSON.parse(item.alert_thresholds) as number[],
      active: Boolean(item.active),
    }))),
  })));
  return withItems;
}

export async function setBudgetTemplateState(
  database: BrowserDatabase,
  templateId: number,
  state: { active?: boolean; archived?: boolean },
) {
  const result = await database.runAsync(
    `UPDATE budget_templates SET active = COALESCE(?, active),
       archived = COALESCE(?, archived), updated_at = ? WHERE id = ?`,
    state.active === undefined ? null : Number(state.active),
    state.archived === undefined ? null : Number(state.archived),
    new Date().toISOString(),
    templateId,
  );
  if (!result.changes) throw new Error('This budget template no longer exists.');
}

export async function deleteBudgetTemplate(database: BrowserDatabase, templateId: number) {
  await database.withTransactionAsync(async () => {
    const hasPeriods = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM budget_periods WHERE template_id = ? LIMIT 1',
      templateId,
    );
    if (hasPeriods) throw new Error('This budget has history. Archive it instead to preserve its periods.');
    await database.runAsync('DELETE FROM budget_template_items WHERE template_id = ?', templateId);
    const result = await database.runAsync('DELETE FROM budget_templates WHERE id = ?', templateId);
    if (!result.changes) throw new Error('This budget template no longer exists.');
  });
}

export async function generateBudgetPeriods(
  database: BrowserDatabase,
  throughDate = addCalendarDays(today(), 60),
) {
  dateFromKey(throughDate);
  const templates = await database.getAllAsync<BudgetTemplate>(
    'SELECT * FROM budget_templates WHERE active = 1 AND archived = 0 ORDER BY id',
  );
  const timestamp = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    for (const template of templates) {
      const items = await database.getAllAsync<BudgetTemplateItemRow>(
        'SELECT * FROM budget_template_items WHERE template_id = ? AND active = 1 ORDER BY position, id',
        template.id,
      );
      if (!items.length) continue;

      const start = dateFromKey(template.start_date);
      const anchorDay = start.getDate();
      let periodStart = template.start_date;
      if (template.recurrence === 'weekly') {
        const offset = ((template.week_start_day ?? 0) - start.getDay() + 7) % 7;
        if (offset > 0) periodStart = addCalendarDays(periodStart, offset);
      }

      let previousEnd = addCalendarDays(periodStart, -1);
      for (let count = 0; periodStart <= throughDate && count < 5000; count += 1) {
        if (template.end_date && periodStart > template.end_date) break;
        let nextStart: string;
        if (template.recurrence === 'daily') {
          nextStart = addCalendarDays(periodStart, 1);
        } else if (template.recurrence === 'weekly') {
          nextStart = addCalendarDays(periodStart, 7);
        } else {
          const current = dateFromKey(periodStart);
          nextStart = monthlyDate(current.getFullYear(), current.getMonth() + 1, anchorDay);
        }
        let periodEnd = addCalendarDays(nextStart, -1);
        if (template.end_date && periodEnd > template.end_date) periodEnd = template.end_date;
        if (periodEnd < periodStart) periodEnd = periodStart;

        const status = throughDate < periodStart
          ? 'upcoming'
          : today() >= periodStart && today() <= periodEnd
            ? 'active'
            : today() > periodEnd ? 'awaiting_review' : 'upcoming';
        const inserted = await database.runAsync(
          `INSERT OR IGNORE INTO budget_periods
            (template_id, start_date, end_date, status, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          template.id,
          periodStart,
          periodEnd,
          status,
          timestamp,
        );
        const period = await database.getFirstAsync<{ id: number }>(
          'SELECT id FROM budget_periods WHERE template_id = ? AND start_date = ? AND end_date = ?',
          template.id,
          periodStart,
          periodEnd,
        );
        if (!period) throw new Error('A budget period could not be generated.');
        await database.runAsync(
          `UPDATE budget_periods SET status = CASE
             WHEN ? > end_date THEN 'awaiting_review'
             WHEN ? < start_date THEN 'upcoming'
             ELSE 'active' END
           WHERE id = ? AND status NOT IN ('closed', 'cancelled')`,
          today(),
          today(),
          period.id,
        );
        if (inserted.changes) {
          const previousPeriod = await database.getFirstAsync<{ id: number; status: string }>(
            `SELECT id, status FROM budget_periods
             WHERE template_id = ? AND end_date = ? AND status = 'closed'
             ORDER BY id DESC LIMIT 1`,
            template.id,
            previousEnd,
          );
          for (const item of items) {
            let rolloverAmount = 0;
            let savedAmount = 0;
            if (previousPeriod) {
              const priorItem = await database.getFirstAsync<{ id: number; allocated: number; actual: number }>(
                `SELECT previous.id,
                   COALESCE((SELECT new_amount FROM budget_adjustments
                     WHERE period_item_id = previous.id ORDER BY id DESC LIMIT 1), previous.original_amount)
                     + previous.rollover_amount AS allocated,
                   COALESCE((SELECT SUM(allocations.amount)
                     FROM transaction_allocations allocations
                     JOIN transactions ON transactions.id = allocations.transaction_id
                     WHERE allocations.period_item_id = previous.id AND transactions.kind = 'expense'
                       AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
                   - COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
                     WHERE refunds.period_item_id = previous.id), 0) AS actual
                 FROM budget_period_items previous
                 WHERE previous.period_id = ? AND previous.template_item_id = ?`,
                previousPeriod.id,
                item.id,
              );
              const unspent = Math.max(0, (priorItem?.allocated ?? 0) - (priorItem?.actual ?? 0));
              if (item.rollover === 'carry') rolloverAmount = unspent;
              if (item.rollover === 'save') savedAmount = unspent;
            }
            await database.runAsync(
              `INSERT OR IGNORE INTO budget_period_items
                (period_id, template_item_id, name, description, category, original_amount,
                 rollover_amount, saved_amount, rollover, alert_thresholds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              period.id,
              item.id,
              item.name,
              item.description,
              item.category,
              item.allocated_amount,
              rolloverAmount,
              savedAmount,
              item.rollover,
              item.alert_thresholds,
            );
          }
        }
        previousEnd = periodEnd;
        periodStart = nextStart;
      }
    }
  });
}

export async function getBudgetPeriods(database: BrowserDatabase, templateId?: number) {
  return database.getAllAsync<BudgetPeriod>(
    `SELECT periods.*, templates.name AS template_name, templates.recurrence
     FROM budget_periods periods
     JOIN budget_templates templates ON templates.id = periods.template_id
     ${templateId === undefined ? '' : 'WHERE periods.template_id = ?'}
     ORDER BY periods.start_date DESC, periods.id DESC`,
    ...(templateId === undefined ? [] : [templateId]),
  );
}

export async function getBudgetPeriodSummaries(database: BrowserDatabase) {
  return database.getAllAsync<BudgetSummary>(
    `SELECT periods.*, templates.name AS template_name, templates.recurrence,
       COALESCE((SELECT SUM(
         COALESCE((SELECT adjustments.new_amount FROM budget_adjustments adjustments
           WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1),
           items.original_amount) + items.rollover_amount)
         FROM budget_period_items items WHERE items.period_id = periods.id), 0) AS allocated_amount,
       COALESCE((SELECT SUM(allocations.amount)
         FROM budget_period_items items
         JOIN transaction_allocations allocations ON allocations.period_item_id = items.id
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE items.period_id = periods.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount)
         FROM budget_period_items items
         JOIN budget_refund_allocations refunds ON refunds.period_item_id = items.id
         WHERE items.period_id = periods.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(
         COALESCE((SELECT adjustments.new_amount FROM budget_adjustments adjustments
           WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1),
           items.original_amount) + items.rollover_amount)
         FROM budget_period_items items WHERE items.period_id = periods.id), 0)
       - COALESCE((SELECT SUM(allocations.amount)
         FROM budget_period_items items
         JOIN transaction_allocations allocations ON allocations.period_item_id = items.id
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE items.period_id = periods.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
       + COALESCE((SELECT SUM(refunds.amount)
         FROM budget_period_items items
         JOIN budget_refund_allocations refunds ON refunds.period_item_id = items.id
         WHERE items.period_id = periods.id), 0) AS remaining_amount
     FROM budget_periods periods
     JOIN budget_templates templates ON templates.id = periods.template_id
     ORDER BY periods.start_date DESC, periods.id DESC`,
  );
}

export async function getUnallocatedExpenses(database: BrowserDatabase) {
  return database.getAllAsync<Transaction & { unallocated_amount: number }>(
    `SELECT transactions.*,
       transactions.amount - COALESCE(SUM(allocations.amount), 0) AS unallocated_amount
     FROM transactions
     LEFT JOIN transaction_allocations allocations ON allocations.transaction_id = transactions.id
     WHERE transactions.kind = 'expense' AND transactions.loan_id IS NULL
       AND transactions.transfer_id IS NULL
     GROUP BY transactions.id
     HAVING unallocated_amount > 0
     ORDER BY transactions.date DESC, transactions.id DESC`,
  );
}

export async function getBudgetPeriodTransactions(database: BrowserDatabase, periodItemId: number) {
  return database.getAllAsync<Transaction & { allocated_amount: number }>(
    `SELECT * FROM (
       SELECT transactions.*, SUM(allocations.amount) AS allocated_amount
       FROM transaction_allocations allocations
       JOIN transactions ON transactions.id = allocations.transaction_id
       WHERE allocations.period_item_id = ? AND transactions.kind = 'expense'
         AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
       GROUP BY transactions.id
       UNION ALL
       SELECT transactions.*, SUM(refund_allocations.amount) AS allocated_amount
       FROM budget_refund_allocations refund_allocations
       JOIN transaction_refunds refunds ON refunds.id = refund_allocations.refund_id
       JOIN transactions ON transactions.id = refunds.refund_transaction_id
       WHERE refund_allocations.period_item_id = ?
       GROUP BY transactions.id
     ) AS records
     ORDER BY records.date DESC, records.id DESC`,
    periodItemId,
    periodItemId,
  );
}

export async function getBudgetPeriodItems(database: BrowserDatabase, periodId: number) {
  return database.getAllAsync<BudgetPeriodItem>(
    `SELECT items.*,
       COALESCE((SELECT adjustments.new_amount FROM budget_adjustments adjustments
         WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1),
         items.original_amount) + items.rollover_amount AS final_amount,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.period_item_id = items.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS refunded_amount
     FROM budget_period_items items WHERE items.period_id = ? ORDER BY items.id`,
    periodId,
  );
}

export async function getAllocatableBudgetItems(database: BrowserDatabase, date = today()) {
  await generateBudgetPeriods(database, date);
  return database.getAllAsync<BudgetPeriodItem & {
    template_name: string;
    start_date: string;
    end_date: string;
  }>(
    `SELECT items.*,
       templates.name AS template_name, periods.start_date, periods.end_date,
       COALESCE((SELECT adjustments.new_amount FROM budget_adjustments adjustments
         WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1),
         items.original_amount) + items.rollover_amount AS final_amount,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.period_item_id = items.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS refunded_amount
     FROM budget_period_items items
     JOIN budget_periods periods ON periods.id = items.period_id
     JOIN budget_templates templates ON templates.id = periods.template_id
     WHERE periods.status = 'active' AND periods.start_date <= ? AND periods.end_date >= ?
       AND templates.active = 1 AND templates.archived = 0
     ORDER BY templates.name COLLATE NOCASE, items.id`,
    date,
    date,
  );
}

export async function getBudgetItemsForExpenseDate(database: BrowserDatabase, date: string) {
  await generateBudgetPeriods(database);
  return database.getAllAsync<BudgetPeriodItem & {
    template_name: string;
    start_date: string;
    end_date: string;
    period_status: string;
  }>(
    `SELECT items.*,
       templates.name AS template_name, periods.start_date, periods.end_date,
       periods.status AS period_status,
       COALESCE((SELECT adjustments.new_amount FROM budget_adjustments adjustments
         WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1),
         items.original_amount) + items.rollover_amount AS final_amount,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.period_item_id = items.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = items.id), 0) AS refunded_amount
     FROM budget_period_items items
     JOIN budget_periods periods ON periods.id = items.period_id
     JOIN budget_templates templates ON templates.id = periods.template_id
     WHERE periods.status IN ('active', 'awaiting_review')
       AND periods.start_date <= ? AND periods.end_date >= ?
     ORDER BY templates.name COLLATE NOCASE, items.id`,
    date,
    date,
  );
}

export async function getTransactionBudgetAllocations(
  database: BrowserDatabase,
  transactionId: number,
) {
  return database.getAllAsync<{
    period_item_id: number;
    amount: number;
    item_name: string;
    template_name: string;
    period_status: string;
  }>(
    `SELECT allocations.period_item_id, allocations.amount, items.name AS item_name,
       templates.name AS template_name, periods.status AS period_status
     FROM transaction_allocations allocations
     JOIN budget_period_items items ON items.id = allocations.period_item_id
     JOIN budget_periods periods ON periods.id = items.period_id
     JOIN budget_templates templates ON templates.id = periods.template_id
     WHERE allocations.transaction_id = ?
     ORDER BY templates.name COLLATE NOCASE, items.name COLLATE NOCASE`,
    transactionId,
  );
}

export async function saveTransactionBudgetAllocations(
  database: BrowserDatabase,
  transactionId: number,
  allocations: { periodItemId: number; amount: number }[],
) {
  if (allocations.some((allocation) =>
    !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
      || !Number.isSafeInteger(allocation.periodItemId) || allocation.periodItemId < 1
  )) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.periodItemId)).size !== allocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }

  await database.withTransactionAsync(async () => {
    const transaction = await database.getFirstAsync<{
      kind: string;
      amount: number;
      date: string;
      loan_id: number | null;
      transfer_id: number | null;
      refund_of_transaction_id: number | null;
    }>(
      `SELECT kind, amount, date, loan_id, transfer_id, refund_of_transaction_id
       FROM transactions WHERE id = ?`,
      transactionId,
    );
    if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
      || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) {
      throw new Error('Only regular expense transactions can be allocated to budgets.');
    }
    if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > transaction.amount) {
      throw new Error('Budget item allocations cannot exceed the expense total.');
    }
    const closedAllocation = await database.getFirstAsync<{ id: number }>(
      `SELECT periods.id
       FROM transaction_allocations allocations
       JOIN budget_period_items items ON items.id = allocations.period_item_id
       JOIN budget_periods periods ON periods.id = items.period_id
       WHERE allocations.transaction_id = ? AND periods.status = 'closed'
       LIMIT 1`,
      transactionId,
    );
    if (closedAllocation) {
      throw new Error('Reopen the closed budget period before changing allocations so its history is corrected intentionally.');
    }
    for (const allocation of allocations) {
      const periodItem = await database.getFirstAsync<{
        status: string;
        start_date: string;
        end_date: string;
      }>(
        `SELECT periods.status, periods.start_date, periods.end_date
         FROM budget_period_items items JOIN budget_periods periods ON periods.id = items.period_id
         WHERE items.id = ?`,
        allocation.periodItemId,
      );
      if (!periodItem
        || !['active', 'awaiting_review'].includes(periodItem.status)
        || transaction.date < periodItem.start_date
        || transaction.date > periodItem.end_date) {
        throw new Error('Choose an open budget item covering the expense date.');
      }
    }
    await database.runAsync('DELETE FROM transaction_allocations WHERE transaction_id = ?', transactionId);
    for (const allocation of allocations) {
      await database.runAsync(
        `INSERT INTO transaction_allocations (transaction_id, period_item_id, amount, created_at)
         VALUES (?, ?, ?, ?)`,
        transactionId,
        allocation.periodItemId,
        allocation.amount,
        new Date().toISOString(),
      );
      await updateBudgetThresholdAlerts(database, allocation.periodItemId);
    }
  });
}

async function updateBudgetThresholdAlerts(database: BrowserDatabase, periodItemId: number) {
  const item = await database.getFirstAsync<{
    original_amount: number;
    rollover_amount: number;
    alert_thresholds: string;
  }>('SELECT original_amount, rollover_amount, alert_thresholds FROM budget_period_items WHERE id = ?', periodItemId);
  if (!item) return;
  const adjusted = await database.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE((SELECT new_amount FROM budget_adjustments
       WHERE period_item_id = ? ORDER BY id DESC LIMIT 1), ?) + ? AS amount`,
    periodItemId,
    item.original_amount,
    item.rollover_amount,
  );
  const actual = await database.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE(SUM(allocations.amount), 0) - COALESCE((
       SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
       WHERE refunds.period_item_id = ?
     ), 0) AS amount
     FROM transaction_allocations allocations
     JOIN transactions ON transactions.id = allocations.transaction_id
     WHERE allocations.period_item_id = ? AND transactions.kind = 'expense'
       AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL`,
    periodItemId,
    periodItemId,
  );
  if (!adjusted?.amount) return;
  const percentage = (actual?.amount ?? 0) / adjusted.amount * 100;
  const thresholds = JSON.parse(item.alert_thresholds) as number[];
  for (const threshold of thresholds) {
    if (percentage >= threshold) {
      await database.runAsync(
        'INSERT OR IGNORE INTO budget_alerts (period_item_id, threshold, created_at) VALUES (?, ?, ?)',
        periodItemId,
        threshold,
        new Date().toISOString(),
      );
    }
  }
}

export async function getBudgetAlerts(database: BrowserDatabase) {
  return database.getAllAsync<BudgetAlert>(
    `SELECT alerts.*, templates.name AS template_name, items.name AS item_name, periods.start_date
     FROM budget_alerts alerts
     JOIN budget_period_items items ON items.id = alerts.period_item_id
     JOIN budget_periods periods ON periods.id = items.period_id
     JOIN budget_templates templates ON templates.id = periods.template_id
     ORDER BY alerts.created_at DESC LIMIT 30`,
  );
}

export async function allocateTransactionToBudgets(
  database: BrowserDatabase,
  transactionId: number,
  allocations: { periodItemId: number; amount: number }[],
  transactionAmount: number,
) {
  if (!allocations.length) return;
  if (!Number.isSafeInteger(transactionAmount) || transactionAmount <= 0) {
    throw new Error('Budget allocations require a whole-number transaction amount.');
  }
  if (allocations.some((allocation) =>
    !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
      || !Number.isSafeInteger(allocation.periodItemId) || allocation.periodItemId < 1
  )) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.periodItemId)).size !== allocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }
  if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > transactionAmount) {
    throw new Error('Budget item allocations cannot exceed the expense total.');
  }
  const transaction = await database.getFirstAsync<{ kind: string; date: string; amount: number; loan_id: number | null; transfer_id: number | null }>(
    'SELECT kind, date, amount, loan_id, transfer_id FROM transactions WHERE id = ?',
    transactionId,
  );
  if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null || transaction.transfer_id !== null) {
    throw new Error('Only regular expense transactions can be allocated to budgets.');
  }
  if (transaction.amount !== transactionAmount) throw new Error('The expense amount changed before allocation.');
  const timestamp = new Date().toISOString();
  for (const allocation of allocations) {
    const periodItem = await database.getFirstAsync<{ status: string; start_date: string; end_date: string }>(
      `SELECT periods.status, periods.start_date, periods.end_date
       FROM budget_period_items items JOIN budget_periods periods ON periods.id = items.period_id
       WHERE items.id = ?`,
      allocation.periodItemId,
    );
    if (!periodItem
      || periodItem.status === 'closed'
      || periodItem.status === 'cancelled'
      || transaction.date < periodItem.start_date
      || transaction.date > periodItem.end_date) {
      throw new Error('Choose an active budget item covering the expense date.');
    }
    await database.runAsync(
      'INSERT INTO transaction_allocations (transaction_id, period_item_id, amount, created_at) VALUES (?, ?, ?, ?)',
      transactionId,
      allocation.periodItemId,
      allocation.amount,
      timestamp,
    );
    await updateBudgetThresholdAlerts(database, allocation.periodItemId);
  }
}

export async function getRefundableAmount(database: BrowserDatabase, transactionId: number) {
  const row = await database.getFirstAsync<{ amount: number; refunded: number }>(
    `SELECT transactions.amount,
       COALESCE((SELECT SUM(refunds.amount) FROM transaction_refunds refunds
         WHERE refunds.original_transaction_id = transactions.id), 0) AS refunded
     FROM transactions
     WHERE transactions.id = ? AND transactions.kind = 'expense'
       AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
       AND transactions.refund_of_transaction_id IS NULL`,
    transactionId,
  );
  return row ? Math.max(0, row.amount - row.refunded) : 0;
}

export async function saveBudgetRefund(
  database: BrowserDatabase,
  originalTransactionId: number,
  amount: number,
  notes = '',
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Enter a refund amount as a positive whole number.');
  }
  let refundTransactionId: number | null = null;
  await database.withTransactionAsync(async () => {
    const original = await database.getFirstAsync<{
      id: number;
      title: string;
      amount: number;
      account_id: number | null;
      kind: string;
      loan_id: number | null;
      transfer_id: number | null;
      refund_of_transaction_id: number | null;
    }>(
      'SELECT id, title, amount, account_id, kind, loan_id, transfer_id, refund_of_transaction_id FROM transactions WHERE id = ?',
      originalTransactionId,
    );
    if (!original || original.kind !== 'expense' || original.loan_id !== null
      || original.transfer_id !== null || original.refund_of_transaction_id !== null
      || original.account_id === null) {
      throw new Error('Only a regular account expense can receive a refund.');
    }
    const refunded = await database.getFirstAsync<{ amount: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM transaction_refunds WHERE original_transaction_id = ?',
      originalTransactionId,
    );
    if (amount > original.amount - (refunded?.amount ?? 0)) {
      throw new Error('The refund exceeds the remaining refundable amount.');
    }

    const originalAllocations = await database.getAllAsync<{
      period_item_id: number;
      amount: number;
      refunded_amount: number;
      period_status: string;
    }>(
      `SELECT allocations.period_item_id, allocations.amount, periods.status AS period_status,
         COALESCE((SELECT SUM(refund_allocations.amount)
           FROM budget_refund_allocations refund_allocations
           JOIN transaction_refunds refunds ON refunds.id = refund_allocations.refund_id
           WHERE refund_allocations.period_item_id = allocations.period_item_id
             AND refunds.original_transaction_id = allocations.transaction_id), 0) AS refunded_amount
       FROM transaction_allocations allocations
       JOIN budget_period_items items ON items.id = allocations.period_item_id
       JOIN budget_periods periods ON periods.id = items.period_id
       WHERE allocations.transaction_id = ?`,
      originalTransactionId,
    );
    if (originalAllocations.some((allocation) => allocation.period_status === 'closed')) {
      throw new Error('Reopen the closed budget period before allocating this refund so its history is corrected intentionally.');
    }

    const createdAt = new Date().toISOString();
    const refundResult = await database.runAsync(
      `INSERT INTO transactions
        (kind, title, category, amount, date, notes, account_id, refund_of_transaction_id)
       VALUES ('income', ?, 'Refund', ?, ?, ?, ?, ?)`,
      `Refund · ${original.title}`,
      amount,
      today(),
      [`Refund for transaction #${originalTransactionId}`, notes.trim()].filter(Boolean).join('\n\n'),
      original.account_id,
      originalTransactionId,
    );
    refundTransactionId = refundResult.lastInsertRowId;
    const refund = await database.runAsync(
      `INSERT INTO transaction_refunds
        (original_transaction_id, refund_transaction_id, amount, created_at)
       VALUES (?, ?, ?, ?)`,
      originalTransactionId,
      refundTransactionId,
      amount,
      createdAt,
    );

    const capacities = originalAllocations.map((allocation) => ({
      periodItemId: allocation.period_item_id,
      amount: Math.max(0, allocation.amount - allocation.refunded_amount),
    })).filter((allocation) => allocation.amount > 0);
    const totalAllocated = capacities.reduce((sum, allocation) => sum + allocation.amount, 0);
    const allocateTotal = Math.min(amount, totalAllocated);
    if (allocateTotal > 0) {
      const denominator = BigInt(totalAllocated);
      const portions = capacities.map((allocation) => {
        const numerator = BigInt(allocateTotal) * BigInt(allocation.amount);
        return {
          ...allocation,
          amount: Number(numerator / denominator),
          remainder: numerator % denominator,
        };
      });
      let remainder = allocateTotal - portions.reduce((sum, allocation) => sum + allocation.amount, 0);
      portions.sort((left, right) =>
        left.remainder === right.remainder ? left.periodItemId - right.periodItemId
          : left.remainder > right.remainder ? -1 : 1,
      );
      for (let index = 0; index < portions.length && remainder > 0; index += 1) {
        portions[index].amount += 1;
        remainder -= 1;
      }
      for (const portion of portions) {
        if (portion.amount <= 0) continue;
        await database.runAsync(
          'INSERT INTO budget_refund_allocations (refund_id, period_item_id, amount) VALUES (?, ?, ?)',
          refund.lastInsertRowId,
          portion.periodItemId,
          portion.amount,
        );
        await updateBudgetThresholdAlerts(database, portion.periodItemId);
      }
    }
  });
  if (refundTransactionId === null) throw new Error('Refund could not be recorded.');
  return refundTransactionId;
}

export async function adjustBudgetPeriodItem(
  database: BrowserDatabase,
  periodItemId: number,
  newAmount: number,
  reason = '',
  confirmBelowActual = false,
) {
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) {
    throw new Error('Budget amounts must be whole, non-negative numbers.');
  }
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{ original_amount: number; rollover_amount: number; period_id: number; status: string }>(
      `SELECT items.original_amount, items.rollover_amount, periods.id AS period_id, periods.status
       FROM budget_period_items items JOIN budget_periods periods ON periods.id = items.period_id
       WHERE items.id = ?`,
      periodItemId,
    );
    if (!item) throw new Error('This budget item no longer exists.');
    if (item.status === 'closed' || item.status === 'cancelled') throw new Error('Closed budget periods cannot be adjusted.');
    const previous = await database.getFirstAsync<{ amount: number }>(
      `SELECT COALESCE((SELECT new_amount FROM budget_adjustments
         WHERE period_item_id = ? ORDER BY id DESC LIMIT 1), ?) + ? AS amount`,
      periodItemId,
      item.original_amount,
      item.rollover_amount,
    );
    const actual = await database.getFirstAsync<{ amount: number }>(
      `SELECT COALESCE(SUM(allocations.amount), 0) - COALESCE((
         SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
         WHERE refunds.period_item_id = ?
       ), 0) AS amount
       FROM transaction_allocations allocations
       JOIN transactions ON transactions.id = allocations.transaction_id
       WHERE allocations.period_item_id = ? AND transactions.kind = 'expense'
         AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL`,
      periodItemId,
      periodItemId,
    );
    if (newAmount < (actual?.amount ?? 0) && !confirmBelowActual) {
      throw new Error('The new allocation is below current spending. Confirm the reduction to continue.');
    }
    const previousAmount = previous?.amount ?? item.original_amount + item.rollover_amount;
    await database.runAsync(
      `INSERT INTO budget_adjustments (period_item_id, previous_amount, new_amount, difference, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      periodItemId,
      previousAmount,
      newAmount,
      newAmount - previousAmount,
      reason.trim(),
      new Date().toISOString(),
    );
  });
}

export async function getBudgetAdjustments(database: BrowserDatabase, periodItemId: number) {
  return database.getAllAsync<{
    id: number;
    previous_amount: number;
    new_amount: number;
    difference: number;
    reason: string;
    created_at: string;
  }>('SELECT * FROM budget_adjustments WHERE period_item_id = ? ORDER BY id DESC', periodItemId);
}

export async function closeBudgetPeriod(database: BrowserDatabase, periodId: number, note = '') {
  await database.withTransactionAsync(async () => {
    const period = await database.getFirstAsync<{ template_id: number; end_date: string }>(
      'SELECT template_id, end_date FROM budget_periods WHERE id = ?',
      periodId,
    );
    if (!period) throw new Error('This budget period no longer exists.');
    const result = await database.runAsync(
      `UPDATE budget_periods SET status = 'closed', closed_at = ?
       WHERE id = ? AND status IN ('active', 'awaiting_review')`,
      new Date().toISOString(),
      periodId,
    );
    if (!result.changes) throw new Error('This budget period is already closed or cannot be closed.');
    await database.runAsync(
      'INSERT INTO budget_period_closures (period_id, action, note, created_at) VALUES (?, ?, ?, ?)',
      periodId,
      'closed',
      note.trim(),
      new Date().toISOString(),
    );
    const nextPeriod = await database.getFirstAsync<{ id: number }>(
      `SELECT id FROM budget_periods
       WHERE template_id = ? AND start_date = ? AND status != 'cancelled'
       ORDER BY id LIMIT 1`,
      period.template_id,
      addCalendarDays(period.end_date, 1),
    );
    if (nextPeriod) {
      const currentItems = await database.getAllAsync<{
        template_item_id: number | null;
        rollover: BudgetRollover;
        original_amount: number;
        rollover_amount: number;
        id: number;
      }>('SELECT * FROM budget_period_items WHERE period_id = ?', periodId);
      for (const current of currentItems) {
        if (current.template_item_id === null) continue;
        const nextItem = await database.getFirstAsync<{ id: number }>(
          'SELECT id FROM budget_period_items WHERE period_id = ? AND template_item_id = ?',
          nextPeriod.id,
          current.template_item_id,
        );
        if (!nextItem) continue;
        const finalAmount = await database.getFirstAsync<{ amount: number }>(
          `SELECT COALESCE((SELECT new_amount FROM budget_adjustments
             WHERE period_item_id = ? ORDER BY id DESC LIMIT 1), ?) + ? AS amount`,
          current.id,
          current.original_amount,
          current.rollover_amount,
        );
        const actual = await database.getFirstAsync<{ amount: number }>(
          `SELECT COALESCE(SUM(allocations.amount), 0) - COALESCE((
             SELECT SUM(refunds.amount) FROM budget_refund_allocations refunds
             WHERE refunds.period_item_id = ?
           ), 0) AS amount
           FROM transaction_allocations allocations
           JOIN transactions ON transactions.id = allocations.transaction_id
           WHERE allocations.period_item_id = ? AND transactions.kind = 'expense'
             AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL`,
          current.id,
          current.id,
        );
        const unspent = Math.max(0, (finalAmount?.amount ?? 0) - (actual?.amount ?? 0));
        await database.runAsync(
          `UPDATE budget_period_items SET rollover_amount = ?, saved_amount = ?
           WHERE id = ?`,
          current.rollover === 'carry' ? unspent : 0,
          current.rollover === 'save' ? unspent : 0,
          nextItem.id,
        );
      }
    }
  });
}

export async function reopenBudgetPeriod(database: BrowserDatabase, periodId: number, note = '') {
  await database.withTransactionAsync(async () => {
    const period = await database.getFirstAsync<{ template_id: number; end_date: string }>(
      'SELECT template_id, end_date FROM budget_periods WHERE id = ?',
      periodId,
    );
    if (!period) throw new Error('This budget period no longer exists.');
    const nextPeriod = await database.getFirstAsync<{ id: number; status: string }>(
      `SELECT id, status FROM budget_periods
       WHERE template_id = ? AND start_date = ? AND status != 'cancelled'
       ORDER BY id LIMIT 1`,
      period.template_id,
      addCalendarDays(period.end_date, 1),
    );
    if (nextPeriod?.status === 'closed') {
      throw new Error('Reopen the next period before correcting this closed period.');
    }
    const result = await database.runAsync(
      `UPDATE budget_periods SET status = CASE
         WHEN start_date <= ? AND end_date >= ? THEN 'active'
         ELSE 'awaiting_review' END, closed_at = NULL
       WHERE id = ? AND status = 'closed'`,
      today(),
      today(),
      periodId,
    );
    if (!result.changes) throw new Error('This budget period is not closed.');
    await database.runAsync(
      'INSERT INTO budget_period_closures (period_id, action, note, created_at) VALUES (?, ?, ?, ?)',
      periodId,
      'reopened',
      note.trim(),
      new Date().toISOString(),
    );
    if (nextPeriod) {
      await database.runAsync(
        'UPDATE budget_period_items SET rollover_amount = 0, saved_amount = 0 WHERE period_id = ?',
        nextPeriod.id,
      );
    }
  });
}

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
    const transaction = await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'expense',
      title,
      category,
      amount,
      date,
      transactionNotes,
      draft.accountId,
    );
    await allocateTransactionToBudgets(
      database,
      transaction.lastInsertRowId,
      draft.budgetAllocations ?? [],
      amount,
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
      const list = await database.getFirstAsync<{ final_transaction_id: number | null; refund_of_transaction_id: number | null }>(
        `SELECT lists.final_transaction_id, transactions.refund_of_transaction_id
         FROM lists LEFT JOIN transactions ON transactions.id = lists.final_transaction_id
         WHERE lists.id = ?`,
        id,
      );
      if (list?.final_transaction_id) {
        if (list.refund_of_transaction_id !== null) {
          throw new Error('This budget expense has a refund. Keep the list and its accounting history.');
        }
        const closedAllocation = await database.getFirstAsync<{ id: number }>(
          `SELECT periods.id
           FROM transaction_allocations allocations
           JOIN budget_period_items items ON items.id = allocations.period_item_id
           JOIN budget_periods periods ON periods.id = items.period_id
           WHERE allocations.transaction_id = ? AND periods.status = 'closed'
           LIMIT 1`,
          list.final_transaction_id,
        );
        if (closedAllocation) {
          throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
        }
        await detachReferences('transaction', list.final_transaction_id);
        await database.runAsync(
          'DELETE FROM transaction_allocations WHERE transaction_id = ?',
          list.final_transaction_id,
        );
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
        refund_of_transaction_id: number | null;
      }>(
        'SELECT kind, amount, account_id, refund_of_transaction_id FROM transactions WHERE id = ?',
        id,
      );
      if (transaction?.refund_of_transaction_id !== null && transaction?.refund_of_transaction_id !== undefined) {
        throw new Error('Refund records are part of the accounting history and cannot be deleted.');
      }
      const linkedRefund = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM transaction_refunds WHERE original_transaction_id = ? LIMIT 1',
        id,
      );
      if (linkedRefund) throw new Error('This expense has a linked refund. Keep it to preserve the accounting history.');
      const closedAllocation = await database.getFirstAsync<{ id: number }>(
        `SELECT periods.id
         FROM transaction_allocations allocations
         JOIN budget_period_items items ON items.id = allocations.period_item_id
         JOIN budget_periods periods ON periods.id = items.period_id
         WHERE allocations.transaction_id = ? AND periods.status = 'closed'
         LIMIT 1`,
        id,
      );
      if (closedAllocation) {
        throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
      }
      if (transaction?.kind === 'income' && transaction.account_id !== null) {
        await ensureAccountBalance(database, transaction.account_id, transaction.amount);
      }
      await detachReferences('transaction', id);
      await database.runAsync('DELETE FROM transaction_allocations WHERE transaction_id = ?', id);
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
      refund_of_transaction_id: number | null;
    }>(
      `SELECT lists.finalized, lists.final_transaction_id, transactions.refund_of_transaction_id
       FROM lists LEFT JOIN transactions ON transactions.id = lists.final_transaction_id
       WHERE lists.id = ?`,
      listId,
    );
    if (!list) throw new Error('The list no longer exists.');
    if (!list.finalized) return;
    if (list.final_transaction_id) {
      if (list.refund_of_transaction_id !== null) {
        throw new Error('This budget expense has a refund. Keep the list and its accounting history.');
      }
      await database.runAsync(
        'DELETE FROM transaction_allocations WHERE transaction_id = ?',
        list.final_transaction_id,
      );
      await database.runAsync('DELETE FROM transactions WHERE id = ?', list.final_transaction_id);
    }
    await database.runAsync(
      'UPDATE lists SET finalized = 0, final_transaction_id = NULL WHERE id = ?',
      listId,
    );
  });
}
