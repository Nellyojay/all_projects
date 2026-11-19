import {
  currentTimestamp,
  type BudgetAlert,
  type BudgetPeriod,
  type BudgetPeriodItem,
  type BudgetRecurrence,
  type BudgetSummary,
  type BudgetTemplate,
  type BudgetTemplateItem,
  type SharedBudget,
  type SharedBudgetItem,
  type Transaction,
} from './database_types';
import { budgetsApi } from '../../../api/budgets.api';
import { transactionsApi } from '../../../api/finance.api';

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

export type SharedBudgetFilter = {
  type?: 'normal' | 'recurring';
  startDate?: string;
  endDate?: string;
};

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

export function budgetCoversDate(
  type: string,
  startDate: string | null,
  endDate: string | null,
  date: string,
) {
  if (type === 'normal') return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  if (type !== 'recurring' || !startDate || !endDate) return false;
  return date >= startDate && date <= endDate;
}

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

export async function getRefundableAmount(transactionId: number) {
  const [transactions, refunds] = await Promise.all([
    transactionsApi.list(),
    budgetsApi.transactionRefunds.list(),
  ]);
  const transaction = transactions.find((row) => row.id === transactionId);
  if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
    || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) return 0;
  const refunded = refunds
    .filter((refund) => refund.original_transaction_id === transactionId)
    .reduce((sum, refund) => sum + refund.amount, 0);
  return Math.max(0, transaction.amount - refunded);
}

export async function saveBudgetRefund(
  originalTransactionId: number,
  amount: number,
  notes = '',
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Enter a refund amount as a positive whole number.');
  }
  const [transactions, refunds, allocations, budgets] = await Promise.all([
    transactionsApi.list(),
    budgetsApi.transactionRefunds.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgets.list(),
  ]);
  const original = transactions.find((row) => row.id === originalTransactionId);
  if (!original || original.kind !== 'expense' || original.loan_id !== null
    || original.transfer_id !== null || original.refund_of_transaction_id !== null
    || original.account_id === null) {
    throw new Error('Only a regular account expense can receive a refund.');
  }
  const refunded = refunds
    .filter((refund) => refund.original_transaction_id === originalTransactionId)
    .reduce((sum, refund) => sum + refund.amount, 0);
  if (amount > original.amount - refunded) {
    throw new Error('The refund exceeds the remaining refundable amount.');
  }
  const originalAllocations = allocations.filter((allocation) => allocation.transaction_id === originalTransactionId);
  if (originalAllocations.some((allocation) =>
    budgets.find((budget) => budget.id === allocation.budget_id)?.status === 'closed')) {
    throw new Error('Reopen the closed budget period before allocating this refund so its history is corrected intentionally.');
  }
  const refundTransaction = await transactionsApi.create({
    kind: 'income',
    title: `Refund · ${original.title}`,
    category: 'Refund',
    amount,
    date: today(),
    notes: [`Refund for transaction #${originalTransactionId}`, notes.trim()].filter(Boolean).join('\n\n'),
    account_id: original.account_id,
    refund_of_transaction_id: originalTransactionId,
  });
  const refund = await budgetsApi.transactionRefunds.create({
    original_transaction_id: originalTransactionId,
    refund_transaction_id: refundTransaction.id,
    amount,
    created_at: currentTimestamp(),
  });
  const [periodRefundAllocations, itemRefundAllocations] = await Promise.all([
    budgetsApi.budgetRefundAllocations.list(),
    budgetsApi.itemRefundAllocations.list(),
  ]);
  const priorRefundIds = new Set(refunds
    .filter((refund) => refund.original_transaction_id === originalTransactionId)
    .map((refund) => refund.id));
  const capacities = originalAllocations.map((allocation) => {
    const previousAllocations = allocation.period_item_id === null
      ? itemRefundAllocations.filter((row) => row.budget_item_id === allocation.budget_item_id)
      : periodRefundAllocations.filter((row) => row.period_item_id === allocation.period_item_id);
    const previouslyRefunded = previousAllocations
      .filter((row) => priorRefundIds.has(row.refund_id))
      .reduce((sum, row) => sum + row.amount, 0);
    return {
      budgetItemId: allocation.budget_item_id,
      periodItemId: allocation.period_item_id,
      amount: Math.max(0, allocation.amount - previouslyRefunded),
    };
  }).filter((allocation) =>
    (allocation.periodItemId !== null || allocation.budgetItemId !== null)
    && allocation.amount > 0);
  const totalAllocated = capacities.reduce((sum, allocation) => sum + allocation.amount, 0);
  let allocateTotal = Math.min(amount, totalAllocated);
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
      left.remainder === right.remainder
        ? (left.budgetItemId ?? 0) - (right.budgetItemId ?? 0)
        : left.remainder > right.remainder ? -1 : 1);
    for (let index = 0; index < portions.length && remainder > 0; index += 1) {
      portions[index].amount += 1;
      remainder -= 1;
    }
    for (const portion of portions) {
      if (portion.amount <= 0) continue;
      if (portion.periodItemId !== null) {
        await budgetsApi.budgetRefundAllocations.create({
          refund_id: refund.id,
          period_item_id: portion.periodItemId,
          amount: portion.amount,
        });
      } else if (portion.budgetItemId !== null) {
        await budgetsApi.itemRefundAllocations.create({
          refund_id: refund.id,
          budget_item_id: portion.budgetItemId,
          amount: portion.amount,
        });
      }
      if (portion.periodItemId !== null) await updateBudgetThresholdAlerts(portion.periodItemId);
      if (portion.budgetItemId !== null) await updateSharedBudgetThresholdAlerts(portion.budgetItemId);
    }
  }
  return refundTransaction.id;
}

