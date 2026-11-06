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
  type SharedBudget,
  type SharedBudgetItem,
  type Transaction,
} from './database_types';

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const today = () => localDateKey();

export type NormalBudgetDraft = {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  items: { name: string; allocatedAmount: number }[];
};

function validateNormalBudget(draft: NormalBudgetDraft) {
  if (!draft.name.trim()) throw new Error('Enter a name for this budget.');
  dateFromKey(draft.startDate);
  dateFromKey(draft.endDate);
  if (draft.endDate < draft.startDate) throw new Error('The end date must be on or after the start date.');
  if (!draft.items.length) throw new Error('Add at least one budget item.');
  for (const item of draft.items) {
    if (!item.name.trim()) throw new Error('Every budget item needs a name.');
    if (!Number.isSafeInteger(item.allocatedAmount) || item.allocatedAmount < 0) {
      throw new Error('Budget allocations must be whole, non-negative amounts.');
    }
  }
}

export async function createNormalBudget(database: BrowserDatabase, draft: NormalBudgetDraft) {
  validateNormalBudget(draft);
  const timestamp = currentTimestamp();
  const totalAllocated = draft.items.reduce((sum, item) => sum + item.allocatedAmount, 0);
  if (!Number.isSafeInteger(totalAllocated)) throw new Error('The total budget allocation is too large.');
  const status = draft.startDate > today()
    ? 'upcoming'
    : draft.endDate < today() ? 'awaiting_review' : 'active';
  let budgetId = 0;
  await database.withTransactionAsync(async () => {
    const result = await database.runAsync(
      `INSERT INTO budgets
        (name, type, start_date, end_date, total_allocated, status, description, created_at, updated_at)
       VALUES (?, 'normal', ?, ?, ?, ?, ?, ?, ?)`,
      draft.name.trim(),
      draft.startDate,
      draft.endDate,
      totalAllocated,
      status,
      draft.description?.trim() ?? '',
      timestamp,
      timestamp,
    );
    budgetId = result.lastInsertRowId;
    for (const [position, item] of draft.items.entries()) {
      await database.runAsync(
        `INSERT INTO budget_items
          (budget_id, name, allocated_amount, original_amount, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        budgetId,
        item.name.trim(),
        item.allocatedAmount,
        item.allocatedAmount,
        position,
        timestamp,
        timestamp,
      );
    }
  });
  if (!budgetId) throw new Error('The budget could not be created.');
  return budgetId;
}

export type SharedBudgetFilter = {
  type?: 'normal' | 'recurring';
  startDate?: string;
  endDate?: string;
};

export async function getSharedBudgets(
  database: BrowserDatabase,
  type?: 'normal' | 'recurring',
  dateRange: Pick<SharedBudgetFilter, 'startDate' | 'endDate'> = {},
) {
  if (dateRange.startDate) dateFromKey(dateRange.startDate);
  if (dateRange.endDate) dateFromKey(dateRange.endDate);
  if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) {
    throw new Error('The analysis start date must be on or before its end date.');
  }
  const budgets = await database.getAllAsync<SharedBudget>(
    `SELECT budgets.*,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.budget_id = budgets.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
           AND transactions.refund_of_transaction_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount)
         FROM budget_item_refund_allocations refunds
         JOIN budget_items items ON items.id = refunds.budget_item_id
         WHERE items.budget_id = budgets.id), 0) AS actual_amount,
       budgets.total_allocated - (
         COALESCE((SELECT SUM(allocations.amount)
           FROM transaction_allocations allocations
           JOIN transactions ON transactions.id = allocations.transaction_id
           WHERE allocations.budget_id = budgets.id AND transactions.kind = 'expense'
             AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
             AND transactions.refund_of_transaction_id IS NULL), 0)
         - COALESCE((SELECT SUM(refunds.amount)
           FROM budget_item_refund_allocations refunds
           JOIN budget_items items ON items.id = refunds.budget_item_id
           WHERE items.budget_id = budgets.id), 0)
       ) AS remaining_amount
     FROM budgets
     WHERE (? IS NULL OR budgets.type = ?)
       AND (? IS NULL OR (budgets.end_date IS NOT NULL AND budgets.end_date >= ?))
       AND (? IS NULL OR (budgets.start_date IS NOT NULL AND budgets.start_date <= ?))
     ORDER BY CASE budgets.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'awaiting_review' THEN 2 ELSE 3 END,
       start_date DESC, id DESC`,
    type ?? null,
    type ?? null,
    dateRange.startDate ?? null,
    dateRange.startDate ?? null,
    dateRange.endDate ?? null,
    dateRange.endDate ?? null,
  );
  return budgets;
}

export async function getSharedBudgetItems(database: BrowserDatabase, budgetId: number) {
  return database.getAllAsync<SharedBudgetItem>(
    `SELECT items.*,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.budget_item_id = items.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
           AND transactions.refund_of_transaction_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
         WHERE refunds.budget_item_id = items.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
         WHERE refunds.budget_item_id = items.id), 0) AS refunded_amount,
       items.allocated_amount - (
         COALESCE((SELECT SUM(allocations.amount)
           FROM transaction_allocations allocations
           JOIN transactions ON transactions.id = allocations.transaction_id
           WHERE allocations.budget_item_id = items.id AND transactions.kind = 'expense'
             AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
             AND transactions.refund_of_transaction_id IS NULL), 0)
         - COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
           WHERE refunds.budget_item_id = items.id), 0)
       ) AS remaining_amount
     FROM budget_items items WHERE items.budget_id = ? ORDER BY items.position, items.id`,
    budgetId,
  );
}

export async function adjustSharedBudgetItem(
  database: BrowserDatabase,
  budgetItemId: number,
  newAmount: number,
  reason = '',
  confirmBelowActual = false,
) {
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) {
    throw new Error('Budget amounts must be whole, non-negative numbers.');
  }
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{
      allocated_amount: number;
      actual_amount: number;
      budget_id: number;
      status: string;
      type: string;
    }>(
      `SELECT items.allocated_amount, budgets.id AS budget_id, budgets.status, budgets.type,
         COALESCE((SELECT SUM(allocations.amount)
           FROM transaction_allocations allocations
           JOIN transactions ON transactions.id = allocations.transaction_id
           WHERE allocations.budget_item_id = items.id AND transactions.kind = 'expense'
             AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
             AND transactions.refund_of_transaction_id IS NULL), 0)
         - COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
           WHERE refunds.budget_item_id = items.id), 0) AS actual_amount
       FROM budget_items items JOIN budgets ON budgets.id = items.budget_id
       WHERE items.id = ?`,
      budgetItemId,
    );
    if (!item || item.type !== 'normal') throw new Error('This normal budget item no longer exists.');
    if (item.status === 'closed' || item.status === 'cancelled') {
      throw new Error('Reopen the budget before adjusting its allocation.');
    }
    if (newAmount < item.actual_amount && !confirmBelowActual) {
      throw new Error('The new allocation is below current spending. Confirm the reduction to continue.');
    }
    const timestamp = currentTimestamp();
    await database.runAsync(
      `INSERT INTO budget_item_adjustments
        (budget_item_id, previous_amount, new_amount, difference, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      budgetItemId,
      item.allocated_amount,
      newAmount,
      newAmount - item.allocated_amount,
      reason.trim(),
      timestamp,
    );
    await database.runAsync(
      'UPDATE budget_items SET allocated_amount = ?, updated_at = ? WHERE id = ?',
      newAmount,
      timestamp,
      budgetItemId,
    );
  });
}

