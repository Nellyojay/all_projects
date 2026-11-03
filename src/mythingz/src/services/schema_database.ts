import type { BrowserDatabase } from '../web/database';

export async function ensureListNotesColumn(database: BrowserDatabase) {
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