export async function createNormalBudget(draft: NormalBudgetDraft) {
  validateNormalBudget(draft);
  const timestamp = currentTimestamp();
  const totalAllocated = draft.items.reduce((sum, item) => sum + item.allocatedAmount, 0);
  if (!Number.isSafeInteger(totalAllocated)) throw new Error('The total budget allocation is too large.');
  const status = draft.startDate > today()
    ? 'upcoming'
    : draft.endDate < today() ? 'awaiting_review' : 'active';
  const budget = await budgetsApi.budgets.create({
    name: draft.name.trim(),
    type: 'normal',
    start_date: draft.startDate,
    end_date: draft.endDate,
    total_allocated: totalAllocated,
    status,
    description: draft.description?.trim() ?? '',
    created_at: timestamp,
    updated_at: timestamp,
  });
  for (const [position, item] of draft.items.entries()) {
    await budgetsApi.budgetItems.create({
      budget_id: budget.id,
      name: item.name.trim(),
      allocated_amount: item.allocatedAmount,
      original_amount: item.allocatedAmount,
      rollover_amount: 0,
      saved_amount: 0,
      rollover: 'reset',
      alert_thresholds: [],
      description: '',
      metadata_json: {},
      position,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }
  return budget.id;
}

async function actualTotals() {
  const [transactions, allocations, refunds] = await Promise.all([
    transactionsApi.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.itemRefundAllocations.list(),
  ]);
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const budgetItemActual = new Map<number, number>();
  for (const allocation of allocations) {
    const transaction = transactionById.get(allocation.transaction_id);
    if (allocation.budget_item_id === null
      || !transaction
      || transaction.kind !== 'expense'
      || transaction.loan_id !== null
      || transaction.transfer_id !== null
      || transaction.refund_of_transaction_id !== null) continue;
    budgetItemActual.set(allocation.budget_item_id,
      (budgetItemActual.get(allocation.budget_item_id) ?? 0) + allocation.amount);
  }
  for (const refund of refunds) {
    budgetItemActual.set(refund.budget_item_id,
      (budgetItemActual.get(refund.budget_item_id) ?? 0) - refund.amount);
  }
  return budgetItemActual;
}

export async function getSharedBudgets(
  type?: 'normal' | 'recurring',
  dateRange: Pick<SharedBudgetFilter, 'startDate' | 'endDate'> = {},
) {
  if (dateRange.startDate) dateFromKey(dateRange.startDate);
  if (dateRange.endDate) dateFromKey(dateRange.endDate);
  if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) {
    throw new Error('The analysis start date must be on or before its end date.');
  }
  const [budgets, items, actualTotalsByItem] = await Promise.all([
    budgetsApi.budgets.list(),
    budgetsApi.budgetItems.list(),
    actualTotals(),
  ]);
  const actualByBudget = new Map<number, number>();
  for (const item of items) {
    actualByBudget.set(item.budget_id,
      (actualByBudget.get(item.budget_id) ?? 0) + (actualTotalsByItem.get(item.id) ?? 0));
  }
  return budgets
    .filter((budget) => (!type || budget.type === type)
      && (!dateRange.startDate || (budget.end_date !== null && budget.end_date >= dateRange.startDate))
      && (!dateRange.endDate || (budget.start_date !== null && budget.start_date <= dateRange.endDate)))
    .sort((left, right) => {
      const rank = (status: string) => status === 'active' ? 0 : status === 'upcoming' ? 1 : status === 'awaiting_review' ? 2 : 3;
      return rank(left.status) - rank(right.status)
        || (right.start_date ?? '').localeCompare(left.start_date ?? '')
        || right.id - left.id;
    })
    .map((budget): SharedBudget => ({
      ...budget,
      actual_amount: actualByBudget.get(budget.id) ?? 0,
      remaining_amount: budget.total_allocated - (actualByBudget.get(budget.id) ?? 0),
    }));
}

export async function getSharedBudgetItems(budgetId: number) {
  const [items, actualTotalsByItem, refunds] = await Promise.all([
    budgetsApi.budgetItems.list(),
    actualTotals(),
    budgetsApi.itemRefundAllocations.list(),
  ]);
  return items
    .filter((item) => item.budget_id === budgetId)
    .sort((left, right) => left.position - right.position || left.id - right.id)
    .map((item): SharedBudgetItem => {
      const actual = actualTotalsByItem.get(item.id) ?? 0;
      const refunded = refunds
        .filter((refund) => refund.budget_item_id === item.id)
        .reduce((sum, refund) => sum + refund.amount, 0);
      return {
        ...item,
        actual_amount: actual,
        refunded_amount: refunded,
        remaining_amount: item.allocated_amount - actual,
        notes: item.notes ?? '',
      };
    });
}

export async function adjustSharedBudgetItem(
  budgetItemId: number,
  newAmount: number,
  reason = '',
  confirmBelowActual = false,
) {
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) {
    throw new Error('Budget amounts must be whole, non-negative numbers.');
  }
  const [items, budgets, actualTotalsByItem] = await Promise.all([
    budgetsApi.budgetItems.list(), budgetsApi.budgets.list(), actualTotals(),
  ]);
  const item = items.find((row) => row.id === budgetItemId);
  const budget = item ? budgets.find((row) => row.id === item.budget_id) : undefined;
  if (!item || !budget || budget.type !== 'normal') throw new Error('This normal budget item no longer exists.');
  if (budget.status === 'closed' || budget.status === 'cancelled') {
    throw new Error('Reopen the budget before adjusting its allocation.');
  }
  const actual = actualTotalsByItem.get(item.id) ?? 0;
  if (newAmount < actual && !confirmBelowActual) {
    throw new Error('The new allocation is below current spending. Confirm the reduction to continue.');
  }
  const timestamp = currentTimestamp();
  await budgetsApi.itemAdjustments.create({
    budget_item_id: item.id,
    previous_amount: item.allocated_amount,
    new_amount: newAmount,
    difference: newAmount - item.allocated_amount,
    reason: reason.trim(),
    created_at: timestamp,
  });
  if (!await budgetsApi.budgetItems.update(item.id, { allocated_amount: newAmount, updated_at: timestamp })) {
    throw new Error('This normal budget item no longer exists.');
  }
}

