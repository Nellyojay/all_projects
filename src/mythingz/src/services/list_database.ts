import type { BrowserDatabase } from '../web/database';
import {
  type ListItem,
  type ListRecord,
  type RecordDraft,
} from './database_types';
import { today } from './budget_database';
import { ensureAccountBalance } from './finance_database';
import { ensureListNotesColumn } from './schema_database';

// Create or update a list while preserving item completion and event links.
export async function saveList(
  database: BrowserDatabase,
  draft: RecordDraft,
  title: string,
  notes: string,
) {
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

// Toggle a list item only while the list is still editable.
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

// Turn checked list items into an expense and mark the list finalized.
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
