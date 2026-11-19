import {
  currentTimestamp,
  INCOME_CATEGORIES,
  getTransferCharges,
  InsufficientBalanceError,
  parseAccountId,
  ugxFormatter,
  type LinkedRecordType,
  type ListItem,
  type RecordDraft,
  type RecordKind,
} from './database_types';
import { today } from './budget_database';
import { ensureAccountBalance } from './finance_database';
import {
  accountsApi,
  loansApi,
  transactionsApi,
  transfersApi,
} from '../../../api/finance.api';
import { budgetsApi } from '../../../api/budgets.api';
import {
  eventsApi,
  inboxItemsApi,
  listItemsApi,
  listsApi,
  notesApi,
  recordLinksApi,
  remindersApi,
  tasksApi,
} from '../../../api/records.api';

async function getFinanceSnapshot() {
  const [accounts, loans, transactions, transfers] = await Promise.all([
    accountsApi.list(),
    loansApi.list(),
    transactionsApi.list(),
    transfersApi.list(),
  ]);
  return { accounts, loans, transactions, transfers };
}

function getAccountBalance(
  snapshot: Awaited<ReturnType<typeof getFinanceSnapshot>>,
  accountId: string,
) {
  const account = snapshot.accounts.find((row) => String(row.id) === accountId);
  if (!account) throw new Error('Choose a valid account.');
  const asOf = today();
  const transactionBalance = snapshot.transactions.reduce((total, transaction) => {
    if (transaction.account_id !== accountId || transaction.date > asOf) return total;
    return total + (transaction.kind === 'income' ? transaction.amount : -transaction.amount);
  }, 0);
  const transferBalance = snapshot.transfers.reduce((total, transfer) => {
    if (transfer.date > asOf) return total;
    if (transfer.to_account_id === accountId) return total + transfer.amount;
    if (transfer.from_account_id === accountId) return total - transfer.amount;
    return total;
  }, 0);
  return account.opening_balance + transactionBalance + transferBalance;
}

function ensureRemoteAccountBalance(
  snapshot: Awaited<ReturnType<typeof getFinanceSnapshot>>,
  accountId: string,
  amount: number,
) {
  const balance = getAccountBalance(snapshot, accountId);
  if (balance < amount) throw new InsufficientBalanceError(amount - balance);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error.';
}

async function rollbackTransfer(transferId: number, transactionIds: number[], cause: unknown): Promise<never> {
  const rollbackErrors: string[] = [];
  for (const transactionId of transactionIds.reverse()) {
    try {
      if (!await transactionsApi.delete(transactionId)) {
        rollbackErrors.push(`Could not remove transfer charge ${transactionId}.`);
      }
    } catch (error) {
      rollbackErrors.push(errorMessage(error));
    }
  }
  try {
    if (!await transfersApi.delete(transferId)) rollbackErrors.push('Could not remove the incomplete transfer.');
  } catch (error) {
    rollbackErrors.push(errorMessage(error));
  }
  if (rollbackErrors.length) {
    throw new Error(`Could not finish the transfer: ${errorMessage(cause)} Rollback failed: ${rollbackErrors.join(' ')}`);
  }
  throw cause;
}

function normalizeListItems(draft: RecordDraft, notes: string): ListItem[] {
  return (draft.listItems ?? notes
    .split(/\r?\n|,/)
    .map((text) => ({ text, done: false, price: 0, quantity: 1 })))
    .map((item) => ({
      text: item.text.trim(),
      done: item.done,
      price: Number.isFinite(item.price) && item.price >= 0 ? item.price : 0,
      quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    }))
    .filter((item) => item.text.length > 0);
}

async function replaceListItems(
  listId: number,
  items: Array<ListItem & { position: number }>,
) {
  const existingItems = (await listItemsApi.list()).filter((item) => item.list_id === listId);
  for (const item of existingItems) {
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

async function saveListRecord(draft: RecordDraft, title: string, notes: string) {
  const items = normalizeListItems(draft, notes);
  const [listRows, allItems, eventRows] = await Promise.all([
    listsApi.list(),
    listItemsApi.list(),
    eventsApi.list(),
  ]);
  const previous = draft.id ? listRows.find((list) => list.id === draft.id) : undefined;

  if (draft.id && !previous) throw new Error('The list no longer exists.');
  if (previous?.finalized) throw new Error('Reopen the list before editing it.');

  const previousItems = previous
    ? allItems
      .filter((item) => item.list_id === previous.id)
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        position: item.position,
        text: item.text,
        done: item.done,
        price: item.price,
        quantity: item.quantity,
      }))
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
  if (!updated) throw new Error('The list no longer exists.');
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
      await replaceListItems(previous.id, previousItems);
    } catch (rollbackError) {
      throw new Error(`Could not save list items: ${errorMessage(error)} Rollback failed: ${errorMessage(rollbackError)}`);
    }
    throw error;
  }
}