export async function setSharedBudgetClosed(budgetId: number, closed: boolean, note = '') {
  const budgets = await budgetsApi.budgets.list();
  const budget = budgets.find((row) => row.id === budgetId);
  if (!budget || budget.type !== 'normal') throw new Error('This normal budget no longer exists.');
  if (closed && budget.status === 'closed') throw new Error('This budget is already closed.');
  if (!closed && budget.status !== 'closed') throw new Error('This budget is not closed.');
  const timestamp = currentTimestamp();
  const status = closed
    ? 'closed'
    : budget.start_date && budget.start_date > today()
      ? 'upcoming'
      : budget.end_date && budget.end_date < today() ? 'awaiting_review' : 'active';
  await budgetsApi.budgets.update(budgetId, { status, closed_at: closed ? timestamp : null, updated_at: timestamp });
  await budgetsApi.closures.create({
    budget_id: budgetId,
    action: closed ? 'closed' : 'reopened',
    note: note.trim(),
    created_at: timestamp,
  });
}

function validateBudgetTemplate(draft: BudgetTemplateDraft) {
  if (!draft.name.trim()) throw new Error('Enter a name for this budget.');
  dateFromKey(draft.startDate);
  if (draft.endDate) {
    dateFromKey(draft.endDate);
    if (draft.endDate < draft.startDate) throw new Error('The end date must be on or after the start date.');
  }
  if (!['daily', 'weekly', 'monthly'].includes(draft.recurrence)) throw new Error('Choose a valid budget recurrence.');
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
    if (!['reset', 'carry', 'save'].includes(item.rollover)) throw new Error('Choose a valid rollover preference.');
    if (item.alert_thresholds.some((threshold) =>
      !Number.isSafeInteger(threshold) || threshold < 1 || threshold > 1000)) {
      throw new Error('Alert thresholds must be whole percentages between 1 and 1000.');
    }
  }
}

