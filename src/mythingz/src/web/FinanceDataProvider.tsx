import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  accountsApi,
  loansApi,
  transactionsApi,
  transfersApi,
} from '../../../api/finance.api';
import { useSupabaseAuth } from '../../../auth/SupabaseAuthContext';
import type { Account, Loan, Transaction, Transfer } from '../services/database_types';

type FinanceData = {
  accounts: Account[];
  loans: Loan[];
  transfers: Transfer[];
  transactions: Transaction[];
  income: number;
  expenses: number;
  availableBalance: number;
};

type FinanceDataContextValue = FinanceData & {
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

type FinanceDataResult = {
  userId: string;
  requestKey: string;
  data: FinanceData;
  error: string | null;
};

const EMPTY_FINANCE_DATA: FinanceData = {
  accounts: [],
  loans: [],
  transfers: [],
  transactions: [],
  income: 0,
  expenses: 0,
  availableBalance: 0,
};

const FinanceDataContext = createContext<FinanceDataContextValue | null>(null);

function latestFirst<T extends { id: number; created_at: string }>(rows: T[]) {
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { user } = useSupabaseAuth();
  const userId = user?.id ?? null;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [result, setResult] = useState<FinanceDataResult | null>(null);
  const requestKey = userId ? `${userId}:${refreshVersion}` : null;

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    if (!userId || !requestKey) return undefined;

    let active = true;
    void Promise.all([
      accountsApi.list(),
      loansApi.list(),
      transfersApi.list(),
      transactionsApi.list(),
    ]).then(([accountRows, loanRows, transferRows, transactionRows]) => {
      if (!active) return;
      const accountsById = new Map(accountRows.map((account) => [String(account.id), account]));
      const month = new Date().toISOString().slice(0, 7);
      const transactions: Transaction[] = latestFirst(transactionRows.map((transaction) => ({
        ...transaction,
        account_name: transaction.account_id === null
          ? null
          : accountsById.get(transaction.account_id)?.name ?? null,
      })));
      const accounts: Account[] = accountRows.map((account) => {
        const transactionBalance = transactionRows.reduce((total, transaction) => {
          if (transaction.account_id !== String(account.id)) return total;
          return total + (transaction.kind === 'income' ? transaction.amount : -transaction.amount);
        }, 0);
        const transferBalance = transferRows.reduce((total, transfer) => {
          if (transfer.to_account_id === String(account.id)) return total + transfer.amount;
          if (transfer.from_account_id === String(account.id)) return total - transfer.amount;
          return total;
        }, 0);
        return {
          id: String(account.id),
          name: account.name,
          type: account.type,
          opening_balance: account.opening_balance,
          is_default: Number(account.is_default),
          balance: account.opening_balance + transactionBalance + transferBalance,
        };
      }).sort((a, b) => b.is_default - a.is_default || a.name.localeCompare(b.name));
      const transfers: Transfer[] = latestFirst(transferRows.map((transfer) => ({
        ...transfer,
        charges: transactionRows
          .filter((transaction) => transaction.transfer_id === transfer.id && transaction.category === 'Fees and charges')
          .map(({ title, amount }) => ({ title, amount })),
        from_account_name: accountsById.get(transfer.from_account_id)?.name,
        to_account_name: accountsById.get(transfer.to_account_id)?.name,
      })));
      const loans: Loan[] = loanRows
        .map((loan) => ({
          ...loan,
          repaid: transactionRows.reduce((total, transaction) =>
            transaction.loan_id === loan.id && transaction.kind === 'expense'
              ? total + transaction.amount
              : total,
            0),
        }))
        .sort((a, b) => b.id - a.id);

      setResult({
        userId,
        requestKey,
        data: {
          accounts,
          loans,
          transfers,
          transactions,
          income: transactionRows.reduce((total, transaction) =>
            transaction.kind === 'income'
              && transaction.loan_id === null
              && transaction.refund_of_transaction_id === null
              && transaction.created_at.slice(0, 7) === month
              ? total + transaction.amount
              : total,
            0),
          expenses: transactionRows.reduce((total, transaction) =>
            transaction.kind === 'expense' && transaction.created_at.slice(0, 7) === month
              ? total + transaction.amount
              : total,
            0),
          availableBalance: accounts.reduce((total, account) => total + account.balance, 0),
        },
        error: null,
      });
    }).catch((loadError: unknown) => {
      console.error('Unable to load finance data', loadError);
      if (!active) return;
      setResult((previous) => ({
        userId,
        requestKey,
        data: previous?.userId === userId ? previous.data : EMPTY_FINANCE_DATA,
        error: loadError instanceof Error ? loadError.message : 'Could not load finance data.',
      }));
    });

    return () => { active = false; };
  }, [requestKey, userId]);

  const currentResult = result?.userId === userId ? result : null;

  return (
    <FinanceDataContext.Provider value={{
      ...(currentResult?.data ?? EMPTY_FINANCE_DATA),
      isLoading: Boolean(userId && currentResult?.requestKey !== requestKey),
      error: currentResult?.error ?? null,
      refresh,
    }}>
      {children}
    </FinanceDataContext.Provider>
  );
}

export function useFinanceData() {
  const context = useContext(FinanceDataContext);
  if (!context) throw new Error('useFinanceData must be used within FinanceDataProvider.');
  return context;
}