export async function setSharedBudgetClosed(
  database: BrowserDatabase,
  budgetId: number,
  closed: boolean,
  note = '',
) {
  await database.withTransactionAsync(async () => {
    const budget = await database.getFirstAsync<{
      type: string;
      start_date: string | null;
      end_date: string | null;
      status: string;
    }>('SELECT type, start_date, end_date, status FROM budgets WHERE id = ?', budgetId);
    if (!budget || budget.type !== 'normal') throw new Error('This normal budget no longer exists.');
    if (closed && budget.status === 'closed') throw new Error('This budget is already closed.');
    if (!closed && budget.status !== 'closed') throw new Error('This budget is not closed.');
    const timestamp = currentTimestamp();
    const status = closed
      ? 'closed'
      : budget.start_date && budget.start_date > today()
        ? 'upcoming'
        : budget.end_date && budget.end_date < today() ? 'awaiting_review' : 'active';
    await database.runAsync(
      'UPDATE budgets SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?',
      status,
      closed ? timestamp : null,
      timestamp,
      budgetId,
    );
    await database.runAsync(
      'INSERT INTO budget_closures (budget_id, action, note, created_at) VALUES (?, ?, ?, ?)',
      budgetId,
      closed ? 'closed' : 'reopened',
      note.trim(),
      timestamp,
    );
  });
}

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
        '',
        item.allocated_amount,
        item.rollover,
        JSON.stringify(item.alert_thresholds),
        Number(item.active),
        position,
      ];
      if (item.id !== undefined) {
        const updated = await database.runAsync(
          `UPDATE budget_template_items
           SET name = ?, description = ?, allocated_amount = ?, rollover = ?,
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
            (template_id, name, description, allocated_amount, rollover, alert_thresholds, active, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
               SET name = ?, description = ?, original_amount = ?,
                 rollover = ?, alert_thresholds = ?
             WHERE period_id = ? AND template_item_id = ?`,
            item.name,
            item.description,
            item.allocated_amount,
            item.rollover,
            item.alert_thresholds,
            period.id,
            item.id,
          );
          if (!updated.changes) {
            await database.runAsync(
              `INSERT OR IGNORE INTO budget_period_items
                (period_id, template_item_id, name, description, original_amount,
                 rollover, alert_thresholds)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              period.id,
              item.id,
              item.name,
              item.description,
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

async function reconcileBudgetPeriodRollover(database: BrowserDatabase, periodId: number) {
  const period = await database.getFirstAsync<{
    template_id: number;
    end_date: string;
    status: string;
  }>('SELECT template_id, end_date, status FROM budget_periods WHERE id = ?', periodId);
  if (!period) return;

  const nextPeriod = await database.getFirstAsync<{ id: number; status: string }>(
    `SELECT id, status FROM budget_periods
     WHERE template_id = ? AND start_date = ? AND status != 'cancelled'
     ORDER BY id LIMIT 1`,
    period.template_id,
    addCalendarDays(period.end_date, 1),
  );
  if (!nextPeriod || nextPeriod.status === 'closed') return;

  const shouldRollover = period.status === 'closed' || period.end_date < today();
  const currentItems = await database.getAllAsync<{
    id: number;
    template_item_id: number | null;
    rollover: BudgetRollover;
    original_amount: number;
    rollover_amount: number;
  }>('SELECT * FROM budget_period_items WHERE period_id = ?', periodId);

  for (const current of currentItems) {
    if (current.template_item_id === null) continue;
    const nextItem = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM budget_period_items WHERE period_id = ? AND template_item_id = ?',
      nextPeriod.id,
      current.template_item_id,
    );
    if (!nextItem) continue;

    let unspent = 0;
    if (shouldRollover) {
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
      unspent = Math.max(0, (finalAmount?.amount ?? 0) - (actual?.amount ?? 0));
    }

    await database.runAsync(
      `UPDATE budget_period_items SET rollover_amount = ?, saved_amount = ?
       WHERE id = ?`,
      shouldRollover && current.rollover === 'carry' ? unspent : 0,
      shouldRollover && current.rollover === 'save' ? unspent : 0,
      nextItem.id,
    );
  }
}

async function reconcileEndedBudgetPeriodRollovers(database: BrowserDatabase) {
  const periods = await database.getAllAsync<{ id: number }>(
    `SELECT id FROM budget_periods
     WHERE status = 'closed' OR end_date < ?
     ORDER BY template_id, end_date, id`,
    today(),
  );
  for (const period of periods) {
    await reconcileBudgetPeriodRollover(database, period.id);
  }
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
          for (const item of items) {
            await database.runAsync(
              `INSERT OR IGNORE INTO budget_period_items
                (period_id, template_item_id, name, description, original_amount,
                 rollover_amount, saved_amount, rollover, alert_thresholds)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              period.id,
              item.id,
              item.name,
              item.description,
              item.allocated_amount,
              0,
              0,
              item.rollover,
              item.alert_thresholds,
            );
          }
        }
        periodStart = nextStart;
      }
    }
    await reconcileEndedBudgetPeriodRollovers(database);
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
    `SELECT budgets.legacy_period_id AS id, budgets.template_id,
       templates.name AS template_name, templates.recurrence, budgets.start_date, budgets.end_date,
       budgets.status, budgets.created_at, budgets.closed_at, budgets.total_allocated AS allocated_amount,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.budget_id = budgets.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
           AND transactions.refund_of_transaction_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount)
         FROM budget_item_refund_allocations refunds
         JOIN budget_items items ON items.id = refunds.budget_item_id
         WHERE items.budget_id = budgets.id), 0) AS actual_amount,
       budgets.total_allocated - (
         COALESCE((SELECT SUM(allocations.amount)
           FROM transaction_allocations allocations
           JOIN transactions ON transactions.id = allocations.transaction_id
           WHERE allocations.budget_id = budgets.id AND transactions.kind = 'expense'
             AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
             AND transactions.refund_of_transaction_id IS NULL), 0)
         - COALESCE((SELECT SUM(refunds.amount)
           FROM budget_item_refund_allocations refunds
           JOIN budget_items items ON items.id = refunds.budget_item_id
           WHERE items.budget_id = budgets.id), 0)
       ) AS remaining_amount
     FROM budgets JOIN budget_templates templates ON templates.id = budgets.template_id
     WHERE budgets.type = 'recurring'
     ORDER BY budgets.start_date DESC, budgets.id DESC`,
  );
}