export async function saveBudgetTemplate(draft: BudgetTemplateDraft) {
  validateBudgetTemplate(draft);
  const timestamp = currentTimestamp();
  let templateId = draft.id ?? null;
  if (templateId !== null) {
    const templates = await budgetsApi.templates.list();
    if (!templates.some((template) => template.id === templateId)) {
      throw new Error('This budget template no longer exists.');
    }
    await budgetsApi.templates.update(templateId, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      recurrence: draft.recurrence,
      start_date: draft.startDate,
      end_date: draft.endDate || null,
      week_start_day: draft.recurrence === 'weekly' ? draft.weekStartDay ?? 0 : null,
      active: draft.active ?? true,
      archived: draft.archived ?? false,
      updated_at: timestamp,
    });
  } else {
    const template = await budgetsApi.templates.create({
      name: draft.name.trim(),
      description: draft.description.trim(),
      recurrence: draft.recurrence,
      start_date: draft.startDate,
      end_date: draft.endDate || null,
      week_start_day: draft.recurrence === 'weekly' ? draft.weekStartDay ?? 0 : null,
      active: draft.active ?? true,
      archived: draft.archived ?? false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    templateId = template.id;
  }
  if (templateId === null) throw new Error('Budget template could not be saved.');
  const existingItems = await budgetsApi.templateItems.list();
  for (const existing of existingItems.filter((item) => item.template_id === templateId)) {
    await budgetsApi.templateItems.update(existing.id, { active: false });
  }
  for (const [position, item] of draft.items.entries()) {
    if (item.id !== undefined) {
      const updated = await budgetsApi.templateItems.update(item.id, {
        name: item.name.trim(),
        description: '',
        allocated_amount: item.allocated_amount,
        rollover: item.rollover,
        alert_thresholds: item.alert_thresholds,
        active: item.active,
        position,
      });
      if (!updated) throw new Error('A budget item no longer belongs to this template.');
    } else {
      await budgetsApi.templateItems.create({
        template_id: templateId,
        name: item.name.trim(),
        description: '',
        allocated_amount: item.allocated_amount,
        rollover: item.rollover,
        alert_thresholds: item.alert_thresholds,
        active: item.active,
        position,
      });
    }
  }
  return templateId;
}

export async function getBudgetTemplates(
  includeArchived = false,
): Promise<(BudgetTemplate & { items: BudgetTemplateItem[] })[]> {
  const [templates, items] = await Promise.all([
    budgetsApi.templates.list(),
    budgetsApi.templateItems.list(),
  ]);
  return templates
    .filter((template) => includeArchived || !template.archived)
    .sort((left, right) => Number(right.active) - Number(left.active)
      || left.name.localeCompare(right.name))
    .map((template): BudgetTemplate & { items: BudgetTemplateItem[] } => ({
      ...template,
      active: Number(template.active),
      archived: Number(template.archived),
      items: items
        .filter((item) => item.template_id === template.id)
        .sort((left, right) => left.position - right.position || left.id - right.id)
        .map((item): BudgetTemplateItem => ({
          id: item.id,
          name: item.name,
          description: item.description,
          allocated_amount: item.allocated_amount,
          rollover: item.rollover,
          alert_thresholds: item.alert_thresholds,
          active: item.active,
        })),
    }));
}

export async function setBudgetTemplateState(
  templateId: number,
  state: { active?: boolean; archived?: boolean },
) {
  const patch: { active?: boolean; archived?: boolean; updated_at: string } = {
    updated_at: currentTimestamp(),
  };
  if (state.active !== undefined) patch.active = state.active;
  if (state.archived !== undefined) patch.archived = state.archived;
  if (!await budgetsApi.templates.update(templateId, patch)) {
    throw new Error('This budget template no longer exists.');
  }
}

export async function deleteBudgetTemplate(templateId: number) {
  const [periods, items] = await Promise.all([
    budgetsApi.periods.list(), budgetsApi.templateItems.list(),
  ]);
  if (periods.some((period) => period.template_id === templateId)) {
    throw new Error('This budget has history. Archive it instead to preserve its periods.');
  }
  for (const item of items.filter((row) => row.template_id === templateId)) {
    await budgetsApi.templateItems.delete(item.id);
  }
  if (!await budgetsApi.templates.delete(templateId)) {
    throw new Error('This budget template no longer exists.');
  }
}

export async function canDeleteBudget(budgetId: number) {
  const [allocations, refunds, items] = await Promise.all([
    budgetsApi.transactionAllocations.list(),
    budgetsApi.itemRefundAllocations.list(),
    budgetsApi.budgetItems.list(),
  ]);
  const itemBudgets = new Map(items.map((item) => [item.id, item.budget_id]));
  const hasAllocations = allocations.some((allocation) =>
    allocation.budget_id === budgetId || (allocation.budget_item_id !== null
      && itemBudgets.get(allocation.budget_item_id) === budgetId));
  const hasRefunds = refunds.some((refund) => itemBudgets.get(refund.budget_item_id) === budgetId);
  return !hasAllocations && !hasRefunds;
}

export async function deleteBudget(budgetId: number) {
  if (!(await canDeleteBudget(budgetId))) {
    throw new Error('This budget has linked transactions and cannot be deleted. Close it instead to preserve its history.');
  }
  const [budgets, items, mappings, closures] = await Promise.all([
    budgetsApi.budgets.list(),
    budgetsApi.budgetItems.list(),
    budgetsApi.legacyBudgetItemMap.list(),
    budgetsApi.closures.list(),
  ]);
  if (!budgets.some((budget) => budget.id === budgetId)) throw new Error('This budget no longer exists.');
  for (const closure of closures.filter((row) => row.budget_id === budgetId)) {
    await budgetsApi.closures.delete(closure.id);
  }
  for (const item of items.filter((row) => row.budget_id === budgetId)) {
    const mapping = mappings.find((row) => row.budget_item_id === item.id);
    if (mapping) await budgetsApi.legacyBudgetItemMap.delete(mapping.period_item_id);
    await budgetsApi.budgetItems.delete(item.id);
  }
  await budgetsApi.budgets.delete(budgetId);
}

async function reconcileBudgetPeriodRollover(periodId: number) {
  const [periods, templates, periodItems, adjustments, transactions, allocations, refunds] = await Promise.all([
    budgetsApi.periods.list(),
    budgetsApi.templates.list(),
    budgetsApi.periodItems.list(),
    budgetsApi.budgetAdjustments.list(),
    transactionsApi.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgetRefundAllocations.list(),
  ]);
  const period = periods.find((row) => row.id === periodId);
  if (!period) return;
  const template = templates.find((row) => row.id === period.template_id);
  if (!template) return;
  const nextPeriod = periods
    .filter((row) => row.template_id === period.template_id
      && row.start_date === addCalendarDays(period.end_date, 1)
      && row.status !== 'cancelled')
    .sort((left, right) => left.id - right.id)[0];
  if (!nextPeriod || nextPeriod.status === 'closed') return;
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const shouldRollover = period.status === 'closed' || period.end_date < today();
  const currentItems = periodItems.filter((item) => item.period_id === periodId);
  for (const current of currentItems) {
    if (current.template_item_id === null) continue;
    const nextItem = periodItems.find((item) =>
      item.period_id === nextPeriod.id && item.template_item_id === current.template_item_id);
    if (!nextItem) continue;
    let unspent = 0;
    if (shouldRollover) {
      const latestAdjustment = adjustments
        .filter((adjustment) => adjustment.period_item_id === current.id)
        .sort((left, right) => right.id - left.id)[0];
      const finalAmount = (latestAdjustment?.new_amount ?? current.original_amount) + current.rollover_amount;
      let actual = 0;
      for (const allocation of allocations) {
        if (allocation.period_item_id !== current.id) continue;
        const transaction = transactionById.get(allocation.transaction_id);
        if (transaction?.kind === 'expense' && transaction.loan_id === null
          && transaction.transfer_id === null) actual += allocation.amount;
      }
      actual -= refunds.filter((refund) => refund.period_item_id === current.id)
        .reduce((sum, refund) => sum + refund.amount, 0);
      unspent = Math.max(0, finalAmount - actual);
    }
    await budgetsApi.periodItems.update(nextItem.id, {
      rollover_amount: shouldRollover && current.rollover === 'carry' ? unspent : 0,
      saved_amount: shouldRollover && current.rollover === 'save' ? unspent : 0,
    });
  }
}

async function reconcileEndedBudgetPeriodRollovers() {
  const periods = await budgetsApi.periods.list();
  for (const period of periods
    .filter((row) => row.status === 'closed' || row.end_date < today())
    .sort((left, right) => left.template_id - right.template_id
      || left.end_date.localeCompare(right.end_date) || left.id - right.id)) {
    await reconcileBudgetPeriodRollover(period.id);
  }
}

export async function generateBudgetPeriods(throughDate = addCalendarDays(today(), 60)) {
  dateFromKey(throughDate);
  const [templates, templateItems, periods] = await Promise.all([
    budgetsApi.templates.list(),
    budgetsApi.templateItems.list(),
    budgetsApi.periods.list(),
  ]);
  const timestamp = currentTimestamp();
  for (const template of templates
    .filter((row) => row.active && !row.archived)
    .sort((left, right) => left.id - right.id)) {
    const items = templateItems
      .filter((item) => item.template_id === template.id && item.active)
      .sort((left, right) => left.position - right.position || left.id - right.id);
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
      if (template.recurrence === 'daily') nextStart = addCalendarDays(periodStart, 1);
      else if (template.recurrence === 'weekly') nextStart = addCalendarDays(periodStart, 7);
      else {
        const current = dateFromKey(periodStart);
        nextStart = monthlyDate(current.getFullYear(), current.getMonth() + 1, anchorDay);
      }
      let periodEnd = addCalendarDays(nextStart, -1);
      if (template.end_date && periodEnd > template.end_date) periodEnd = template.end_date;
      if (periodEnd < periodStart) periodEnd = periodStart;
      const existing = periods.find((period) =>
        period.template_id === template.id
        && period.start_date === periodStart
        && period.end_date === periodEnd);
      let periodId: number;
      if (existing) {
        periodId = existing.id;
        const status = today() > periodEnd ? 'awaiting_review'
          : today() < periodStart ? 'upcoming' : 'active';
        if (existing.status !== 'closed' && existing.status !== 'cancelled') {
          await budgetsApi.periods.update(periodId, { status, closed_at: null });
        }
      } else {
        const status = today() > periodEnd ? 'awaiting_review'
          : today() < periodStart ? 'upcoming' : 'active';
        const period = await budgetsApi.periods.create({
          template_id: template.id,
          start_date: periodStart,
          end_date: periodEnd,
          status,
          created_at: timestamp,
        });
        periods.push(period);
        periodId = period.id;
        for (const item of items) {
          await budgetsApi.periodItems.create({
            period_id: periodId,
            template_item_id: item.id,
            name: item.name,
            description: item.description,
            original_amount: item.allocated_amount,
            rollover_amount: 0,
            saved_amount: 0,
            rollover: item.rollover,
            alert_thresholds: item.alert_thresholds,
          });
        }
      }
      periodStart = nextStart;
    }
  }
  await reconcileEndedBudgetPeriodRollovers();
}

