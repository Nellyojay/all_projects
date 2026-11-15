import type { BrowserDatabase } from '../web/database';
import { EXPENSE_CATEGORIES } from '../constants/finance';
import {
  currentTimestamp,
  type Account,
  type ExpenseDraft,
  InsufficientBalanceError,
  parseAccountId,
  type Transfer,
} from './database_types';
import { budgetCoversDate, today } from './budget_database';
import { budgetsApi } from '../../../api/budgets.api';
import { accountsApi, transactionsApi, transfersApi } from '../../../api/finance.api';

// Fetch account balances using transactions and transfers through today.
export async function getAccounts(database: BrowserDatabase) {
  const accounts = await database.getAllAsync<Omit<Account, 'id'> & { id: number }>(
    `SELECT accounts.*,
      accounts.opening_balance
        + COALESCE((SELECT SUM(CASE WHEN transactions.kind = 'income' THEN transactions.amount ELSE -transactions.amount END)
          FROM transactions WHERE transactions.account_id = accounts.id AND transactions.date <= ?), 0)
        + COALESCE((SELECT SUM(transfers.amount) FROM transfers WHERE transfers.to_account_id = accounts.id AND transfers.date <= ?), 0)
        - COALESCE((SELECT SUM(transfers.amount) FROM transfers WHERE transfers.from_account_id = accounts.id AND transfers.date <= ?), 0) AS balance
     FROM accounts ORDER BY is_default DESC, name COLLATE NOCASE`,
    today(),
    today(),
    today(),
  );
  return accounts.map((account) => ({ ...account, id: String(account.id) }));
}

export async function createAccount(
  account: { name: string; type: string; openingBalance: number; userId: string },
) {
  const name = account.name.trim();
  if (!name) throw new Error('Enter an account name.');
  if (!Number.isFinite(account.openingBalance) || account.openingBalance < 0) {
    throw new Error('Opening balance must be zero or more.');
  }

  await accountsApi.create({
    name,
    type: account.type,
    opening_balance: account.openingBalance,
  });
}

export async function ensureAccountBalance(database: BrowserDatabase, accountId: string, amount: number) {
  const accounts = await getAccounts(database);
  const account = accounts.find((item) => item.id === String(accountId));
  if (!account) throw new Error('Choose a valid account.');
  if (account.balance < amount) {
    throw new InsufficientBalanceError(amount - account.balance);
  }
}

export type SupabaseAllocatableBudgetItem = {
  id: number;
  budget_id: number;
  period_item_id: number | null;
  name: string;
  actual_amount: number;
  budget_type: 'normal' | 'recurring';
  template_name: string;
};

export async function getSupabaseAllocatableBudgetItems(date = today()) {
  const [budgets, items, allocations, refunds, transactions, legacyItemMap] = await Promise.all([
    budgetsApi.budgets.list(),
    budgetsApi.budgetItems.list(),
    budgetsApi.transactionAllocations.list(),
    budgetsApi.itemRefundAllocations.list(),
    transactionsApi.list(),
    budgetsApi.legacyBudgetItemMap.list(),
  ]);
  const eligibleBudgets = new Map(
    budgets
      .filter((budget) =>
        ['active', 'awaiting_review'].includes(budget.status)
        && budgetCoversDate(budget.type, budget.start_date, budget.end_date, date),
      )
      .map((budget) => [budget.id, budget]),
  );
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const actualAmounts = new Map<number, number>();
  for (const allocation of allocations) {
    if (allocation.budget_item_id === null) continue;
    const transaction = transactionsById.get(allocation.transaction_id);
    if (!transaction || transaction.kind !== 'expense' || transaction.loan_id !== null
      || transaction.transfer_id !== null || transaction.refund_of_transaction_id !== null) continue;
    actualAmounts.set(
      allocation.budget_item_id,
      (actualAmounts.get(allocation.budget_item_id) ?? 0) + allocation.amount,
    );
  }
  for (const refund of refunds) {
    actualAmounts.set(
      refund.budget_item_id,
      (actualAmounts.get(refund.budget_item_id) ?? 0) - refund.amount,
    );
  }
  const periodItemIds = new Map(legacyItemMap.map((item) => [item.budget_item_id, item.period_item_id]));

  return items
    .filter((item) => eligibleBudgets.has(item.budget_id))
    .sort((left, right) => {
      const leftBudget = eligibleBudgets.get(left.budget_id);
      const rightBudget = eligibleBudgets.get(right.budget_id);
      return (leftBudget?.name ?? '').localeCompare(rightBudget?.name ?? '')
        || left.position - right.position
        || left.id - right.id;
    })
    .map((item) => {
      const budget = eligibleBudgets.get(item.budget_id);
      if (!budget) throw new Error('An active budget item has no budget.');
      return {
        id: item.id,
        budget_id: item.budget_id,
        period_item_id: periodItemIds.get(item.id) ?? null,
        name: item.name,
        actual_amount: actualAmounts.get(item.id) ?? 0,
        budget_type: budget.type,
        template_name: budget.name,
      };
    });
}

