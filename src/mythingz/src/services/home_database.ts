import type { BrowserDatabase } from '../web/database';
import type {
  EventRecord,
  NoteRecord,
  TaskRecord,
  Transaction,
} from './database_types';
import { getAccounts } from './finance_database';
import { getRecentActivity, getReminders } from './records_database';

export async function getDashboardData(
  database: BrowserDatabase,
  month: string,
  today: string,
  transactions: Transaction[],
) {
  const [
    tasks,
    events,
    notes,
    spent,
    budgetLists,
    accounts,
    income,
    reminders,
    activities,
    loans,
    taskCounts,
    eventPreparation,
  ] = await Promise.all([
    database.getAllAsync<TaskRecord>(
      "SELECT * FROM tasks WHERE completed = 0 AND date <= date(?, '+7 days') ORDER BY date LIMIT 30",
      today,
    ),
    database.getAllAsync<EventRecord>(
      `SELECT events.*,
        (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
       FROM events
       WHERE date >= ?
       ORDER BY date
       LIMIT 8`,
      today,
    ),
    database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 3'),
    database.getFirstAsync<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'expense' AND substr(date, 1, 7) = ?",
      month,
    ),
    database.getAllAsync<{
      id: number;
      title: string;
      items: string;
      actual: number;
    }>(
      `SELECT lists.id, lists.title, lists.items,
        COALESCE((
          SELECT SUM(transactions.amount)
          FROM record_links
          JOIN transactions ON transactions.id = CASE
            WHEN record_links.source_type = 'transaction' THEN record_links.source_id
            ELSE record_links.target_id
          END
          WHERE ((record_links.source_type = 'budget' AND record_links.source_id = lists.id
                  AND record_links.target_type = 'transaction')
              OR (record_links.target_type = 'budget' AND record_links.target_id = lists.id
                  AND record_links.source_type = 'transaction'))
            AND transactions.kind = 'expense'
        ), 0) AS actual
       FROM lists WHERE budget_enabled = 1 AND finalized = 0 ORDER BY title COLLATE NOCASE`,
    ),
    getAccounts(database),
    database.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE kind = 'income' AND loan_id IS NULL AND refund_of_transaction_id IS NULL
         AND substr(date, 1, 7) = ?`,
      month,
    ),
    getReminders(database, 'pending'),
    getRecentActivity(database, 8),
    database.getAllAsync<{
      id: number;
      lender: string;
      due_date: string;
      principal: number;
      fees: number;
      repaid: number;
    }>(
      `SELECT loans.id, loans.lender, loans.due_date, loans.principal, loans.fees,
         COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0) AS repaid
       FROM loans LEFT JOIN transactions ON transactions.loan_id = loans.id
       GROUP BY loans.id
       HAVING loans.principal + loans.fees >
         COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0)
       ORDER BY loans.due_date LIMIT 6`,
    ),
    database.getFirstAsync<{ completed: number; remaining: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE completed = 1 AND date(completed_at) >= date(?, '-6 days')) AS completed,
         (SELECT COUNT(*) FROM tasks WHERE completed = 0) AS remaining`,
      today,
    ),
    database.getAllAsync<{ id: number; title: string; tasks: number }>(
      `SELECT events.id, events.title, COUNT(tasks.id) AS tasks
       FROM events
       JOIN record_links ON
         ((record_links.source_type = 'event' AND record_links.source_id = events.id
            AND record_links.target_type = 'task')
          OR (record_links.target_type = 'event' AND record_links.target_id = events.id
            AND record_links.source_type = 'task'))
       JOIN tasks ON tasks.id = CASE
         WHEN record_links.source_type = 'task' THEN record_links.source_id
         ELSE record_links.target_id
       END
       WHERE events.date >= ? AND tasks.completed = 0
       GROUP BY events.id, events.title ORDER BY events.date LIMIT 6`,
      today,
    ),
  ]);

  return {
    transactions,
    tasks,
    events,
    notes,
    spent: spent?.total ?? 0,
    budgetLists,
    accounts,
    income: income?.total ?? 0,
    reminders,
    activities,
    loans,
    completedThisWeek: taskCounts?.completed ?? 0,
    remainingTasks: taskCounts?.remaining ?? 0,
    eventPreparation,
  };
}