export async function getBudgetPeriods(templateId?: number) {
  const [periods, templates] = await Promise.all([
    budgetsApi.periods.list(),
    budgetsApi.templates.list(),
  ]);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return periods
    .filter((period) => templateId === undefined || period.template_id === templateId)
    .sort((left, right) => right.start_date.localeCompare(left.start_date) || right.id - left.id)
    .map((period): BudgetPeriod => {
      const template = templateById.get(period.template_id);
      return {
        ...period,
        template_name: template?.name ?? '',
        recurrence: template?.recurrence ?? 'monthly',
      };
    });
}

export async function getBudgetPeriodSummaries() {
  const [budgets, templates, actualTotalsByItem, items] = await Promise.all([
    budgetsApi.budgets.list(),
    budgetsApi.templates.list(),
    actualTotals(),
    budgetsApi.budgetItems.list(),
  ]);
  const templateById = new Map(templates.map((template) => [template.id, template]));
  return budgets
    .filter((budget) => budget.type === 'recurring')
    .sort((left, right) => (right.start_date ?? '').localeCompare(left.start_date ?? '') || right.id - left.id)
    .map((budget): BudgetSummary => {
      const template = budget.template_id ? templateById.get(budget.template_id) : undefined;
      const actual = items
        .filter((item) => item.budget_id === budget.id)
        .reduce((sum, item) => sum + (actualTotalsByItem.get(item.id) ?? 0), 0);
      return {
        id: budget.legacy_period_id ?? budget.id,
        template_id: budget.template_id ?? 0,
        template_name: template?.name ?? budget.name,
        recurrence: template?.recurrence ?? 'monthly',
        start_date: budget.start_date ?? '',
        end_date: budget.end_date ?? '',
        status: budget.status as BudgetPeriod['status'],
        created_at: budget.created_at,
        closed_at: budget.closed_at,
        allocated_amount: budget.total_allocated,
        actual_amount: actual,
        remaining_amount: budget.total_allocated - actual,
      };
    });
}

export async function getUnallocatedExpenses(
  dateRange: Pick<SharedBudgetFilter, 'startDate' | 'endDate'> = {},
) {
  if (dateRange.startDate) dateFromKey(dateRange.startDate);
  if (dateRange.endDate) dateFromKey(dateRange.endDate);
  if (dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate) {
    throw new Error('The analysis start date must be on or before its end date.');
  }
  const [transactions, allocations] = await Promise.all([
    transactionsApi.list(),
    budgetsApi.transactionAllocations.list(),
  ]);
  const allocated = new Map<number, number>();
  for (const allocation of allocations) {
    allocated.set(allocation.transaction_id,
      (allocated.get(allocation.transaction_id) ?? 0) + allocation.amount);
  }
  return transactions
    .filter((transaction) =>
      transaction.kind === 'expense'
      && transaction.loan_id === null
      && transaction.transfer_id === null
      && transaction.refund_of_transaction_id === null
      && (!dateRange.startDate || transaction.date >= dateRange.startDate)
      && (!dateRange.endDate || transaction.date <= dateRange.endDate)
      && transaction.amount - (allocated.get(transaction.id) ?? 0) > 0)
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
    .map((transaction): Transaction & { unallocated_amount: number } => ({
      ...transaction,
      unallocated_amount: transaction.amount - (allocated.get(transaction.id) ?? 0),
    }));
}

