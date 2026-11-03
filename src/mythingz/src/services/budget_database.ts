import type { BrowserDatabase } from '../web/database';
import {
  currentTimestamp,
  type BudgetAlert,
  type BudgetPeriod,
  type BudgetPeriodItem,
  type BudgetRecurrence,
  type BudgetRollover,
  type BudgetSummary,
  type BudgetTemplate,
  type BudgetTemplateItem,
  type BudgetTemplateItemRow,
  type Transaction,
} from './database_types';

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const today = () => localDateKey();

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
  const timestamp = currentTimestamp();
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
    currentTimestamp(),
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
  const timestamp = currentTimestamp();
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

// Fetch budget-period totals for history and period comparisons.
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

// Fetch expense transactions that still have unallocated value.
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
        currentTimestamp(),
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
        currentTimestamp(),
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
  const timestamp = currentTimestamp();
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

    const createdAt = currentTimestamp();
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
      currentTimestamp(),
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
      currentTimestamp(),
      periodId,
    );
    if (!result.changes) throw new Error('This budget period is already closed or cannot be closed.');
    await database.runAsync(
      'INSERT INTO budget_period_closures (period_id, action, note, created_at) VALUES (?, ?, ?, ?)',
      periodId,
      'closed',
      note.trim(),
      currentTimestamp(),
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
      currentTimestamp(),
    );
    if (nextPeriod) {
      await database.runAsync(
        'UPDATE budget_period_items SET rollover_amount = 0, saved_amount = 0 WHERE period_id = ?',
        nextPeriod.id,
      );
    }
  });
}
