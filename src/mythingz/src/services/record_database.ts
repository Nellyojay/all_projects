import type { BrowserDatabase } from '../web/database';
import { INCOME_CATEGORIES } from '../constants/finance';
import {
  currentTimestamp,
  getTransferCharges,
  ugxFormatter,
  type LinkedRecordType,
  type RecordDraft,
  type RecordKind,
} from './database_types';
import { today } from './budget_database';
import { ensureAccountBalance } from './finance_database';
import { saveList } from './list_database';
import { saveNote } from './note_database';

// Save the requested record kind while keeping its domain-specific checks intact.
export async function saveRecord(
  database: BrowserDatabase,
  kind: RecordKind,
  draft: RecordDraft,
) {
  const title = draft.title.trim();
  const category = draft.category.trim() || 'Personal';
  const notes = draft.notes?.trim() ?? '';

  if (kind === 'income') {
    if (!INCOME_CATEGORIES.some((incomeCategory) => incomeCategory === category)) {
      throw new Error('Choose a valid income category.');
    }
    const accountId = draft.accountId;
    if (!accountId) throw new Error('Choose the account receiving this income.');
    if (draft.id) {
      const id = draft.id;
      const amount = draft.amount ?? 0;
      await database.withTransactionAsync(async () => {
        const current = await database.getFirstAsync<{ amount: number; account_id: number | null }>(
          'SELECT amount, account_id FROM transactions WHERE id = ? AND kind = ?',
          id,
          kind,
        );
        if (current && current.account_id === accountId && current.amount > amount) {
          await ensureAccountBalance(database, accountId, current.amount - amount);
        } else if (current && current.account_id !== accountId) {
          if (current.account_id !== null) await ensureAccountBalance(database, current.account_id, current.amount);
          await ensureAccountBalance(database, accountId, 0);
        }
        await database.runAsync(
          'UPDATE transactions SET title = ?, category = ?, amount = ?, date = ?, notes = ?, account_id = ? WHERE id = ? AND kind = ?',
          title,
          category,
          amount,
          today(),
          notes,
          accountId,
          id,
          kind,
        );
      });
      return;
    }
    await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      kind,
      title,
      category,
      draft.amount ?? 0,
      today(),
      notes,
      accountId,
    );
    return;
  }

  if (kind === 'loan') {
    const principal = draft.amount ?? 0;
    const fees = draft.fees ?? 0;
    const accountId = draft.accountId;
    if (!accountId) throw new Error('Choose the account receiving the loan proceeds.');
    if (!Number.isFinite(principal) || principal <= 0) {
      throw new Error('Loan principal must be greater than zero.');
    }
    if (!Number.isFinite(fees) || fees < 0) {
      throw new Error('Loan interest or fees cannot be negative.');
    }
    await database.withTransactionAsync(async () => {
      const loan = await database.runAsync(
        'INSERT INTO loans (lender, principal, fees, due_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        title,
        principal,
        fees,
        draft.dueDate || '',
        notes,
        today(),
      );
      await database.runAsync(
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'income',
        `Loan from ${title}`,
        'Loan',
        principal,
        today(),
        notes || `Principal received from ${title}`,
        loan.lastInsertRowId,
        accountId,
      );
    });
    return;
  }

  if (kind === 'loan-repayment') {
    const amount = draft.amount ?? 0;
    const loanId = draft.loanId;
    const accountId = draft.accountId;
    if (!loanId || !accountId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Choose a loan and enter a repayment greater than zero.');
    }
    await database.withTransactionAsync(async () => {
      const loan = await database.getFirstAsync<{ lender: string; principal: number; fees: number }>(
        'SELECT lender, principal, fees FROM loans WHERE id = ?',
        loanId,
      );
      if (!loan) throw new Error('This loan no longer exists.');
      await ensureAccountBalance(database, accountId, amount);
      const repayments = await database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE loan_id = ? AND kind = 'expense'",
        loanId,
      );
      const outstanding = loan.principal + loan.fees - (repayments?.total ?? 0);
      if (amount > outstanding) {
        throw new Error(`Repayment cannot exceed the outstanding ${ugxFormatter.format(outstanding)} UGX.`);
      }
      await database.runAsync(
        'INSERT INTO transactions (kind, title, category, amount, date, notes, loan_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'expense',
        `Loan repayment · ${loan.lender}`,
        'Loan repayment',
        amount,
        today(),
        notes,
        loanId,
        accountId,
      );
    });
    return;
  }

  if (kind === 'transfer') {
    const amount = draft.amount ?? 0;
    const fromAccountId = draft.fromAccountId;
    const toAccountId = draft.toAccountId;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a transfer amount greater than zero.');
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      throw new Error('Choose two different accounts for this transfer.');
    }
    await database.withTransactionAsync(async () => {
      const source = await database.getFirstAsync<{ name: string; type: string }>(
        'SELECT name, type FROM accounts WHERE id = ?',
        fromAccountId,
      );
      const destination = await database.getFirstAsync<{ name: string; type: string }>(
        'SELECT name, type FROM accounts WHERE id = ?',
        toAccountId,
      );
      if (!source || !destination) throw new Error('Choose valid source and destination accounts.');
      const charges = getTransferCharges(source.type, destination.type);
      const chargeTotal = charges.reduce((total, charge) => total + charge.amount, 0);
      await ensureAccountBalance(database, fromAccountId, amount + chargeTotal);
      const transfer = await database.runAsync(
        'INSERT INTO transfers (from_account_id, to_account_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
        fromAccountId,
        toAccountId,
        amount,
        today(),
        notes,
      );
      for (const charge of charges) {
        await database.runAsync(
          'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id, transfer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'expense',
          `${charge.label}`,
          'Fees and charges',
          charge.amount,
          today(),
          `${source.name} to ${destination.name} transfer.`,
          fromAccountId,
          transfer.lastInsertRowId,
        );
      }
    });
    return;
  }

  if (kind === 'event') {
    if (draft.id) {
      await database.runAsync(
        'UPDATE events SET title = ?, category = ?, date = ?, notes = ? WHERE id = ?',
        title,
        category,
        draft.date || today(),
        notes,
        draft.id,
      );
      return;
    }
    await database.runAsync(
      'INSERT INTO events (title, category, date, notes) VALUES (?, ?, ?, ?)',
      title,
      category,
      draft.date || today(),
      notes,
    );
    return;
  }

  if (kind === 'task') {
    if (draft.id) {
      await database.runAsync(
        'UPDATE tasks SET title = ?, category = ?, date = ?, notes = ? WHERE id = ?',
        title,
        category,
        draft.date || today(),
        notes,
        draft.id,
      );
      return;
    }
    await database.runAsync(
      'INSERT INTO tasks (title, category, date, notes) VALUES (?, ?, ?, ?)',
      title,
      category,
      draft.date || today(),
      notes,
    );
    return;
  }

  if (kind === 'note') {
    await saveNote(database, { id: draft.id, title, category, content: notes });
    return;
  }

  await saveList(database, draft, title, notes);
}