export async function getSharedBudgetAnalysis(filter: SharedBudgetFilter = {}) {
  const budgets = await getSharedBudgets(filter.type, filter);
  const itemGroups = await Promise.all(budgets.map(async (budget) => ({
    budget,
    items: await getSharedBudgetItems(budget.id),
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
  const unallocatedExpenses = await getUnallocatedExpenses(filter);
  const allocated = comparisons.reduce((sum, item) => sum + item.allocated_amount, 0);
  const actual = comparisons.reduce((sum, item) => sum + item.actual_amount, 0);
  const refunded = itemGroups.flatMap(({ items }) => items)
    .reduce((sum, item) => sum + item.refunded_amount, 0);
  return {
    budgets,
    comparisons,
    overBudgetItems: comparisons.filter((item) => item.actual_amount > item.allocated_amount),
    underutilizedItems: comparisons.filter((item) =>
      item.allocated_amount > 0 && item.actual_amount / item.allocated_amount < 0.5),
    totalAllocated: allocated,
    actualSpending: actual,
    totalRefunds: refunded,
    totalRemaining: allocated - actual,
    utilizationPercent: allocated > 0 ? actual / allocated * 100 : 0,
    unallocatedExpenses,
    unallocatedAmount: unallocatedExpenses.reduce((sum, expense) => sum + expense.unallocated_amount, 0),
  };
}

export async function getBudgetPeriodTransactions(periodItemId: number) {
  const [transactions, allocations, refundAllocations, transactionRefunds] = await Promise.all([
    transactionsApi.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgetRefundAllocations.list(),
    budgetsApi.transactionRefunds.list(),
  ]);
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const records = new Map<number, number>();
  for (const allocation of allocations) {
    if (allocation.period_item_id === periodItemId) {
      records.set(allocation.transaction_id,
        (records.get(allocation.transaction_id) ?? 0) + allocation.amount);
    }
  }
  for (const refundAllocation of refundAllocations) {
    if (refundAllocation.period_item_id !== periodItemId) continue;
    const refund = transactionRefunds.find((row) => row.id === refundAllocation.refund_id);
    if (!refund) continue;
    records.set(refund.refund_transaction_id,
      (records.get(refund.refund_transaction_id) ?? 0) + refundAllocation.amount);
  }
  return [...records.entries()]
    .flatMap(([id, allocatedAmount]) => {
      const transaction = transactionById.get(id);
      return transaction ? [{ ...transaction, allocated_amount: allocatedAmount }] : [];
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
}

export async function getBudgetPeriodItems(periodId: number) {
  const [items, adjustments, allocations, refunds, transactions] = await Promise.all([
    budgetsApi.periodItems.list(),
    budgetsApi.budgetAdjustments.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgetRefundAllocations.list(),
    transactionsApi.list(),
  ]);
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  return items
    .filter((item) => item.period_id === periodId)
    .sort((left, right) => left.id - right.id)
    .map((item): BudgetPeriodItem => {
      const latestAdjustment = adjustments
        .filter((adjustment) => adjustment.period_item_id === item.id)
        .sort((left, right) => right.id - left.id)[0];
      const finalAmount = (latestAdjustment?.new_amount ?? item.original_amount) + item.rollover_amount;
      let actual = 0;
      for (const allocation of allocations) {
        if (allocation.period_item_id !== item.id) continue;
        const transaction = transactionById.get(allocation.transaction_id);
        if (transaction?.kind === 'expense' && transaction.loan_id === null
          && transaction.transfer_id === null) actual += allocation.amount;
      }
      const refunded = refunds
        .filter((refund) => refund.period_item_id === item.id)
        .reduce((sum, refund) => sum + refund.amount, 0);
      return {
        ...item,
        alert_thresholds: JSON.stringify(item.alert_thresholds),
        final_amount: finalAmount,
        actual_amount: actual - refunded,
        refunded_amount: refunded,
      };
    });
}

export async function getAllocatableBudgetItems(date = today()) {
  await generateBudgetPeriods(date);
  return getBudgetItemsForExpenseDate(date);
}

export async function getBudgetItemsForExpenseDate(date: string) {
  await generateBudgetPeriods();
  const [budgets, items, mappings, actualTotalsByItem, refunds] = await Promise.all([
    budgetsApi.budgets.list(),
    budgetsApi.budgetItems.list(),
    budgetsApi.legacyBudgetItemMap.list(),
    actualTotals(),
    budgetsApi.itemRefundAllocations.list(),
  ]);
  const refundedByItem = new Map<number, number>();
  for (const refund of refunds) {
    refundedByItem.set(refund.budget_item_id,
      (refundedByItem.get(refund.budget_item_id) ?? 0) + refund.amount);
  }
  return items
    .filter((item) => {
      const budget = budgets.find((row) => row.id === item.budget_id);
      return budget && ['active', 'awaiting_review'].includes(budget.status)
        && budgetCoversDate(budget.type, budget.start_date, budget.end_date, date);
    })
    .sort((left, right) => {
      const leftBudget = budgets.find((budget) => budget.id === left.budget_id);
      const rightBudget = budgets.find((budget) => budget.id === right.budget_id);
      return (leftBudget?.name ?? '').localeCompare(rightBudget?.name ?? '')
        || left.position - right.position || left.id - right.id;
    })
    .map((item) => {
      const budget = budgets.find((row) => row.id === item.budget_id)!;
      const mapping = mappings.find((row) => row.budget_item_id === item.id);
      const actual = actualTotalsByItem.get(item.id) ?? 0;
      const refunded = refundedByItem.get(item.id) ?? 0;
      return {
        ...item,
        id: item.id,
        period_id: budget.id,
        period_item_id: mapping?.period_item_id ?? null,
        budget_id: budget.id,
        budget_type: budget.type,
        template_name: budget.name,
        start_date: budget.start_date,
        end_date: budget.end_date,
        period_status: budget.status,
        final_amount: item.allocated_amount,
        actual_amount: actual,
        refunded_amount: refunded,
      };
    });
}

export async function getTransactionBudgetAllocations(transactionId: number) {
  const [allocations, items, budgets] = await Promise.all([
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgetItems.list(),
    budgetsApi.budgets.list(),
  ]);
  return allocations
    .filter((allocation) => allocation.transaction_id === transactionId)
    .sort((left, right) => {
      const leftItem = items.find((item) => item.id === left.budget_item_id);
      const rightItem = items.find((item) => item.id === right.budget_item_id);
      const leftBudget = budgets.find((budget) => budget.id === left.budget_id);
      const rightBudget = budgets.find((budget) => budget.id === right.budget_id);
      return (leftBudget?.name ?? '').localeCompare(rightBudget?.name ?? '')
        || (leftItem?.name ?? '').localeCompare(rightItem?.name ?? '');
    })
    .map((allocation) => {
      const item = items.find((row) => row.id === allocation.budget_item_id);
      const budget = budgets.find((row) => row.id === allocation.budget_id);
      return {
        period_item_id: allocation.period_item_id,
        budget_item_id: allocation.budget_item_id,
        budget_id: allocation.budget_id,
        amount: allocation.amount,
        item_name: item?.name ?? '',
        template_name: budget?.name ?? '',
        period_status: budget?.status ?? '',
        budget_type: (budget?.type ?? 'normal') as 'normal' | 'recurring',
      };
    });
}

async function updateBudgetThresholdAlerts(periodItemId: number) {
  const [items, adjustments, allocations, refunds, transactions, existingAlerts] = await Promise.all([
    budgetsApi.periodItems.list(),
    budgetsApi.budgetAdjustments.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.budgetRefundAllocations.list(),
    transactionsApi.list(),
    budgetsApi.alerts.list(),
  ]);
  const item = items.find((row) => row.id === periodItemId);
  if (!item) return;
  const latest = adjustments.filter((row) => row.period_item_id === periodItemId)
    .sort((left, right) => right.id - left.id)[0];
  const finalAmount = (latest?.new_amount ?? item.original_amount) + item.rollover_amount;
  if (!finalAmount) return;
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  let actual = 0;
  for (const allocation of allocations) {
    if (allocation.period_item_id !== periodItemId) continue;
    const transaction = transactionById.get(allocation.transaction_id);
    if (transaction?.kind === 'expense' && transaction.loan_id === null
      && transaction.transfer_id === null) actual += allocation.amount;
  }
  actual -= refunds.filter((refund) => refund.period_item_id === periodItemId)
    .reduce((sum, refund) => sum + refund.amount, 0);
  const percentage = actual / finalAmount * 100;
  for (const threshold of item.alert_thresholds) {
    if (percentage >= threshold
      && !existingAlerts.some((alert) =>
        alert.period_item_id === periodItemId && alert.threshold === threshold)) {
      await budgetsApi.alerts.create({
        period_item_id: periodItemId,
        threshold,
        created_at: currentTimestamp(),
      });
    }
  }
}

async function updateSharedBudgetThresholdAlerts(budgetItemId: number) {
  const [items, actualTotalsByItem, existingAlerts] = await Promise.all([
    budgetsApi.budgetItems.list(),
    actualTotals(),
    budgetsApi.itemAlerts.list(),
  ]);
  const item = items.find((row) => row.id === budgetItemId);
  if (!item || item.allocated_amount <= 0) return;
  const actual = actualTotalsByItem.get(budgetItemId) ?? 0;
  const percentage = actual / item.allocated_amount * 100;
  const mapping = (await budgetsApi.legacyBudgetItemMap.list()).find((row) => row.budget_item_id === budgetItemId);
  for (const threshold of item.alert_thresholds) {
    if (percentage >= threshold
      && !existingAlerts.some((alert) =>
        alert.budget_item_id === budgetItemId && alert.threshold === threshold)) {
      await budgetsApi.itemAlerts.create({ budget_item_id: budgetItemId, threshold, created_at: currentTimestamp() });
      if (mapping) await budgetsApi.alerts.create({ period_item_id: mapping.period_item_id, threshold, created_at: currentTimestamp() });
    }
  }
}

export async function saveTransactionBudgetAllocations(
  transactionId: number,
  allocations: { budgetItemId: number; amount: number }[],
) {
  if (allocations.some((allocation) => !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
    || !Number.isSafeInteger(allocation.budgetItemId) || allocation.budgetItemId < 1)) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.budgetItemId)).size !== allocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }
  const [transactions, budgets, items, mappings, refunds, existing] = await Promise.all([
    transactionsApi.list(), budgetsApi.budgets.list(), budgetsApi.budgetItems.list(),
    budgetsApi.legacyBudgetItemMap.list(), budgetsApi.transactionRefunds.list(),
    budgetsApi.transactionAllocations.list(),
  ]);
  const transaction = transactions.find((row) => row.id === transactionId);
  if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
    || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) {
    throw new Error('Only regular expense transactions can be allocated to budgets.');
  }
  if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > transaction.amount) {
    throw new Error('Budget item allocations cannot exceed the expense total.');
  }
  if (existing.some((allocation) => allocation.transaction_id === transactionId
    && budgets.find((budget) => budget.id === allocation.budget_id)?.status === 'closed')) {
    throw new Error('Reopen the closed budget period before changing allocations so its history is corrected intentionally.');
  }
  for (const allocation of allocations) {
    const item = items.find((row) => row.id === allocation.budgetItemId);
    const budget = item ? budgets.find((row) => row.id === item.budget_id) : undefined;
    if (!item || !budget || !['active', 'awaiting_review'].includes(budget.status)
      || !budgetCoversDate(budget.type, budget.start_date, budget.end_date, transaction.date)) {
      throw new Error('Choose an open budget item covering the expense date.');
    }
  }
  if (refunds.some((refund) => refund.original_transaction_id === transactionId)) {
    throw new Error('Expense allocations cannot be changed after a refund has been recorded.');
  }
  for (const allocation of existing.filter((row) => row.transaction_id === transactionId)) {
    await budgetsApi.transactionAllocations.delete(allocation.id);
  }
  for (const allocation of allocations) {
    const item = items.find((row) => row.id === allocation.budgetItemId);
    if (!item) throw new Error('This budget item no longer exists.');
    const mapping = mappings.find((row) => row.budget_item_id === item.id);
    await budgetsApi.transactionAllocations.create({
      transaction_id: transactionId,
      budget_id: item.budget_id,
      budget_item_id: item.id,
      period_item_id: mapping?.period_item_id ?? null,
      amount: allocation.amount,
      created_at: currentTimestamp(),
    });
    if (mapping) await updateBudgetThresholdAlerts(mapping.period_item_id);
    await updateSharedBudgetThresholdAlerts(item.id);
  }
}

export async function getBudgetAlerts() {
  const [alerts, periodItems, periods, templates] = await Promise.all([
    budgetsApi.alerts.list(), budgetsApi.periodItems.list(),
    budgetsApi.periods.list(), budgetsApi.templates.list(),
  ]);
  return alerts
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
    .slice(0, 30)
    .map((alert): BudgetAlert => {
      const item = periodItems.find((row) => row.id === alert.period_item_id);
      const period = item ? periods.find((row) => row.id === item.period_id) : undefined;
      const template = period ? templates.find((row) => row.id === period.template_id) : undefined;
      return { ...alert, template_name: template?.name ?? '', item_name: item?.name ?? '', start_date: period?.start_date ?? '' };
    });
}

export async function allocateTransactionToBudgets(
  transactionId: number,
  allocations: { budgetItemId: number; amount: number }[],
  transactionAmount: number,
) {
  if (!allocations.length) return;
  if (!Number.isSafeInteger(transactionAmount) || transactionAmount <= 0) throw new Error('Budget allocations require a whole-number transaction amount.');
  if (allocations.some((allocation) => !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
    || !Number.isSafeInteger(allocation.budgetItemId) || allocation.budgetItemId < 1)) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(allocations.map((allocation) => allocation.budgetItemId)).size !== allocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }
  if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > transactionAmount) {
    throw new Error('Budget item allocations cannot exceed the expense total.');
  }
  const [transactions, budgets, items, mappings] = await Promise.all([
    transactionsApi.list(), budgetsApi.budgets.list(), budgetsApi.budgetItems.list(), budgetsApi.legacyBudgetItemMap.list(),
  ]);
  const transaction = transactions.find((row) => row.id === transactionId);
  if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
    || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) {
    throw new Error('Only regular expense transactions can be allocated to budgets.');
  }
  if (transaction.amount !== transactionAmount) throw new Error('The expense amount changed before allocation.');
  for (const allocation of allocations) {
    const item = items.find((row) => row.id === allocation.budgetItemId);
    const budget = item ? budgets.find((row) => row.id === item.budget_id) : undefined;
    if (!budget || !item || !['active', 'awaiting_review'].includes(budget.status)
      || !budgetCoversDate(budget.type, budget.start_date, budget.end_date, transaction.date)) {
      throw new Error('Choose an active budget item covering the expense date.');
    }
    const mapping = mappings.find((row) => row.budget_item_id === item.id);
    await budgetsApi.transactionAllocations.create({
      transaction_id: transactionId,
      budget_id: budget.id,
      budget_item_id: item.id,
      period_item_id: mapping?.period_item_id ?? null,
      amount: allocation.amount,
      created_at: currentTimestamp(),
    });
    if (mapping) await updateBudgetThresholdAlerts(mapping.period_item_id);
    await updateSharedBudgetThresholdAlerts(item.id);
  }
}

