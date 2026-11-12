import type { BrowserDatabase } from '../web/database';
import {
  type ListItem,
  type ListRecord,
  type RecordDraft,
} from './database_types';

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