// Fetch expense transactions that still have unallocated value.
export async function getUnallocatedExpenses(
  database: BrowserDatabase,
  dateRange: Pick<SharedBudgetFilter, 'startDate' | 'endDate'> = {},
) {
  if (dateRange.startDate) dateFromKey(dateRange.startDate);
  if (dateRange.endDate) dateFromKey(dateRange.endDate);
  if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) {
    throw new Error('The analysis start date must be on or before its end date.');
  }
  return database.getAllAsync<Transaction & { unallocated_amount: number }>(
    `SELECT transactions.*,
       transactions.amount - COALESCE(SUM(allocations.amount), 0) AS unallocated_amount
     FROM transactions
     LEFT JOIN transaction_allocations allocations ON allocations.transaction_id = transactions.id
     WHERE transactions.kind = 'expense' AND transactions.loan_id IS NULL
       AND transactions.transfer_id IS NULL AND transactions.refund_of_transaction_id IS NULL
       AND (? IS NULL OR transactions.date >= ?)
       AND (? IS NULL OR transactions.date <= ?)
     GROUP BY transactions.id
     HAVING unallocated_amount > 0
     ORDER BY transactions.date DESC, transactions.id DESC`,
    dateRange.startDate ?? null,
    dateRange.startDate ?? null,
    dateRange.endDate ?? null,
    dateRange.endDate ?? null,
  );
}