export async function adjustBudgetPeriodItem(
  periodItemId: number,
  newAmount: number,
  reason = '',
  confirmBelowActual = false,
) {
  if (!Number.isSafeInteger(newAmount) || newAmount < 0) throw new Error('Budget amounts must be whole, non-negative numbers.');
  const [items, periods, adjustments, allocations, refunds, transactions] = await Promise.all([
    budgetsApi.periodItems.list(), budgetsApi.periods.list(), budgetsApi.budgetAdjustments.list(),
    budgetsApi.transactionAllocations.list(), budgetsApi.budgetRefundAllocations.list(), transactionsApi.list(),
  ]);
  const item = items.find((row) => row.id === periodItemId);
  if (!item) throw new Error('This budget item no longer exists.');
  const period = periods.find((row) => row.id === item.period_id);
  if (!period || period.status === 'closed' || period.status === 'cancelled') throw new Error('Closed budget periods cannot be adjusted.');
  const latest = adjustments.filter((row) => row.period_item_id === periodItemId).sort((left, right) => right.id - left.id)[0];
  const previousAmount = (latest?.new_amount ?? item.original_amount) + item.rollover_amount;
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  let actual = 0;
  for (const allocation of allocations) {
    if (allocation.period_item_id !== periodItemId) continue;
    const transaction = transactionById.get(allocation.transaction_id);
    if (transaction?.kind === 'expense' && transaction.loan_id === null && transaction.transfer_id === null) actual += allocation.amount;
  }
  actual -= refunds.filter((refund) => refund.period_item_id === periodItemId).reduce((sum, refund) => sum + refund.amount, 0);
  if (newAmount < actual && !confirmBelowActual) throw new Error('The new allocation is below current spending. Confirm the reduction to continue.');
  await budgetsApi.budgetAdjustments.create({
    period_item_id: periodItemId,
    previous_amount: previousAmount,
    new_amount: newAmount,
    difference: newAmount - previousAmount,
    reason: reason.trim(),
    created_at: currentTimestamp(),
  });
}

