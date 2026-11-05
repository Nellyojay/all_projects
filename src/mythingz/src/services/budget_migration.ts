import type { BrowserDatabase } from '../web/database';
import { currentTimestamp } from './database_types';

const MIGRATION_VERSION = 1;
export const SHARED_BUDGET_BACKUP_KEY = 'mine.db.pre-shared-budget-v1';
export const BUDGET_ITEM_CATEGORY_BACKUP_KEY = 'mine.db.pre-budget-item-category-v2';
const BUDGET_ITEM_CATEGORY_MIGRATION_VERSION = 2;

type CountRow = { count: number };
type LegacyBudget = { id: number; title: string; amount: number; notes: string };
type BudgetList = {
  id: number;
  title: string;
  notes: string;
  items: string;
  finalized: number;
  final_transaction_id: number | null;
};
type ListItem = { text: string; done: boolean; price: number; quantity: number };
type Period = {
  id: number;
  template_id: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  closed_at: string | null;
};
type PeriodItem = {
  id: number;
  period_id: number;
  template_item_id: number | null;
  name: string;
  description: string;
  original_amount: number;
  rollover_amount: number;
  saved_amount: number;
  rollover: string;
  alert_thresholds: string;
  adjusted_amount: number | null;
};

async function countRows(database: BrowserDatabase, table: string) {
  const result = await database.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`);
  return result?.count ?? 0;
}

function assertIntegerAmount(value: number, description: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} is not a whole, non-negative UGX amount; the original data was left unchanged.`);
  }
}

function parseListItems(value: string, listId: number): ListItem[] {
  let items: unknown;
  try {
    items = JSON.parse(value);
  } catch {
    throw new Error(`Budget list ${listId} has invalid item data; the original data was left unchanged.`);
  }
  if (!Array.isArray(items)) {
    throw new Error(`Budget list ${listId} has invalid item data; the original data was left unchanged.`);
  }
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Budget list ${listId}, item ${index + 1} is invalid; the original data was left unchanged.`);
    }
    const candidate = item as Partial<ListItem>;
    if (typeof candidate.text !== 'string'
      || typeof candidate.done !== 'boolean'
      || typeof candidate.price !== 'number'
      || !Number.isSafeInteger(candidate.price)
      || candidate.price < 0
      || typeof candidate.quantity !== 'number'
      || !Number.isSafeInteger(candidate.quantity)
      || candidate.quantity < 1) {
      throw new Error(`Budget list ${listId}, item ${index + 1} cannot be migrated without changing its value.`);
    }
    return candidate as ListItem;
  });
}

async function ensureMigrationTables(database: BrowserDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS budget_migration_runs (
      version INTEGER PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('started', 'failed', 'completed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      source_counts TEXT NOT NULL DEFAULT '{}',
      destination_counts TEXT NOT NULL DEFAULT '{}',
      error TEXT
    );`);
}

async function createSharedBudgetTables(database: BrowserDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('normal', 'recurring')),
      template_id INTEGER REFERENCES budget_templates(id),
      start_date TEXT,
      end_date TEXT,
      total_allocated INTEGER NOT NULL DEFAULT 0 CHECK (total_allocated >= 0),
      status TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_list_id INTEGER UNIQUE,
      source_legacy_budget_id INTEGER UNIQUE,
      source_transaction_id INTEGER,
      legacy_period_id INTEGER UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
      CHECK ((type = 'normal' AND template_id IS NULL) OR (type = 'recurring' AND template_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS budget_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL REFERENCES budgets(id),
      template_item_id INTEGER,
      name TEXT NOT NULL,
      allocated_amount INTEGER NOT NULL CHECK (allocated_amount >= 0),
      original_amount INTEGER NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
      rollover_amount INTEGER NOT NULL DEFAULT 0 CHECK (rollover_amount >= 0),
      saved_amount INTEGER NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
      rollover TEXT NOT NULL DEFAULT 'reset',
      alert_thresholds TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      source_list_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (budget_id, template_item_id)
    );
    CREATE TABLE IF NOT EXISTS transaction_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      budget_id INTEGER REFERENCES budgets(id),
      budget_item_id INTEGER REFERENCES budget_items(id),
      period_item_id INTEGER,
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TEXT NOT NULL,
      UNIQUE (transaction_id, budget_item_id)
    );
    CREATE TABLE IF NOT EXISTS legacy_budget_item_map (
      period_item_id INTEGER PRIMARY KEY,
      budget_item_id INTEGER NOT NULL UNIQUE REFERENCES budget_items(id)
    );
    CREATE TABLE IF NOT EXISTS budget_item_refund_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_id INTEGER NOT NULL REFERENCES transaction_refunds(id) ON DELETE CASCADE,
      budget_item_id INTEGER NOT NULL REFERENCES budget_items(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      UNIQUE (refund_id, budget_item_id)
    );
    CREATE TABLE IF NOT EXISTS budget_item_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_item_id INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
      previous_amount INTEGER NOT NULL CHECK (previous_amount >= 0),
      new_amount INTEGER NOT NULL CHECK (new_amount >= 0),
      difference INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_item_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_item_id INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
      threshold INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (budget_item_id, threshold)
    );
    CREATE TABLE IF NOT EXISTS budget_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL REFERENCES budgets(id),
      action TEXT NOT NULL CHECK (action IN ('closed', 'reopened')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
}