// Save the requested record kind while keeping its domain-specific checks intact.
export async function saveRecord(
  kind: RecordKind,
  draft: RecordDraft,
) {
  const title = draft.title.trim();
  const category = draft.category.trim() || 'Personal';
  const notes = draft.notes?.trim() ?? '';

  if (kind === 'income') {
    if (!title) throw new Error('Enter an income title.');
    if (!INCOME_CATEGORIES.some((incomeCategory) => incomeCategory === category)) {
      throw new Error('Choose a valid income category.');
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Income amount must be greater than zero.');
    }
    const accountId = parseAccountId(draft.accountId, 'Choose the account receiving the income.');
    if (!(await accountsApi.list()).some((account) => String(account.id) === accountId)) {
      throw new Error('Choose a valid account.');
    }
    return transactionsApi.create({
      kind,
      title,
      category,
      amount,
      notes,
      account_id: accountId,
    });
  }

  if (kind === 'loan') {
    const principal = draft.amount ?? 0;
    const fees = draft.fees ?? 0;
    const accountId = parseAccountId(draft.accountId, 'Choose the account receiving the loan proceeds.');
    if (!Number.isFinite(principal) || principal <= 0) {
      throw new Error('Loan principal must be greater than zero.');
    }
    if (!Number.isFinite(fees) || fees < 0) {
      throw new Error('Loan interest or fees cannot be negative.');
    }
    if (!(await accountsApi.list()).some((account) => String(account.id) === accountId)) {
      throw new Error('Choose a valid account.');
    }
    const loan = await loansApi.create({
      lender: title,
      principal,
      fees,
      due_date: draft.dueDate || '',
      notes,
    });
    try {
      await transactionsApi.create({
        kind: 'income',
        title: `Loan from ${title}`,
        category: 'Loan',
        amount: principal,
        notes: notes || `Principal received from ${title}`,
        loan_id: loan.id,
        account_id: accountId,
        transfer_id: null,
        refund_of_transaction_id: null,
      });
    } catch (error) {
      try {
        if (!await loansApi.delete(loan.id)) throw new Error('Could not remove the incomplete loan.');
      } catch (rollbackError) {
        throw new Error(`Could not record loan proceeds: ${errorMessage(error)} Rollback failed: ${errorMessage(rollbackError)}`);
      }
      throw error;
    }
    return;
  }

  if (kind === 'loan-repayment') {
    const amount = draft.amount ?? 0;
    const loanId = draft.loanId;
    if (!loanId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Choose a loan and enter a repayment greater than zero.');
    }
    const accountId = parseAccountId(draft.accountId, 'Choose a loan and enter a repayment greater than zero.');
    const snapshot = await getFinanceSnapshot();
    const loan = snapshot.loans.find((row) => row.id === loanId);
    if (!loan) throw new Error('This loan no longer exists.');
    ensureRemoteAccountBalance(snapshot, accountId, amount);
    const repaid = snapshot.transactions.reduce((total, transaction) =>
      transaction.loan_id === loanId && transaction.kind === 'expense'
        ? total + transaction.amount
        : total,
      0);
    const outstanding = loan.principal + loan.fees - repaid;
    if (amount > outstanding) {
      throw new Error(`Repayment cannot exceed the outstanding ${ugxFormatter.format(outstanding)} UGX.`);
    }
    await transactionsApi.create({
      kind: 'expense',
      title: `Loan repayment · ${loan.lender}`,
      category: 'Loan repayment',
      amount,
      notes,
      loan_id: loanId,
      account_id: accountId,
      transfer_id: null,
      refund_of_transaction_id: null,
    });
    return;
  }

  if (kind === 'transfer') {
    const amount = draft.amount ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a transfer amount greater than zero.');
    const fromAccountId = parseAccountId(draft.fromAccountId, 'Choose two different accounts for this transfer.');
    const toAccountId = parseAccountId(draft.toAccountId, 'Choose two different accounts for this transfer.');
    if (fromAccountId === toAccountId) {
      throw new Error('Choose two different accounts for this transfer.');
    }
    const snapshot = await getFinanceSnapshot();
    const source = snapshot.accounts.find((account) => String(account.id) === fromAccountId);
    const destination = snapshot.accounts.find((account) => String(account.id) === toAccountId);
    if (!source || !destination) throw new Error('Choose valid source and destination accounts.');
    const charges = getTransferCharges(source.type, destination.type);
    const chargeTotal = charges.reduce((total, charge) => total + charge.amount, 0);
    ensureRemoteAccountBalance(snapshot, fromAccountId, amount + chargeTotal);

    const transfer = await transfersApi.create({
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      amount,
      notes,
    });
    const createdChargeIds: number[] = [];
    try {
      for (const charge of charges) {
        const transaction = await transactionsApi.create({
          kind: 'expense',
          title: charge.label,
          category: 'Fees and charges',
          amount: charge.amount,
          notes: `${source.name} to ${destination.name} transfer.`,
          loan_id: null,
          account_id: fromAccountId,
          transfer_id: transfer.id,
          refund_of_transaction_id: null,
        });
        createdChargeIds.push(transaction.id);
      }
    } catch (error) {
      await rollbackTransfer(transfer.id, createdChargeIds, error);
    }
    return;
  }

  if (kind === 'event') {
    if (draft.id) {
      if (!await eventsApi.update(draft.id, { title, category, date: draft.date || today(), notes })) {
        throw new Error('This event no longer exists.');
      }
      return;
    }
    await eventsApi.create({ title, category, date: draft.date || today(), notes });
    return;
  }

  if (kind === 'task') {
    if (draft.id) {
      if (!await tasksApi.update(draft.id, { title, category, date: draft.date || today(), notes })) {
        throw new Error('This task no longer exists.');
      }
      return;
    }
    await tasksApi.create({ title, category, date: draft.date || today(), notes });
    return;
  }

  if (kind === 'note') {
    const note = {
      title,
      category,
      notes,
      updated_at: currentTimestamp(),
    };
    if (draft.id) {
      if (!await notesApi.update(draft.id, note)) throw new Error('This note no longer exists.');
    } else {
      await notesApi.create(note);
    }
    return;
  }

  await saveListRecord(draft, title, notes);
}