export async function getBudgetAdjustments(periodItemId: number) {
  const adjustments = await budgetsApi.budgetAdjustments.list();
  return adjustments.filter((adjustment) => adjustment.period_item_id === periodItemId)
    .sort((left, right) => right.id - left.id);
}

export async function closeBudgetPeriod(periodId: number, note = '') {
  const [periods, templates] = await Promise.all([budgetsApi.periods.list(), budgetsApi.templates.list()]);
  const period = periods.find((row) => row.id === periodId);
  if (!period) throw new Error('This budget period no longer exists.');
  const template = templates.find((row) => row.id === period.template_id);
  const nextStartDate = addCalendarDays(period.end_date, 1);
  if (template?.active && !template.archived && (!template.end_date || nextStartDate <= template.end_date)) {
    await generateBudgetPeriods(nextStartDate);
  }
  const current = (await budgetsApi.periods.list()).find((row) => row.id === periodId);
  if (!current || !['active', 'awaiting_review'].includes(current.status)) {
    throw new Error('This budget period is already closed or cannot be closed.');
  }
  await budgetsApi.periods.update(periodId, { status: 'closed', closed_at: currentTimestamp() });
  await budgetsApi.periodClosures.create({
    period_id: periodId,
    action: 'closed',
    note: note.trim(),
    created_at: currentTimestamp(),
  });
  await reconcileBudgetPeriodRollover(periodId);
}

export async function reopenBudgetPeriod(periodId: number, note = '') {
  const periods = await budgetsApi.periods.list();
  const period = periods.find((row) => row.id === periodId);
  if (!period) throw new Error('This budget period no longer exists.');
  const nextPeriod = periods
    .filter((row) => row.template_id === period.template_id
      && row.start_date === addCalendarDays(period.end_date, 1)
      && row.status !== 'cancelled')
    .sort((left, right) => left.id - right.id)[0];
  if (nextPeriod?.status === 'closed') throw new Error('Reopen the next period before correcting this closed period.');
  if (period.status !== 'closed') throw new Error('This budget period is not closed.');
  await budgetsApi.periods.update(periodId, {
    status: period.start_date <= today() && period.end_date >= today() ? 'active' : 'awaiting_review',
    closed_at: null,
  });
  await budgetsApi.periodClosures.create({
    period_id: periodId,
    action: 'reopened',
    note: note.trim(),
    created_at: currentTimestamp(),
  });
  await reconcileBudgetPeriodRollover(periodId);
}