export async function getSharedBudgetAnalysis(database: BrowserDatabase, filter: SharedBudgetFilter = {}) {
  const budgets = await getSharedBudgets(database, filter.type, filter);
  const itemGroups = await Promise.all(budgets.map(async (budget) => ({
    budget,
    items: await getSharedBudgetItems(database, budget.id),
  })));
  const comparisons = itemGroups.flatMap(({ budget, items }) => items.map((item) => ({
    budget_name: budget.name,
    budget_type: budget.type,
    start_date: budget.start_date,
    end_date: budget.end_date,
    ...item,
    utilization_percent: item.allocated_amount > 0
      ? item.actual_amount / item.allocated_amount * 100
      : item.actual_amount > 0 ? 100 : 0,
  })));
  const unallocatedExpenses = await getUnallocatedExpenses(database, filter);
  const allocated = comparisons.reduce((sum, item) => sum + item.allocated_amount, 0);
  const actual = comparisons.reduce((sum, item) => sum + item.actual_amount, 0);
  const refunded = itemGroups.flatMap(({ items }) => items)
    .reduce((sum, item) => sum + item.refunded_amount, 0);
  return {
    budgets,
    comparisons,
    overBudgetItems: comparisons.filter((item) => item.actual_amount > item.allocated_amount),
    underutilizedItems: comparisons.filter((item) =>
      item.allocated_amount > 0 && item.actual_amount / item.allocated_amount < 0.5,
    ),
    totalAllocated: allocated,
    actualSpending: actual,
    totalRefunds: refunded,
    totalRemaining: allocated - actual,
    utilizationPercent: allocated > 0 ? actual / allocated * 100 : 0,
    unallocatedExpenses,
    unallocatedAmount: unallocatedExpenses.reduce((sum, expense) => sum + expense.unallocated_amount, 0),
  };
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
  return getBudgetItemsForExpenseDate(database, date);
}

