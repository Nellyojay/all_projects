import { useCallback, useState, type ReactNode } from 'react';
import { getTransferById } from '../../../services/database';
import type { Transaction } from '../../../services/database';
import { accountsApi, transactionsApi } from '../../../../../api/finance.api';
import { TransactionReceipt } from './TransactionReceipt';
import { useModalBack } from '../../shared/ModalBackContext';
import {
  TransactionReceiptContext,
  type OpenReceipt,
  type ReceiptOnChanged,
  type ReceiptRecord,
} from './TransactionReceiptContext';

export function TransactionReceiptProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<{
    record: ReceiptRecord;
    onChanged?: ReceiptOnChanged;
  } | null>(null);
  const closeReceipt = useCallback(() => setReceipt(null), []);
  useModalBack(Boolean(receipt), closeReceipt);

  const openReceipt = useCallback<OpenReceipt>(async (target, onChanged) => {
    if (!Number.isSafeInteger(target.id) || target.id < 1) {
      throw new Error('A valid finance record is required to open its receipt.');
    }

    const record = target.kind === 'transfer'
      ? await getTransferById(target.id)
      : await (async () => {
        const [transactions, accounts] = await Promise.all([
          transactionsApi.list(),
          accountsApi.list(),
        ]);
        const transaction = transactions.find((row) => row.id === target.id);
        if (!transaction) return null;
        const account = accounts.find((row) => String(row.id) === transaction.account_id);
        return {
          ...transaction,
          account_name: account?.name ?? null,
        } satisfies Transaction;
      })();
    if (!record) throw new Error('This finance record could not be found.');

    setReceipt({ record, onChanged });
  }, []);

  return (
    <TransactionReceiptContext.Provider value={openReceipt}>
      {children}
      {receipt ? (
        <TransactionReceipt
          transaction={receipt.record}
          onClose={closeReceipt}
          onChanged={receipt.onChanged}
        />
      ) : null}
    </TransactionReceiptContext.Provider>
  );
}
