import {
  type ListItem,
  type ListRecord,
  type RecordDraft,
} from './database_types';
import {
  eventsApi,
  listItemsApi,
  listsApi,
} from '../../../api/records.api';
import { transactionsApi } from '../../../api/finance.api';
import { budgetsApi } from '../../../api/budgets.api';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error.';
}

async function replaceListItems(listId: number, items: Array<ListItem & { position: number }>) {
  const existing = (await listItemsApi.list()).filter((item) => item.list_id === listId);
  for (const item of existing) {
    if (!await listItemsApi.delete({ list_id: listId, position: item.position })) {
      throw new Error('The list items changed before they could be saved.');
    }
  }
  for (const item of items) {
    await listItemsApi.create({
      list_id: listId,
      position: item.position,
      text: item.text,
      done: item.done,
      price: item.price,
      quantity: item.quantity,
    });
  }
}

// Create or update a list while preserving item completion and event links.
export async function saveList(
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
  const [listRows, allItems, eventRows] = await Promise.all([
    listsApi.list(),
    listItemsApi.list(),
    eventsApi.list(),
  ]);
  const previous = draft.id ? listRows.find((list) => list.id === draft.id) : undefined;
  if (draft.id && !previous) throw new Error('The list no longer exists.');
  if (previous?.finalized) throw new Error('Reopen the list before editing it.');
  const previousItems = previous
    ? allItems.filter((item) => item.list_id === previous.id).sort((a, b) => a.position - b.position)
    : [];
  const completionByText = new Map(previousItems.map((item) => [item.text, item.done]));
  const savedItems = items.map((item, position) => ({
    ...item,
    position,
    done: draft.listItems ? item.done : completionByText.get(item.text) ?? false,
  }));
  const budgetEnabled = Boolean(draft.budgetEnabled ?? previous?.budget_enabled ?? false);
  const eventId = budgetEnabled
    ? draft.eventId === undefined ? previous?.event_id ?? null : draft.eventId
    : null;
  if (eventId !== null && !eventRows.some((event) => event.id === eventId)) {
    throw new Error('The selected event no longer exists.');
  }
  const listNotes = draft.notes?.trim() ?? previous?.notes ?? '';
  if (!previous) {
    const created = await listsApi.create({
      title,
      notes: listNotes,
      budget_enabled: budgetEnabled,
      event_id: eventId,
    });
    try {
      await replaceListItems(created.id, savedItems);
    } catch (error) {
      try {
        if (!await listsApi.delete(created.id)) throw new Error('Could not remove the incomplete list.');
      } catch (rollbackError) {
        throw new Error(`Could not save list items: ${errorMessage(error)} Rollback failed: ${errorMessage(rollbackError)}`);
      }
      throw error;
    }
    return;
  }
  const updated = await listsApi.update(previous.id, {
    title,
    notes: listNotes,
    budget_enabled: budgetEnabled,
    event_id: eventId,
  });
  if (!updated) throw new Error('Reopen the list before editing it.');
  try {
    await replaceListItems(previous.id, savedItems);
  } catch (error) {
    try {
      const restored = await listsApi.update(previous.id, {
        title: previous.title,
        notes: previous.notes,
        budget_enabled: previous.budget_enabled,
        event_id: previous.event_id,
      });
      if (!restored) throw new Error('Could not restore the previous list.');
      await replaceListItems(previous.id, previousItems.map((item) => ({ ...item, done: item.done })));
    } catch (rollbackError) {
      throw new Error(`Could not save list items: ${errorMessage(error)} Rollback failed: ${errorMessage(rollbackError)}`);
    }
    throw error;
  }
}

// Toggle a list item only while the list is still editable.
export async function toggleListItem(
  list: ListRecord,
  itemIndex: number,
) {
  const [lists, items] = await Promise.all([listsApi.list(), listItemsApi.list()]);
  const current = lists.find((row) => row.id === list.id);
  if (!current) throw new Error('The list no longer exists.');
  if (current.finalized) throw new Error('Reopen the list before changing its items.');
  const item = items
    .filter((row) => row.list_id === list.id)
    .sort((a, b) => a.position - b.position)[itemIndex];
  if (!item) return;
  const updated = await listItemsApi.update(
    { list_id: list.id, position: item.position },
    { done: !item.done },
  );
  if (!updated) throw new Error('Reopen the list before changing its items.');
}

export async function reopenBudgetList(listId: number) {
  const [listRows, transactionRows] = await Promise.all([listsApi.list(), transactionsApi.list()]);
  const list = listRows.find((row) => row.id === listId);
  if (!list) throw new Error('The list no longer exists.');
  if (!list.finalized) return;
  if (list.final_transaction_id) {
    const transaction = transactionRows.find((row) => row.id === list.final_transaction_id);
    if (transaction?.refund_of_transaction_id !== null && transaction?.refund_of_transaction_id !== undefined) {
      throw new Error('This budget expense has a refund. Keep the list and its accounting history.');
    }
    const allocations = await budgetsApi.transactionAllocations.list();
    for (const allocation of allocations.filter((row) => row.transaction_id === list.final_transaction_id)) {
      if (!await budgetsApi.transactionAllocations.delete(allocation.id)) {
        throw new Error('The linked expense allocations changed before the list could be reopened.');
      }
    }
    if (!await transactionsApi.delete(list.final_transaction_id)) {
      throw new Error('The linked expense no longer exists.');
    }
  }
  if (!await listsApi.update(listId, { finalized: false, final_transaction_id: null })) {
    throw new Error('The list changed before it could be reopened.');
  }
}