export async function saveExpense(draft: ExpenseDraft) {
  const title = draft.title.trim();
  const category = draft.category.trim();
  const notes = draft.notes.trim();
  if (!title) throw new Error('Enter an expense title.');
  if (!EXPENSE_CATEGORIES.some((expenseCategory) => expenseCategory === category)) {
    throw new Error('Choose a valid expense category.');
  }
  const accountId = parseAccountId(draft.accountId, 'Choose the account paying for this expense.');
  if (!draft.items.length || draft.items.some((item) =>
    !item.text.trim()
    || !Number.isFinite(item.price)
    || item.price < 0
    || !Number.isInteger(item.quantity)
    || item.quantity < 1
  )) {
    throw new Error('Add expense items with valid quantities and unit prices.');
  }

  const amount = draft.items.reduce((total, item) => total + item.price * item.quantity, 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('The expense total must be greater than zero.');
  }
  const budgetAllocations = draft.budgetAllocations ?? [];
  if (budgetAllocations.some((allocation) =>
    !Number.isSafeInteger(allocation.amount) || allocation.amount <= 0
    || !Number.isSafeInteger(allocation.budgetItemId) || allocation.budgetItemId < 1
  )) {
    throw new Error('Budget allocation amounts must be positive whole numbers.');
  }
  if (new Set(budgetAllocations.map((allocation) => allocation.budgetItemId)).size !== budgetAllocations.length) {
    throw new Error('Allocate each expense to a budget item only once.');
  }
  if (budgetAllocations.reduce((total, allocation) => total + allocation.amount, 0) > amount) {
    throw new Error('Budget item allocations cannot exceed the expense total.');
  }

  const allocatableItems = budgetAllocations.length
    ? await getSupabaseAllocatableBudgetItems()
    : [];
  const allocatableItemsById = new Map(allocatableItems.map((item) => [item.id, item]));
  for (const allocation of budgetAllocations) {
    if (!allocatableItemsById.has(allocation.budgetItemId)) {
      throw new Error('Choose an active budget item that covers today.');
    }
  }

  const [accounts, transactions, transfers] = await Promise.all([
    accountsApi.list(),
    transactionsApi.list(),
    transfersApi.list(),
  ]);
  const account = accounts.find((row) => String(row.id) === accountId);
  if (!account) throw new Error('Choose a valid account.');
  const asOf = today();
  const transactionBalance = transactions.reduce((total, transaction) => {
    if (transaction.account_id !== accountId || transaction.date > asOf) return total;
    return total + (transaction.kind === 'income' ? transaction.amount : -transaction.amount);
  }, 0);
  const transferBalance = transfers.reduce((total, transfer) => {
    if (transfer.date > asOf) return total;
    if (transfer.to_account_id === accountId) return total + transfer.amount;
    if (transfer.from_account_id === accountId) return total - transfer.amount;
    return total;
  }, 0);
  const availableBalance = account.opening_balance + transactionBalance + transferBalance;
  if (availableBalance < amount) {
    throw new InsufficientBalanceError(amount - availableBalance);
  }

  const itemDetails = draft.items.map((item) =>
    `${item.quantity} × ${item.text.trim()} · UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(item.price)} each`,
  ).join('\n');
  const transactionNotes = [notes, `Items:\n${itemDetails}`].filter(Boolean).join('\n\n');
  const transaction = await transactionsApi.create({
    kind: 'expense',
    title,
    category,
    amount,
    notes: transactionNotes,
    loan_id: null,
    account_id: accountId,
    transfer_id: null,
    refund_of_transaction_id: null,
  });
  const createdAllocationIds: number[] = [];
  try {
    for (const allocation of budgetAllocations) {
      const budgetItem = allocatableItemsById.get(allocation.budgetItemId);
      if (!budgetItem) throw new Error('Choose an active budget item that covers today.');
      const createdAllocation = await budgetsApi.transactionAllocations.create({
        transaction_id: transaction.id,
        budget_id: budgetItem.budget_id,
        budget_item_id: budgetItem.id,
        period_item_id: budgetItem.period_item_id,
        amount: allocation.amount,
        created_at: currentTimestamp(),
      });
      createdAllocationIds.push(createdAllocation.id);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const allocationId of createdAllocationIds.reverse()) {
      try {
        if (!await budgetsApi.transactionAllocations.delete(allocationId)) {
          rollbackErrors.push(`Could not remove budget allocation ${allocationId}.`);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : 'Unknown allocation rollback error.');
      }
    }
    try {
      if (!await transactionsApi.delete(transaction.id)) {
        rollbackErrors.push('Could not remove the incomplete expense.');
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : 'Unknown expense rollback error.');
    }
    if (rollbackErrors.length) {
      throw new Error(`Could not save budget allocations: ${error instanceof Error ? error.message : 'Unknown error.'} Rollback failed: ${rollbackErrors.join(' ')}`);
    }
    throw error;
  }
}