export async function backupBeforeSharedBudgetMigration(database: BrowserDatabase) {
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) >= MIGRATION_VERSION) return;
  const budgetColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(budgets)');
  if (budgetColumns.some((column) => column.name === 'title')
    && budgetColumns.some((column) => column.name === 'amount')) {
    await database.createBackupAsync(SHARED_BUDGET_BACKUP_KEY);
  }
}

async function installRecurringCompatibilityTriggers(database: BrowserDatabase) {
  await database.execAsync(`
    CREATE TRIGGER IF NOT EXISTS shared_budget_total_after_item_insert
    AFTER INSERT ON budget_items BEGIN
      UPDATE budgets SET total_allocated = (
        SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_items WHERE budget_id = NEW.budget_id
      ), updated_at = NEW.updated_at WHERE id = NEW.budget_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_total_after_item_update
    AFTER UPDATE OF allocated_amount, budget_id ON budget_items BEGIN
      UPDATE budgets SET total_allocated = (
        SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_items WHERE budget_id = NEW.budget_id
      ), updated_at = NEW.updated_at WHERE id = NEW.budget_id;
      UPDATE budgets SET total_allocated = (
        SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_items WHERE budget_id = OLD.budget_id
      ) WHERE id = OLD.budget_id AND OLD.budget_id != NEW.budget_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_total_after_item_delete
    AFTER DELETE ON budget_items BEGIN
      UPDATE budgets SET total_allocated = (
        SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_items WHERE budget_id = OLD.budget_id
      ) WHERE id = OLD.budget_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_after_period_insert
    AFTER INSERT ON budget_periods BEGIN
      INSERT INTO budgets
        (name, type, template_id, start_date, end_date, total_allocated, status,
         legacy_period_id, created_at, updated_at, closed_at)
      SELECT templates.name, 'recurring', NEW.template_id, NEW.start_date, NEW.end_date,
        0, NEW.status, NEW.id, NEW.created_at, NEW.created_at, NEW.closed_at
      FROM budget_templates templates WHERE templates.id = NEW.template_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_after_period_update
    AFTER UPDATE OF status, start_date, end_date, closed_at ON budget_periods BEGIN
      UPDATE budgets SET status = NEW.status, start_date = NEW.start_date, end_date = NEW.end_date,
        closed_at = NEW.closed_at, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE legacy_period_id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_after_period_delete
    AFTER DELETE ON budget_periods BEGIN
      DELETE FROM budgets WHERE legacy_period_id = OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_item_after_period_item_insert
    AFTER INSERT ON budget_period_items BEGIN
      INSERT INTO budget_items
        (budget_id, template_item_id, name, allocated_amount, original_amount,
         rollover_amount, saved_amount, rollover, alert_thresholds, description, position,
         created_at, updated_at)
      VALUES (
        (SELECT id FROM budgets WHERE legacy_period_id = NEW.period_id),
        NEW.template_item_id, NEW.name,
        NEW.original_amount + NEW.rollover_amount, NEW.original_amount, NEW.rollover_amount,
        NEW.saved_amount, NEW.rollover, NEW.alert_thresholds, NEW.description,
        COALESCE((SELECT MAX(position) + 1 FROM budget_items
          WHERE budget_id = (SELECT id FROM budgets WHERE legacy_period_id = NEW.period_id)), 0),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
      INSERT INTO legacy_budget_item_map (period_item_id, budget_item_id)
        VALUES (NEW.id, last_insert_rowid());
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_item_after_period_item_update
    AFTER UPDATE OF name, description, original_amount, rollover_amount, saved_amount,
      rollover, alert_thresholds ON budget_period_items BEGIN
      UPDATE budget_items SET name = NEW.name,
        allocated_amount = COALESCE((SELECT new_amount FROM budget_adjustments
          WHERE period_item_id = NEW.id ORDER BY id DESC LIMIT 1), NEW.original_amount) + NEW.rollover_amount,
        original_amount = NEW.original_amount, rollover_amount = NEW.rollover_amount,
        saved_amount = NEW.saved_amount, rollover = NEW.rollover, alert_thresholds = NEW.alert_thresholds,
        description = NEW.description, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = (SELECT budget_item_id FROM legacy_budget_item_map WHERE period_item_id = NEW.id);
    END;
    CREATE TRIGGER IF NOT EXISTS shared_budget_item_after_period_item_delete
    AFTER DELETE ON budget_period_items BEGIN
      DELETE FROM budget_items
      WHERE id = (SELECT budget_item_id FROM legacy_budget_item_map WHERE period_item_id = OLD.id);
      DELETE FROM legacy_budget_item_map WHERE period_item_id = OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_allocation_after_legacy_insert
    AFTER INSERT ON transaction_allocations
    WHEN NEW.budget_item_id IS NULL AND NEW.period_item_id IS NOT NULL BEGIN
      UPDATE transaction_allocations
      SET budget_item_id = (SELECT budget_item_id FROM legacy_budget_item_map WHERE period_item_id = NEW.period_item_id),
          budget_id = (SELECT budget_id FROM budget_items
            WHERE id = (SELECT budget_item_id FROM legacy_budget_item_map WHERE period_item_id = NEW.period_item_id))
      WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_refund_after_legacy_insert
    AFTER INSERT ON budget_refund_allocations BEGIN
      INSERT OR IGNORE INTO budget_item_refund_allocations (id, refund_id, budget_item_id, amount)
      SELECT NEW.id, NEW.refund_id, budget_item_id, NEW.amount
      FROM legacy_budget_item_map WHERE period_item_id = NEW.period_item_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_adjustment_after_legacy_insert
    AFTER INSERT ON budget_adjustments BEGIN
      UPDATE budget_items SET allocated_amount = NEW.new_amount + rollover_amount,
        updated_at = NEW.created_at
      WHERE id = (SELECT budget_item_id FROM legacy_budget_item_map WHERE period_item_id = NEW.period_item_id);
    END;
    CREATE TRIGGER IF NOT EXISTS shared_alert_after_legacy_insert
    AFTER INSERT ON budget_alerts BEGIN
      INSERT OR IGNORE INTO budget_item_alerts (id, budget_item_id, threshold, created_at)
      SELECT NEW.id, budget_item_id, NEW.threshold, NEW.created_at
      FROM legacy_budget_item_map WHERE period_item_id = NEW.period_item_id;
    END;
    CREATE TRIGGER IF NOT EXISTS shared_closure_after_legacy_insert
    AFTER INSERT ON budget_period_closures BEGIN
      INSERT OR IGNORE INTO budget_closures (id, budget_id, action, note, created_at)
      SELECT NEW.id, id, NEW.action, NEW.note, NEW.created_at
      FROM budgets
      WHERE legacy_period_id = NEW.period_id
      ;
    END;
  `);
}

