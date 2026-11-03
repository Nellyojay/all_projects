import type { BrowserDatabase } from '../web/database';
import { EXPENSE_CATEGORIES } from '../constants/finance';
import {
  type Account,
  type ExpenseDraft,
  InsufficientBalanceError,
  type Transfer,
} from './database_types';
import { allocateTransactionToBudgets, today } from './budget_database';

// Fetch account balances using transactions and transfers through today.
export async function getAccounts(database: BrowserDatabase) {
  return database.getAllAsync<Account>(
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
}

export async function createAccount(
  database: BrowserDatabase,
  account: { name: string; type: string; openingBalance: number },
) {
  const name = account.name.trim();
  if (!name) throw new Error('Enter an account name.');
  if (!Number.isFinite(account.openingBalance) || account.openingBalance < 0) {
    throw new Error('Opening balance must be zero or more.');
  }
  await database.runAsync(
    'INSERT INTO accounts (name, type, opening_balance) VALUES (?, ?, ?)',
    name,
    account.type,
    account.openingBalance,
  );
}

export async function ensureAccountBalance(database: BrowserDatabase, accountId: number, amount: number) {
  const accounts = await getAccounts(database);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('Choose a valid account.');
  if (account.balance < amount) {
    throw new InsufficientBalanceError(amount - account.balance);
  }
}

export async function saveExpense(database: BrowserDatabase, draft: ExpenseDraft) {
  const title = draft.title.trim();
  const category = draft.category.trim();
  const notes = draft.notes.trim();
  if (!title) throw new Error('Enter an expense title.');
  if (!EXPENSE_CATEGORIES.some((expenseCategory) => expenseCategory === category)) {
    throw new Error('Choose a valid expense category.');
  }
  if (!draft.accountId) throw new Error('Choose the account paying for this expense.');
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
  const itemDetails = draft.items.map((item) =>
    `${item.quantity} × ${item.text.trim()} · UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(item.price)} each`,
  ).join('\n');
  const transactionNotes = [notes, `Items:\n${itemDetails}`].filter(Boolean).join('\n\n');
  const date = today();

  await database.withTransactionAsync(async () => {
    await ensureAccountBalance(database, draft.accountId, amount);
    const transaction = await database.runAsync(
      'INSERT INTO transactions (kind, title, category, amount, date, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'expense',
      title,
      category,
      amount,
      date,
      transactionNotes,
      draft.accountId,
    );
    await allocateTransactionToBudgets(
      database,
      transaction.lastInsertRowId,
      draft.budgetAllocations ?? [],
      amount,
    );
  });
}

type TransferRow = Omit<Transfer, 'charges'>;

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