export async function deleteRecord(
  table: 'transactions' | 'events' | 'tasks' | 'notes' | 'lists',
  id: number,
) {
  const recordTypes: LinkedRecordType[] = table === 'lists'
    ? ['list', 'budget']
    : [table === 'transactions' ? 'transaction' : table === 'events' ? 'event' : table === 'tasks' ? 'task' : 'note'];
  const detachReferences = (type: LinkedRecordType, recordId: number) =>
    detachRecordReferences(type, recordId);
  if (table === 'lists') {
    const [lists, transactions, allocations, periodItems, periods, refunds] = await Promise.all([
      listsApi.list(),
      transactionsApi.list(),
      budgetsApi.transactionAllocations.list(),
      budgetsApi.periodItems.list(),
      budgetsApi.periods.list(),
      budgetsApi.transactionRefunds.list(),
    ]);
    const list = lists.find((row) => row.id === id);
    if (!list) throw new Error('This list no longer exists.');
    const transaction = list.final_transaction_id === null
      ? undefined
      : transactions.find((row) => row.id === list.final_transaction_id);
    if (transaction?.refund_of_transaction_id !== null && transaction?.refund_of_transaction_id !== undefined) {
      throw new Error('This budget expense has a refund. Keep the list and its accounting history.');
    }
    if (transaction) {
      const closedPeriodIds = new Set(periods.filter((period) => period.status === 'closed').map((period) => period.id));
      const closedPeriodItemIds = new Set(periodItems
        .filter((item) => closedPeriodIds.has(item.period_id))
        .map((item) => item.id));
      const closedAllocation = allocations.some((allocation) =>
        allocation.transaction_id === transaction.id
        && allocation.period_item_id !== null
        && closedPeriodItemIds.has(allocation.period_item_id));
      if (closedAllocation) {
        throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
      }
      if (refunds.some((refund) => refund.original_transaction_id === transaction.id)) {
        throw new Error('This expense has a linked refund. Keep it to preserve the accounting history.');
      }
      await detachReferences('transaction', transaction.id);
      for (const allocation of allocations.filter((row) => row.transaction_id === transaction.id)) {
        await budgetsApi.transactionAllocations.delete(allocation.id);
      }
      if (!await transactionsApi.delete(transaction.id)) {
        throw new Error('This budget expense no longer exists.');
      }
    }
    for (const type of recordTypes) await detachReferences(type, id);
    if (!await listsApi.delete(id)) throw new Error('This list no longer exists.');
    return;
  }
  if (table === 'events') {
    await detachReferences('event', id);
    const lists = await listsApi.list();
    for (const list of lists.filter((row) => row.event_id === id)) {
      await listsApi.update(list.id, { event_id: null });
    }
    if (!await eventsApi.delete(id)) throw new Error('This event no longer exists.');
    return;
  }
  if (table === 'transactions') {
    const [transactions, refunds, allocations, periodItems, periods] = await Promise.all([
      transactionsApi.list(),
      budgetsApi.transactionRefunds.list(),
      budgetsApi.transactionAllocations.list(),
      budgetsApi.periodItems.list(),
      budgetsApi.periods.list(),
    ]);
    const transaction = transactions.find((row) => row.id === id);
    if (!transaction) throw new Error('This transaction no longer exists.');
    if (transaction.refund_of_transaction_id !== null) {
      throw new Error('Refund records are part of the accounting history and cannot be deleted.');
    }
    if (refunds.some((refund) => refund.original_transaction_id === id)) {
      throw new Error('This expense has a linked refund. Keep it to preserve the accounting history.');
    }
    const periodByItemId = new Map(periodItems.map((item) => [item.id, item.period_id]));
    const closedPeriodIds = new Set(periods.filter((period) => period.status === 'closed').map((period) => period.id));
    const closedAllocation = allocations.some((allocation) =>
      allocation.transaction_id === id
      && allocation.period_item_id !== null
      && closedPeriodIds.has(periodByItemId.get(allocation.period_item_id) ?? -1));
    if (closedAllocation) {
      throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
    }
    if (transaction.kind === 'income' && transaction.account_id !== null) {
      await ensureAccountBalance(transaction.account_id, transaction.amount);
    }
    await detachReferences('transaction', id);
    for (const allocation of allocations.filter((row) => row.transaction_id === id)) {
      await budgetsApi.transactionAllocations.delete(allocation.id);
    }
    if (!await transactionsApi.delete(id)) throw new Error('This transaction no longer exists.');
    return;
  }
  for (const type of recordTypes) await detachReferences(type, id);
  const removed = table === 'tasks'
    ? await tasksApi.delete(id)
    : await notesApi.delete(id);
  if (!removed) throw new Error(`This ${table === 'tasks' ? 'task' : 'note'} no longer exists.`);
}

export async function toggleTask(id: number, completed: boolean) {
  const updated = await tasksApi.update(id, {
    completed: !completed,
    completed_at: completed ? null : currentTimestamp(),
  });
  if (!updated) throw new Error('This task no longer exists or has already changed.');
}

async function detachRecordReferences(
  type: LinkedRecordType,
  recordId: number,
) {
  const [links, reminders, inboxItems] = await Promise.all([
    recordLinksApi.list(),
    remindersApi.list(),
    inboxItemsApi.list(),
  ]);
  for (const link of links.filter((row) =>
    (row.source_type === type && row.source_id === recordId)
    || (row.target_type === type && row.target_id === recordId),
  )) {
    await recordLinksApi.delete(link.id);
  }
  for (const reminder of reminders.filter((row) =>
    row.related_type === type && row.related_id === recordId,
  )) {
    await remindersApi.update(reminder.id, { related_type: null, related_id: null });
  }
  for (const item of inboxItems.filter((row) =>
    row.destination_type === type && row.destination_id === recordId,
  )) {
    await inboxItemsApi.update(item.id, {
      destination_type: null,
      destination_id: null,
      status: item.status === 'linked' ? 'inbox' : item.status,
    });
  }
}