function budgetCoversDate(
  type: string,
  startDate: string | null,
  endDate: string | null,
  date: string,
) {
  if (type === 'normal') {
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  }
  if (type !== 'recurring' || !startDate || !endDate) return false;
  return date >= startDate && date <= endDate;
}

export async function getBudgetItemsForExpenseDate(database: BrowserDatabase, date: string) {
  await generateBudgetPeriods(database);
  return database.getAllAsync<BudgetPeriodItem & {
    budget_id: number;
    period_item_id: number | null;
    budget_type: 'normal' | 'recurring';
    template_name: string;
    start_date: string | null;
    end_date: string | null;
    period_status: string;
  }>(
    `SELECT items.id, budgets.id AS period_id, itemMap.period_item_id,
       items.template_item_id, items.name,
       items.description, items.original_amount, items.rollover_amount,
       items.saved_amount, items.rollover, items.alert_thresholds,
       items.allocated_amount AS final_amount, budgets.id AS budget_id, budgets.type AS budget_type,
       budgets.name AS template_name, budgets.start_date, budgets.end_date,
       budgets.status AS period_status,
       COALESCE((SELECT SUM(allocations.amount)
         FROM transaction_allocations allocations
         JOIN transactions ON transactions.id = allocations.transaction_id
         WHERE allocations.budget_item_id = items.id AND transactions.kind = 'expense'
           AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
           AND transactions.refund_of_transaction_id IS NULL), 0)
       - COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
         WHERE refunds.budget_item_id = items.id), 0) AS actual_amount,
       COALESCE((SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
         WHERE refunds.budget_item_id = items.id), 0) AS refunded_amount
     FROM budget_items items JOIN budgets ON budgets.id = items.budget_id
     LEFT JOIN legacy_budget_item_map itemMap ON itemMap.budget_item_id = items.id
     WHERE budgets.status IN ('active', 'awaiting_review')
       AND (
         (budgets.type = 'normal'
           AND (budgets.start_date IS NULL OR budgets.start_date <= ?)
           AND (budgets.end_date IS NULL OR budgets.end_date >= ?))
         OR (budgets.type = 'recurring'
           AND budgets.start_date <= ? AND budgets.end_date >= ?)
       )
     ORDER BY budgets.name COLLATE NOCASE, items.position, items.id`,
    date,
    date,
    date,
    date,
  );
}

