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

// Load account balances from Supabase's transaction-maintained balance column.
export async function getAccounts() {
  const rows = await accountsApi.list();
  return rows
    .map((account): Account => ({
      id: String(account.id),
      name: account.name,
      type: account.type,
      opening_balance: account.opening_balance,
      current_balance: account.current_balance,
      is_default: Number(account.is_default),
      balance: account.opening_balance + account.current_balance,
    }))
    .sort((left, right) =>
      right.is_default - left.is_default || left.name.localeCompare(right.name));
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
    current_balance: 0,
  });
}

export async function ensureAccountBalance(accountId: string, amount: number) {
  const accounts = await getAccounts();
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
    account_id: accountId,
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

type TransferRow = Omit<Transfer, 'charges'>;

async function attachTransferCharges(transfers: TransferRow[]) {
  if (!transfers.length) return [];
  const transferIds = new Set(transfers.map((transfer) => transfer.id));
  const charges = (await transactionsApi.list())
    .filter((transaction) =>
      transaction.transfer_id !== null
      && transferIds.has(transaction.transfer_id)
      && transaction.category === 'Fees and charges',
    )
    .sort((left, right) => left.id - right.id);
  const chargesByTransfer = new Map<number, { title: string; amount: number }[]>();
  for (const charge of charges) {
    if (charge.transfer_id === null) continue;
    const transferCharges = chargesByTransfer.get(charge.transfer_id) ?? [];
    transferCharges.push({ title: charge.title, amount: charge.amount });
    chargesByTransfer.set(charge.transfer_id, transferCharges);
  }
  return transfers.map((transfer) => ({
    ...transfer,
    charges: chargesByTransfer.get(transfer.id) ?? [],
  }));
}

export async function getTransfers() {
  const [transferRows, accountRows] = await Promise.all([
    transfersApi.list(),
    accountsApi.list(),
  ]);
  const accountsById = new Map(accountRows.map((account) => [String(account.id), account.name]));
  const transfers = transferRows
    .map((transfer): TransferRow => ({
      ...transfer,
      from_account_name: accountsById.get(transfer.from_account_id) ?? '',
      to_account_name: accountsById.get(transfer.to_account_id) ?? '',
    }))
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
    .slice(0, 50);
  return attachTransferCharges(transfers);
}

export async function getTransferById(id: number) {
  const [transferRows, accountRows] = await Promise.all([
    transfersApi.list(),
    accountsApi.list(),
  ]);
  const row = transferRows.find((transfer) => transfer.id === id);
  if (!row) return null;
  const accountsById = new Map(accountRows.map((account) => [String(account.id), account.name]));
  const transfer: TransferRow = {
    ...row,
    from_account_name: accountsById.get(row.from_account_id) ?? '',
    to_account_name: accountsById.get(row.to_account_id) ?? '',
  };
  return (await attachTransferCharges([transfer]))[0];
}