type TransferRow = Omit<Transfer, 'charges' | 'from_account_id' | 'to_account_id'> & {
  from_account_id: number;
  to_account_id: number;
};

async function attachTransferCharges(database: BrowserDatabase, transfers: TransferRow[]) {
  if (!transfers.length) return [];
  const transferIds = transfers.map((transfer) => transfer.id);
  const placeholders = transferIds.map(() => '?').join(', ');
  const charges = await database.getAllAsync<{
    transfer_id: number;
    title: string;
    amount: number;
  }>(
    `SELECT transfer_id, title, amount
     FROM transactions
     WHERE transfer_id IN (${placeholders}) AND category = 'Fees and charges'
     ORDER BY id`,
    ...transferIds,
  );
  const chargesByTransfer = new Map<number, { title: string; amount: number }[]>();
  for (const charge of charges) {
    const transferCharges = chargesByTransfer.get(charge.transfer_id) ?? [];
    transferCharges.push({ title: charge.title, amount: charge.amount });
    chargesByTransfer.set(charge.transfer_id, transferCharges);
  }
  return transfers.map((transfer) => ({
    ...transfer,
    from_account_id: String(transfer.from_account_id),
    to_account_id: String(transfer.to_account_id),
    charges: chargesByTransfer.get(transfer.id) ?? [],
  }));
}

export async function getTransfers(database: BrowserDatabase) {
  const transfers = await database.getAllAsync<TransferRow>(
    `SELECT transfers.*, source.name AS from_account_name, destination.name AS to_account_name
     FROM transfers
     JOIN accounts AS source ON source.id = transfers.from_account_id
     JOIN accounts AS destination ON destination.id = transfers.to_account_id
     ORDER BY transfers.date DESC, transfers.id DESC LIMIT 50`,
  );
  return attachTransferCharges(database, transfers);
}

export async function getTransferById(database: BrowserDatabase, id: number) {
  const transfer = await database.getFirstAsync<TransferRow>(
    `SELECT transfers.*, source.name AS from_account_name, destination.name AS to_account_name
     FROM transfers
     JOIN accounts AS source ON source.id = transfers.from_account_id
     JOIN accounts AS destination ON destination.id = transfers.to_account_id
     WHERE transfers.id = ?`,
    id,
  );
  if (!transfer) return null;
  return (await attachTransferCharges(database, [transfer]))[0];
}