export async function getTransactionBudgetAllocations(
  database: BrowserDatabase,
  transactionId: number,
) {
  return database.getAllAsync<{
    period_item_id: number | null;
    budget_item_id: number;
    budget_id: number;
    amount: number;
    item_name: string;
    template_name: string;
    period_status: string;
    budget_type: 'normal' | 'recurring';
  }>(
    `SELECT allocations.period_item_id, allocations.budget_item_id, allocations.budget_id,
       allocations.amount, items.name AS item_name, budgets.name AS template_name,
       budgets.status AS period_status, budgets.type AS budget_type
     FROM transaction_allocations allocations
     JOIN budget_items items ON items.id = allocations.budget_item_id
     JOIN budgets ON budgets.id = allocations.budget_id
     WHERE allocations.transaction_id = ?
     ORDER BY budgets.name COLLATE NOCASE, items.name COLLATE NOCASE`,
    transactionId,
  );
}

export async function saveTransactionBudgetAllocations(
  database: BrowserDatabase,
  transactionId: number,
  allocations: { budgetItemId: number; amount: number }[],
) {
  if (allocations.some((allocation) =>
    !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
    || !Number.isSafeInteger(allocation.budgetItemId) || allocation.budgetItemId < 1
  )) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.budgetItemId)).size !== allocations.length) {
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
      `SELECT budgets.id
       FROM transaction_allocations allocations
       JOIN budgets ON budgets.id = allocations.budget_id
       WHERE allocations.transaction_id = ? AND budgets.status = 'closed'
       LIMIT 1`,
      transactionId,
    );
    if (closedAllocation) {
      throw new Error('Reopen the closed budget period before changing allocations so its history is corrected intentionally.');
    }
    for (const allocation of allocations) {
      const budgetItem = await database.getFirstAsync<{
        id: number;
        status: string;
        type: string;
        start_date: string | null;
        end_date: string | null;
        budget_id: number;
      }>(
        `SELECT items.id, budgets.status, budgets.type, budgets.start_date, budgets.end_date,
           budgets.id AS budget_id
         FROM budget_items items JOIN budgets ON budgets.id = items.budget_id
         WHERE items.id = ?`,
        allocation.budgetItemId,
      );
      if (!budgetItem
        || !['active', 'awaiting_review'].includes(budgetItem.status)
        || !budgetCoversDate(
          budgetItem.type,
          budgetItem.start_date,
          budgetItem.end_date,
          transaction.date,
        )) {
        throw new Error('Choose an open budget item covering the expense date.');
      }
    }
    const refunded = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM transaction_refunds WHERE original_transaction_id = ? LIMIT 1',
      transactionId,
    );
    if (refunded) throw new Error('Expense allocations cannot be changed after a refund has been recorded.');
    await database.runAsync('DELETE FROM transaction_allocations WHERE transaction_id = ?', transactionId);
    for (const allocation of allocations) {
      const budgetItem = await database.getFirstAsync<{ budget_id: number; period_item_id: number | null }>(
        `SELECT items.budget_id, itemMap.period_item_id
         FROM budget_items items LEFT JOIN legacy_budget_item_map itemMap
           ON itemMap.budget_item_id = items.id
         WHERE items.id = ?`,
        allocation.budgetItemId,
      );
      if (!budgetItem) throw new Error('This budget item no longer exists.');
      await database.runAsync(
        `INSERT INTO transaction_allocations
          (transaction_id, budget_id, budget_item_id, period_item_id, amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        transactionId,
        budgetItem.budget_id,
        allocation.budgetItemId,
        budgetItem.period_item_id,
        allocation.amount,
        currentTimestamp(),
      );
      if (budgetItem.period_item_id !== null) {
        await updateBudgetThresholdAlerts(database, budgetItem.period_item_id);
      }
      await updateSharedBudgetThresholdAlerts(database, allocation.budgetItemId);
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

async function updateSharedBudgetThresholdAlerts(database: BrowserDatabase, budgetItemId: number) {
  const item = await database.getFirstAsync<{ allocated_amount: number; alert_thresholds: string }>(
    'SELECT allocated_amount, alert_thresholds FROM budget_items WHERE id = ?',
    budgetItemId,
  );
  if (!item || item.allocated_amount <= 0) return;
  const actual = await database.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE(SUM(allocations.amount), 0) - COALESCE((
       SELECT SUM(refunds.amount) FROM budget_item_refund_allocations refunds
       WHERE refunds.budget_item_id = ?
     ), 0) AS amount
     FROM transaction_allocations allocations
     JOIN transactions ON transactions.id = allocations.transaction_id
     WHERE allocations.budget_item_id = ? AND transactions.kind = 'expense'
       AND transactions.loan_id IS NULL AND transactions.transfer_id IS NULL
       AND transactions.refund_of_transaction_id IS NULL`,
    budgetItemId,
    budgetItemId,
  );
  const percentage = (actual?.amount ?? 0) / item.allocated_amount * 100;
  const thresholds = JSON.parse(item.alert_thresholds) as number[];
  const mapping = await database.getFirstAsync<{ period_item_id: number | null }>(
    'SELECT period_item_id FROM legacy_budget_item_map WHERE budget_item_id = ?',
    budgetItemId,
  );
  for (const threshold of thresholds) {
    if (percentage >= threshold) {
      await database.runAsync(
        'INSERT OR IGNORE INTO budget_item_alerts (budget_item_id, threshold, created_at) VALUES (?, ?, ?)',
        budgetItemId,
        threshold,
        currentTimestamp(),
      );
      if (mapping?.period_item_id !== null && mapping?.period_item_id !== undefined) {
        await database.runAsync(
          'INSERT OR IGNORE INTO budget_alerts (period_item_id, threshold, created_at) VALUES (?, ?, ?)',
          mapping.period_item_id,
          threshold,
          currentTimestamp(),
        );
      }
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
  allocations: { budgetItemId: number; amount: number }[],
  transactionAmount: number,
) {
  if (!allocations.length) return;
  if (!Number.isSafeInteger(transactionAmount) || transactionAmount <= 0) {
    throw new Error('Budget allocations require a whole-number transaction amount.');
  }
  if (allocations.some((allocation) =>
    !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
    || !Number.isSafeInteger(allocation.budgetItemId) || allocation.budgetItemId < 1
  )) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.budgetItemId)).size !== allocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }
  if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > transactionAmount) {
    throw new Error('Budget item allocations cannot exceed the expense total.');
  }
  const transaction = await database.getFirstAsync<{
    kind: string;
    date: string;
    amount: number;
    loan_id: number | null;
    transfer_id: number | null;
    refund_of_transaction_id: number | null;
  }>(
    'SELECT kind, date, amount, loan_id, transfer_id, refund_of_transaction_id FROM transactions WHERE id = ?',
    transactionId,
  );
  if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
    || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) {
    throw new Error('Only regular expense transactions can be allocated to budgets.');
  }
  if (transaction.amount !== transactionAmount) throw new Error('The expense amount changed before allocation.');
  const timestamp = currentTimestamp();
  for (const allocation of allocations) {
    const budgetItem = await database.getFirstAsync<{
      budget_id: number;
      status: string;
      type: string;
      start_date: string | null;
      end_date: string | null;
      period_item_id: number | null;
    }>(
      `SELECT budgets.id AS budget_id, budgets.status, budgets.type, budgets.start_date,
         budgets.end_date, itemMap.period_item_id
       FROM budget_items items JOIN budgets ON budgets.id = items.budget_id
       LEFT JOIN legacy_budget_item_map itemMap ON itemMap.budget_item_id = items.id
       WHERE items.id = ?`,
      allocation.budgetItemId,
    );
    if (!budgetItem || !['active', 'awaiting_review'].includes(budgetItem.status)
      || !budgetCoversDate(
        budgetItem.type,
        budgetItem.start_date,
        budgetItem.end_date,
        transaction.date,
      )) {
      throw new Error('Choose an active budget item covering the expense date.');
    }
    await database.runAsync(
      `INSERT INTO transaction_allocations
        (transaction_id, budget_id, budget_item_id, period_item_id, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      transactionId,
      budgetItem.budget_id,
      allocation.budgetItemId,
      budgetItem.period_item_id,
      allocation.amount,
      timestamp,
    );
    if (budgetItem.period_item_id !== null) {
      await updateBudgetThresholdAlerts(database, budgetItem.period_item_id);
    }
    await updateSharedBudgetThresholdAlerts(database, allocation.budgetItemId);
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
      budget_item_id: number;
      period_item_id: number | null;
      amount: number;
      refunded_amount: number;
      period_status: string;
    }>(
      `SELECT allocations.budget_item_id, allocations.period_item_id, allocations.amount,
         budgets.status AS period_status,
         COALESCE((SELECT SUM(refund_allocations.amount)
           FROM budget_item_refund_allocations refund_allocations
           JOIN transaction_refunds refunds ON refunds.id = refund_allocations.refund_id
           WHERE refund_allocations.budget_item_id = allocations.budget_item_id
             AND refunds.original_transaction_id = allocations.transaction_id), 0) AS refunded_amount
       FROM transaction_allocations allocations
       JOIN budgets ON budgets.id = allocations.budget_id
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
      budgetItemId: allocation.budget_item_id,
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
        left.remainder === right.remainder ? left.budgetItemId - right.budgetItemId
          : left.remainder > right.remainder ? -1 : 1,
      );
      for (let index = 0; index < portions.length && remainder > 0; index += 1) {
        portions[index].amount += 1;
        remainder -= 1;
      }
      for (const portion of portions) {
        if (portion.amount <= 0) continue;
        if (portion.periodItemId !== null) {
          await database.runAsync(
            'INSERT INTO budget_refund_allocations (refund_id, period_item_id, amount) VALUES (?, ?, ?)',
            refund.lastInsertRowId,
            portion.periodItemId,
            portion.amount,
          );
        } else {
          await database.runAsync(
            'INSERT INTO budget_item_refund_allocations (refund_id, budget_item_id, amount) VALUES (?, ?, ?)',
            refund.lastInsertRowId,
            portion.budgetItemId,
            portion.amount,
          );
        }
        if (portion.periodItemId !== null) await updateBudgetThresholdAlerts(database, portion.periodItemId);
        await updateSharedBudgetThresholdAlerts(database, portion.budgetItemId);
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
  const periodToClose = await database.getFirstAsync<{ template_id: number; end_date: string }>(
    'SELECT template_id, end_date FROM budget_periods WHERE id = ?',
    periodId,
  );
  if (!periodToClose) throw new Error('This budget period no longer exists.');
  const nextStartDate = addCalendarDays(periodToClose.end_date, 1);
  const template = await database.getFirstAsync<{
    active: number;
    archived: number;
    end_date: string | null;
  }>(
    'SELECT active, archived, end_date FROM budget_templates WHERE id = ?',
    periodToClose.template_id,
  );
  if (template?.active && !template.archived
    && (!template.end_date || nextStartDate <= template.end_date)) {
    await generateBudgetPeriods(database, nextStartDate);
  }

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
    await reconcileBudgetPeriodRollover(database, periodId);
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
    await reconcileBudgetPeriodRollover(database, periodId);
  });
}