export async function migrateToSharedBudgets(database: BrowserDatabase) {
  await ensureMigrationTables(database);
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) >= MIGRATION_VERSION) {
    const completed = await database.getFirstAsync<{ status: string }>(
      'SELECT status FROM budget_migration_runs WHERE version = ?',
      MIGRATION_VERSION,
    );
    if (completed?.status === 'completed') return;
    throw new Error('The shared budget migration version is set but its completion could not be verified.');
  }

  await database.createBackupAsync(SHARED_BUDGET_BACKUP_KEY);
  const startedAt = currentTimestamp();
  await database.runAsync(
    `INSERT INTO budget_migration_runs (version, status, started_at, source_counts, destination_counts, error)
     VALUES (?, 'started', ?, '{}', '{}', NULL)
     ON CONFLICT(version) DO UPDATE SET status = 'started', started_at = excluded.started_at,
       completed_at = NULL, error = NULL`,
    MIGRATION_VERSION,
    startedAt,
  );

  try {
    const sourceCounts = {
      lists: await countRows(database, 'lists'),
      budgetLists: (await database.getFirstAsync<CountRow>(
        'SELECT COUNT(*) AS count FROM lists WHERE budget_enabled = 1',
      ))?.count ?? 0,
      legacyBudgets: await countRows(database, 'budgets'),
      templates: await countRows(database, 'budget_templates'),
      templateItems: await countRows(database, 'budget_template_items'),
      periods: await countRows(database, 'budget_periods'),
      periodItems: await countRows(database, 'budget_period_items'),
      allocations: await countRows(database, 'transaction_allocations'),
      refunds: await countRows(database, 'transaction_refunds'),
      refundAllocations: await countRows(database, 'budget_refund_allocations'),
      adjustments: await countRows(database, 'budget_adjustments'),
      alerts: await countRows(database, 'budget_alerts'),
      closures: await countRows(database, 'budget_period_closures'),
      transactions: await countRows(database, 'transactions'),
      accounts: await countRows(database, 'accounts'),
    };
    await database.runAsync(
      'UPDATE budget_migration_runs SET source_counts = ? WHERE version = ?',
      JSON.stringify(sourceCounts),
      MIGRATION_VERSION,
    );
    const brokenRelationships = await database.getFirstAsync<CountRow>(`
      SELECT
        (SELECT COUNT(*) FROM budget_periods periods
         LEFT JOIN budget_templates templates ON templates.id = periods.template_id
         WHERE templates.id IS NULL)
        + (SELECT COUNT(*) FROM budget_period_items items
           LEFT JOIN budget_periods periods ON periods.id = items.period_id
           WHERE periods.id IS NULL)
        + (SELECT COUNT(*) FROM transaction_allocations allocations
           LEFT JOIN transactions ON transactions.id = allocations.transaction_id
           LEFT JOIN budget_period_items items ON items.id = allocations.period_item_id
           WHERE transactions.id IS NULL OR transactions.kind != 'expense' OR items.id IS NULL)
        + (SELECT COUNT(*) FROM (
             SELECT allocations.transaction_id, SUM(allocations.amount) AS amount
             FROM transaction_allocations allocations
             GROUP BY allocations.transaction_id
           ) totals
           JOIN transactions ON transactions.id = totals.transaction_id
           WHERE totals.amount > transactions.amount)
        + (SELECT COUNT(*) FROM budget_refund_allocations allocations
           LEFT JOIN transaction_refunds refunds ON refunds.id = allocations.refund_id
           LEFT JOIN budget_period_items items ON items.id = allocations.period_item_id
           WHERE refunds.id IS NULL OR items.id IS NULL)
        + (SELECT COUNT(*) FROM budget_adjustments adjustments
           LEFT JOIN budget_period_items items ON items.id = adjustments.period_item_id
           WHERE items.id IS NULL)
        + (SELECT COUNT(*) FROM budget_alerts alerts
           LEFT JOIN budget_period_items items ON items.id = alerts.period_item_id
           WHERE items.id IS NULL)
        + (SELECT COUNT(*) FROM budget_period_closures closures
           LEFT JOIN budget_periods periods ON periods.id = closures.period_id
           WHERE periods.id IS NULL)
        + (SELECT COUNT(*) FROM lists
           LEFT JOIN transactions ON transactions.id = lists.final_transaction_id
           WHERE lists.budget_enabled = 1 AND lists.finalized = 1
             AND lists.final_transaction_id IS NOT NULL AND transactions.id IS NULL)
        AS count
    `);
    if ((brokenRelationships?.count ?? 0) > 0) {
      throw new Error('Pre-migration relationship checks failed; source records were left unchanged.');
    }

    await database.withTransactionAsync(async () => {
      let expectedBudgetItemCount = sourceCounts.periodItems + sourceCounts.legacyBudgets;
      const alreadyMigrated = await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_budgets'",
      );
      if (!alreadyMigrated) await database.runAsync('ALTER TABLE budgets RENAME TO legacy_budgets');
      const oldAllocationTable = await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transaction_allocations'",
      );
      if (oldAllocationTable) {
        await database.runAsync('ALTER TABLE transaction_allocations RENAME TO legacy_transaction_allocations');
        await database.runAsync('DROP INDEX IF EXISTS transaction_allocations_transaction_idx');
        await database.runAsync('DROP INDEX IF EXISTS transaction_allocations_item_idx');
      }
      await createSharedBudgetTables(database);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS budgets_type_dates_idx ON budgets(type, start_date, end_date, status);
        CREATE INDEX IF NOT EXISTS budget_items_budget_idx ON budget_items(budget_id, position, id);
        CREATE INDEX IF NOT EXISTS transaction_allocations_transaction_idx ON transaction_allocations(transaction_id);
        CREATE INDEX IF NOT EXISTS transaction_allocations_item_idx ON transaction_allocations(budget_item_id);
        CREATE INDEX IF NOT EXISTS budget_refund_allocations_item_idx ON budget_item_refund_allocations(budget_item_id);
      `);

      const timestamp = currentTimestamp();
      const periods = await database.getAllAsync<Period>(
        'SELECT * FROM budget_periods ORDER BY id',
      );
      const legacyItems = await database.getAllAsync<PeriodItem>(
        `SELECT items.*,
           (SELECT new_amount FROM budget_adjustments adjustments
            WHERE adjustments.period_item_id = items.id ORDER BY adjustments.id DESC LIMIT 1) AS adjusted_amount
         FROM budget_period_items items ORDER BY items.id`,
      );
      const itemsByPeriod = new Map<number, PeriodItem[]>();
      for (const item of legacyItems) {
        const periodItems = itemsByPeriod.get(item.period_id) ?? [];
        periodItems.push(item);
        itemsByPeriod.set(item.period_id, periodItems);
      }
      for (const period of periods) {
        const items = itemsByPeriod.get(period.id) ?? [];
        const allocated = items.reduce((sum, item) => {
          const current = item.adjusted_amount ?? item.original_amount;
          assertIntegerAmount(current + item.rollover_amount, `Recurring budget item ${item.id}`);
          return sum + current + item.rollover_amount;
        }, 0);
        await database.runAsync(
          `INSERT INTO budgets
            (id, name, type, template_id, start_date, end_date, total_allocated, status,
             legacy_period_id, created_at, updated_at, closed_at)
           SELECT ?, templates.name, 'recurring', ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM budget_templates templates WHERE templates.id = ?`,
          period.id,
          period.template_id,
          period.start_date,
          period.end_date,
          allocated,
          period.status,
          period.id,
          period.created_at,
          period.created_at,
          period.closed_at,
          period.template_id,
        );
        const inserted = await database.getFirstAsync<{ id: number }>(
          'SELECT id FROM budgets WHERE legacy_period_id = ?',
          period.id,
        );
        if (!inserted) {
          throw new Error(`Recurring budget period ${period.id} refers to a missing template.`);
        }
      }
      for (const item of legacyItems) {
        const allocatedAmount = (item.adjusted_amount ?? item.original_amount) + item.rollover_amount;
        assertIntegerAmount(allocatedAmount, `Recurring budget item ${item.id}`);
        await database.runAsync(
          `INSERT INTO budget_items
            (id, budget_id, template_item_id, name, allocated_amount, original_amount,
             rollover_amount, saved_amount, rollover, alert_thresholds, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.id,
          item.period_id,
          item.template_item_id,
          item.name,
          allocatedAmount,
          item.original_amount,
          item.rollover_amount,
          item.saved_amount,
          item.rollover,
          item.alert_thresholds,
          item.description,
          timestamp,
          timestamp,
        );
      }
      await database.runAsync(
        `INSERT INTO legacy_budget_item_map (period_item_id, budget_item_id)
         SELECT id, id FROM budget_period_items`,
      );

      const legacyBudgets = await database.getAllAsync<LegacyBudget>(
        'SELECT id, title, amount, notes FROM legacy_budgets ORDER BY id',
      );
      for (const budget of legacyBudgets) {
        assertIntegerAmount(budget.amount, `Legacy budget ${budget.id}`);
        const inserted = await database.runAsync(
          `INSERT INTO budgets
            (name, type, total_allocated, status, description, source_legacy_budget_id, created_at, updated_at)
           VALUES (?, 'normal', ?, 'active', ?, ?, ?, ?)`,
          budget.title,
          budget.amount,
          budget.notes,
          budget.id,
          timestamp,
          timestamp,
        );
        await database.runAsync(
          `INSERT INTO budget_items
            (budget_id, name, allocated_amount, original_amount, notes, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          inserted.lastInsertRowId,
          budget.title,
          budget.amount,
          budget.amount,
          budget.notes,
          JSON.stringify({ legacyBudgetId: budget.id, legacyTitle: budget.title }),
          timestamp,
          timestamp,
        );
      }

      const lists = await database.getAllAsync<BudgetList>(
        `SELECT id, title, notes, items, finalized, final_transaction_id FROM lists
         WHERE budget_enabled = 1 ORDER BY id`,
      );
      const listAllocations: { transactionId: number; budgetId: number; itemId: number; amount: number }[] = [];
      for (const list of lists) {
        const items = parseListItems(list.items, list.id);
        expectedBudgetItemCount += items.length;
        const totalAllocated = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        assertIntegerAmount(totalAllocated, `Budget list ${list.id}`);
        const result = await database.runAsync(
          `INSERT INTO budgets
            (name, type, total_allocated, status, description, source_list_id,
             source_transaction_id, created_at, updated_at, closed_at)
           VALUES (?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?)`,
          list.title,
          totalAllocated,
          list.finalized ? 'closed' : 'active',
          list.notes,
          list.id,
          list.final_transaction_id,
          timestamp,
          timestamp,
          list.finalized ? timestamp : null,
        );
        const budgetId = result.lastInsertRowId;
        for (const [position, item] of items.entries()) {
          const amount = item.price * item.quantity;
          assertIntegerAmount(amount, `Budget list ${list.id} item ${position + 1}`);
          const insertedItem = await database.runAsync(
            `INSERT INTO budget_items
              (budget_id, name, allocated_amount, original_amount, metadata_json, position,
               source_list_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            budgetId,
            item.text,
            amount,
            amount,
            JSON.stringify(item),
            position,
            list.id,
            timestamp,
            timestamp,
          );
          if (list.finalized && list.final_transaction_id && item.done && amount > 0) {
            listAllocations.push({
              transactionId: list.final_transaction_id,
              budgetId,
              itemId: insertedItem.lastInsertRowId,
              amount,
            });
          }
        }
      }
      const allocationsByTransaction = new Map<number, number>();
      for (const allocation of listAllocations) {
        allocationsByTransaction.set(
          allocation.transactionId,
          (allocationsByTransaction.get(allocation.transactionId) ?? 0) + allocation.amount,
        );
      }
      for (const [transactionId, amount] of allocationsByTransaction) {
        const transaction = await database.getFirstAsync<{ kind: string; amount: number }>(
          'SELECT kind, amount FROM transactions WHERE id = ?',
          transactionId,
        );
        if (!transaction || transaction.kind !== 'expense' || amount > transaction.amount) {
          throw new Error(`Finalized budget list transaction ${transactionId} has inconsistent expense allocations.`);
        }
      }

      const existingAllocations = await database.getAllAsync<{
        id: number;
        transaction_id: number;
        period_item_id: number;
        amount: number;
        created_at: string;
      }>('SELECT * FROM legacy_transaction_allocations ORDER BY id');
      for (const allocation of existingAllocations) {
        assertIntegerAmount(allocation.amount, `Expense allocation ${allocation.id}`);
        const item = await database.getFirstAsync<{ budget_id: number }>(
          'SELECT budget_id FROM budget_items WHERE id = ?',
          allocation.period_item_id,
        );
        if (!item) throw new Error(`Expense allocation ${allocation.id} refers to a missing budget item.`);
        await database.runAsync(
          `INSERT INTO transaction_allocations
            (id, transaction_id, budget_id, budget_item_id, period_item_id, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          allocation.id,
          allocation.transaction_id,
          item.budget_id,
          allocation.period_item_id,
          allocation.period_item_id,
          allocation.amount,
          allocation.created_at,
        );
      }
      for (const allocation of listAllocations) {
        const transaction = await database.getFirstAsync<{ kind: string; amount: number }>(
          'SELECT kind, amount FROM transactions WHERE id = ?',
          allocation.transactionId,
        );
        if (!transaction || transaction.kind !== 'expense') {
          throw new Error(`Finalized budget list transaction ${allocation.transactionId} is missing or is not an expense.`);
        }
        await database.runAsync(
          `INSERT INTO transaction_allocations
            (transaction_id, budget_id, budget_item_id, amount, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          allocation.transactionId,
          allocation.budgetId,
          allocation.itemId,
          allocation.amount,
          timestamp,
        );
      }

      const refundAllocations = await database.getAllAsync<{
        id: number;
        refund_id: number;
        period_item_id: number;
        amount: number;
      }>('SELECT * FROM budget_refund_allocations ORDER BY id');
      for (const allocation of refundAllocations) {
        await database.runAsync(
          `INSERT INTO budget_item_refund_allocations (id, refund_id, budget_item_id, amount)
           VALUES (?, ?, ?, ?)`,
          allocation.id,
          allocation.refund_id,
          allocation.period_item_id,
          allocation.amount,
        );
      }
      const adjustments = await database.getAllAsync<{
        id: number;
        period_item_id: number;
        previous_amount: number;
        new_amount: number;
        difference: number;
        reason: string;
        created_at: string;
      }>('SELECT * FROM budget_adjustments ORDER BY id');
      for (const adjustment of adjustments) {
        await database.runAsync(
          `INSERT INTO budget_item_adjustments
            (id, budget_item_id, previous_amount, new_amount, difference, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          adjustment.id,
          adjustment.period_item_id,
          adjustment.previous_amount,
          adjustment.new_amount,
          adjustment.difference,
          adjustment.reason,
          adjustment.created_at,
        );
      }
      const alerts = await database.getAllAsync<{
        id: number;
        period_item_id: number;
        threshold: number;
        created_at: string;
      }>('SELECT * FROM budget_alerts ORDER BY id');
      for (const alert of alerts) {
        await database.runAsync(
          'INSERT INTO budget_item_alerts (id, budget_item_id, threshold, created_at) VALUES (?, ?, ?, ?)',
          alert.id,
          alert.period_item_id,
          alert.threshold,
          alert.created_at,
        );
      }
      const closures = await database.getAllAsync<{
        id: number;
        period_id: number;
        action: string;
        note: string;
        created_at: string;
      }>('SELECT * FROM budget_period_closures ORDER BY id');
      for (const closure of closures) {
        await database.runAsync(
          'INSERT INTO budget_closures (id, budget_id, action, note, created_at) VALUES (?, ?, ?, ?, ?)',
          closure.id,
          closure.period_id,
          closure.action,
          closure.note,
          closure.created_at,
        );
      }

      await installRecurringCompatibilityTriggers(database);
      const destinationCounts: Record<string, number> = {
        budgets: await countRows(database, 'budgets'),
        budgetItems: await countRows(database, 'budget_items'),
        transactionAllocations: await countRows(database, 'transaction_allocations'),
        retainedLists: await countRows(database, 'lists'),
        retainedLegacyBudgets: await countRows(database, 'legacy_budgets'),
        retainedPeriods: await countRows(database, 'budget_periods'),
        retainedPeriodItems: await countRows(database, 'budget_period_items'),
        retainedLegacyAllocations: await countRows(database, 'legacy_transaction_allocations'),
        refundAllocations: await countRows(database, 'budget_item_refund_allocations'),
        adjustments: await countRows(database, 'budget_item_adjustments'),
        alerts: await countRows(database, 'budget_item_alerts'),
        closures: await countRows(database, 'budget_closures'),
        templates: await countRows(database, 'budget_templates'),
        templateItems: await countRows(database, 'budget_template_items'),
        transactions: await countRows(database, 'transactions'),
        accounts: await countRows(database, 'accounts'),
      };
      const allocationMismatches = await database.getFirstAsync<CountRow>(
        `SELECT COUNT(*) AS count
         FROM legacy_transaction_allocations source
         LEFT JOIN legacy_budget_item_map itemMap ON itemMap.period_item_id = source.period_item_id
         LEFT JOIN transaction_allocations migrated ON migrated.id = source.id
         WHERE migrated.id IS NULL OR migrated.transaction_id != source.transaction_id
           OR migrated.period_item_id != source.period_item_id
           OR migrated.budget_item_id != itemMap.budget_item_id
           OR migrated.amount != source.amount OR migrated.created_at != source.created_at`,
      );
      destinationCounts.allocationMismatches = allocationMismatches?.count ?? 0;
      if (destinationCounts.budgets !== sourceCounts.periods + sourceCounts.budgetLists + sourceCounts.legacyBudgets) {
        throw new Error('Budget record counts did not match the migration source records.');
      }
      if (destinationCounts.budgetItems !== expectedBudgetItemCount) {
        throw new Error('Budget item counts did not match the migration source records.');
      }
      if (destinationCounts.retainedLists !== sourceCounts.lists
        || destinationCounts.retainedLegacyBudgets !== sourceCounts.legacyBudgets
        || destinationCounts.retainedPeriods !== sourceCounts.periods
        || destinationCounts.retainedPeriodItems !== sourceCounts.periodItems
        || destinationCounts.retainedLegacyAllocations !== sourceCounts.allocations) {
        throw new Error('Legacy budget records were not retained after migration.');
      }
      if (destinationCounts.transactionAllocations !== sourceCounts.allocations + listAllocations.length) {
        throw new Error('Transaction allocation counts did not match the migration source records.');
      }
      if (destinationCounts.allocationMismatches !== 0) {
        throw new Error('One or more recurring expense allocations were not copied exactly.');
      }
      if (destinationCounts.refundAllocations !== sourceCounts.refundAllocations
        || destinationCounts.adjustments !== sourceCounts.adjustments
        || destinationCounts.alerts !== sourceCounts.alerts
        || destinationCounts.closures !== sourceCounts.closures) {
        throw new Error('Budget refund, adjustment, alert, or closure history did not match the source records.');
      }
      if (destinationCounts.transactions !== sourceCounts.transactions || destinationCounts.accounts !== sourceCounts.accounts
        || destinationCounts.templates !== sourceCounts.templates
        || destinationCounts.templateItems !== sourceCounts.templateItems) {
        throw new Error('Transaction, account, template, or template-item counts changed during migration.');
      }

      const foreignKeyIssues = await database.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
      if (foreignKeyIssues.length) {
        throw new Error('Database relationship verification failed; the original schema was retained.');
      }

      await database.runAsync(
        `UPDATE budget_migration_runs
         SET status = 'completed', completed_at = ?, source_counts = ?, destination_counts = ?, error = NULL
         WHERE version = ?`,
        currentTimestamp(),
        JSON.stringify(sourceCounts),
        JSON.stringify(destinationCounts),
        MIGRATION_VERSION,
      );
      await database.execAsync(`PRAGMA user_version = ${MIGRATION_VERSION}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown migration failure.';
    await database.runAsync(
      `UPDATE budget_migration_runs SET status = 'failed', error = ? WHERE version = ?`,
      message,
      MIGRATION_VERSION,
    );
    throw error;
  }
}

export async function migrateBudgetItemCategories(database: BrowserDatabase) {
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) >= BUDGET_ITEM_CATEGORY_MIGRATION_VERSION) {
    const completed = await database.getFirstAsync<{ status: string }>(
      'SELECT status FROM budget_migration_runs WHERE version = ?',
      BUDGET_ITEM_CATEGORY_MIGRATION_VERSION,
    );
    if (completed?.status === 'completed') return;
    throw new Error('The budget-item category migration version is set but its completion could not be verified.');
  }
  if ((version?.user_version ?? 0) < MIGRATION_VERSION) {
    throw new Error('The shared budget migration must complete before removing budget-item categories.');
  }

  await database.createBackupAsync(BUDGET_ITEM_CATEGORY_BACKUP_KEY);
  const tables = ['budget_items', 'budget_template_items', 'budget_period_items'] as const;
  const sourceCounts = Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await countRows(database, table)] as const)),
  );
  const startedAt = currentTimestamp();
  await database.runAsync(
    `INSERT INTO budget_migration_runs (version, status, started_at, source_counts, destination_counts, error)
     VALUES (?, 'started', ?, ?, '{}', NULL)
     ON CONFLICT(version) DO UPDATE SET status = 'started', started_at = excluded.started_at,
       completed_at = NULL, source_counts = excluded.source_counts, destination_counts = '{}', error = NULL`,
    BUDGET_ITEM_CATEGORY_MIGRATION_VERSION,
    startedAt,
    JSON.stringify(sourceCounts),
  );

  try {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        DROP TRIGGER IF EXISTS shared_budget_item_after_period_item_insert;
        DROP TRIGGER IF EXISTS shared_budget_item_after_period_item_update;
      `);
      for (const table of tables) {
        const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
        if (columns.some((column) => column.name === 'category')) {
          await database.execAsync(`ALTER TABLE ${table} DROP COLUMN category`);
        }
      }
      await installRecurringCompatibilityTriggers(database);

      const destinationCounts = Object.fromEntries(
        await Promise.all(tables.map(async (table) => [table, await countRows(database, table)] as const)),
      );
      for (const table of tables) {
        if (destinationCounts[table] !== sourceCounts[table]) {
          throw new Error(`Budget-item category migration changed the number of ${table} records.`);
        }
        const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
        if (columns.some((column) => column.name === 'category')) {
          throw new Error(`The category column remains in ${table} after migration.`);
        }
      }

      await database.runAsync(
        `UPDATE budget_migration_runs
         SET status = 'completed', completed_at = ?, destination_counts = ?, error = NULL
         WHERE version = ?`,
        currentTimestamp(),
        JSON.stringify(destinationCounts),
        BUDGET_ITEM_CATEGORY_MIGRATION_VERSION,
      );
      await database.execAsync(`PRAGMA user_version = ${BUDGET_ITEM_CATEGORY_MIGRATION_VERSION}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown migration failure.';
    await database.runAsync(
      'UPDATE budget_migration_runs SET status = \'failed\', error = ? WHERE version = ?',
      message,
      BUDGET_ITEM_CATEGORY_MIGRATION_VERSION,
    );
    throw error;
  }
}

export async function getSharedBudgetMigrationReport(database: BrowserDatabase) {
  return database.getFirstAsync<{
    version: number;
    status: 'started' | 'failed' | 'completed';
    started_at: string;
    completed_at: string | null;
    source_counts: string;
    destination_counts: string;
    error: string | null;
  }>(
    `SELECT version, status, started_at, completed_at, source_counts, destination_counts, error
     FROM budget_migration_runs WHERE version = ?`,
    MIGRATION_VERSION,
  );
}