export async function deleteRecord(
  database: BrowserDatabase,
  table: 'transactions' | 'events' | 'tasks' | 'notes' | 'lists',
  id: number,
) {
  const recordTypes: LinkedRecordType[] = table === 'lists'
    ? ['list', 'budget']
    : [table === 'transactions' ? 'transaction' : table === 'events' ? 'event' : table === 'tasks' ? 'task' : 'note'];
  const detachReferences = (type: LinkedRecordType, recordId: number) =>
    detachRecordReferences(database, type, recordId);
  if (table === 'lists') {
    await database.withTransactionAsync(async () => {
      const list = await database.getFirstAsync<{ final_transaction_id: number | null; refund_of_transaction_id: number | null }>(
        `SELECT lists.final_transaction_id, transactions.refund_of_transaction_id
         FROM lists LEFT JOIN transactions ON transactions.id = lists.final_transaction_id
         WHERE lists.id = ?`,
        id,
      );
      if (list?.final_transaction_id) {
        if (list.refund_of_transaction_id !== null) {
          throw new Error('This budget expense has a refund. Keep the list and its accounting history.');
        }
        const closedAllocation = await database.getFirstAsync<{ id: number }>(
          `SELECT periods.id
           FROM transaction_allocations allocations
           JOIN budget_period_items items ON items.id = allocations.period_item_id
           JOIN budget_periods periods ON periods.id = items.period_id
           WHERE allocations.transaction_id = ? AND periods.status = 'closed'
           LIMIT 1`,
          list.final_transaction_id,
        );
        if (closedAllocation) {
          throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
        }
        await detachReferences('transaction', list.final_transaction_id);
        await database.runAsync(
          'DELETE FROM transaction_allocations WHERE transaction_id = ?',
          list.final_transaction_id,
        );
        await database.runAsync('DELETE FROM transactions WHERE id = ?', list.final_transaction_id);
      }
      for (const type of recordTypes) await detachReferences(type, id);
      await database.runAsync('DELETE FROM lists WHERE id = ?', id);
    });
    return;
  }
  if (table === 'events') {
    await database.withTransactionAsync(async () => {
      await detachReferences('event', id);
      await database.runAsync('UPDATE lists SET event_id = NULL WHERE event_id = ?', id);
      await database.runAsync('DELETE FROM events WHERE id = ?', id);
    });
    return;
  }
  if (table === 'transactions') {
    await database.withTransactionAsync(async () => {
      const transaction = await database.getFirstAsync<{
        kind: string;
        amount: number;
        account_id: number | null;
        refund_of_transaction_id: number | null;
      }>(
        'SELECT kind, amount, account_id, refund_of_transaction_id FROM transactions WHERE id = ?',
        id,
      );
      if (transaction?.refund_of_transaction_id !== null && transaction?.refund_of_transaction_id !== undefined) {
        throw new Error('Refund records are part of the accounting history and cannot be deleted.');
      }
      const linkedRefund = await database.getFirstAsync<{ id: number }>(
        'SELECT id FROM transaction_refunds WHERE original_transaction_id = ? LIMIT 1',
        id,
      );
      if (linkedRefund) throw new Error('This expense has a linked refund. Keep it to preserve the accounting history.');
      const closedAllocation = await database.getFirstAsync<{ id: number }>(
        `SELECT periods.id
         FROM transaction_allocations allocations
         JOIN budget_period_items items ON items.id = allocations.period_item_id
         JOIN budget_periods periods ON periods.id = items.period_id
         WHERE allocations.transaction_id = ? AND periods.status = 'closed'
         LIMIT 1`,
        id,
      );
      if (closedAllocation) {
        throw new Error('Reopen the closed budget period before deleting this expense so its history is corrected intentionally.');
      }
      if (transaction?.kind === 'income' && transaction.account_id !== null) {
        await ensureAccountBalance(database, transaction.account_id, transaction.amount);
      }
      await detachReferences('transaction', id);
      await database.runAsync('DELETE FROM transaction_allocations WHERE transaction_id = ?', id);
      await database.runAsync('DELETE FROM transactions WHERE id = ?', id);
    });
    return;
  }
  await database.withTransactionAsync(async () => {
    for (const type of recordTypes) await detachReferences(type, id);
    await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
  });
}

export async function toggleTask(database: BrowserDatabase, id: number, completed: boolean) {
  const nextCompleted = completed ? 0 : 1;
  const result = await database.runAsync(
    'UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ? AND completed = ?',
    nextCompleted,
    nextCompleted ? currentTimestamp() : null,
    id,
    completed ? 1 : 0,
  );
  if (!result.changes) throw new Error('This task no longer exists or has already changed.');
}

async function detachRecordReferences(
  database: BrowserDatabase,
  type: LinkedRecordType,
  recordId: number,
) {
  await database.runAsync(
    `DELETE FROM record_links
     WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)`,
    type,
    recordId,
    type,
    recordId,
  );
  await database.runAsync(
    'UPDATE reminders SET related_type = NULL, related_id = NULL WHERE related_type = ? AND related_id = ?',
    type,
    recordId,
  );
  await database.runAsync(
    `UPDATE inbox_items
     SET destination_type = NULL, destination_id = NULL,
         status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
     WHERE destination_type = ? AND destination_id = ?`,
    type,
    recordId,
  );
}
