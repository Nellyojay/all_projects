import { useCallback, useState, type ReactNode } from 'react';
import { getTransferById } from '../../../services/database';
import type { Transaction } from '../../../services/database';
import { useDatabase } from '../../../web/DatabaseProvider';
import { TransactionReceipt } from './TransactionReceipt';
import {
  TransactionReceiptContext,
  type OpenReceipt,
  type ReceiptOnChanged,
  type ReceiptRecord,
} from './TransactionReceiptContext';

export function TransactionReceiptProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [receipt, setReceipt] = useState<{
    record: ReceiptRecord;
    onChanged?: ReceiptOnChanged;
  } | null>(null);

  const openReceipt = useCallback<OpenReceipt>(async (target, onChanged) => {
    if (!Number.isSafeInteger(target.id) || target.id < 1) {
      throw new Error('A valid finance record is required to open its receipt.');
    }

    const record = target.kind === 'transfer'
      ? await getTransferById(database, target.id)
      : await database.getFirstAsync<Transaction>(
        `SELECT transactions.*, accounts.name AS account_name
         FROM transactions LEFT JOIN accounts ON accounts.id = transactions.account_id
         WHERE transactions.id = ?`,
        target.id,
      );
    if (!record) throw new Error('This finance record could not be found.');

    setReceipt({ record, onChanged });
  }, [database]);

  return (
    <TransactionReceiptContext.Provider value={openReceipt}>
      {children}
      {receipt ? (
        <TransactionReceipt
          transaction={receipt.record}
          onClose={() => setReceipt(null)}
          onChanged={receipt.onChanged}
        />
      ) : null}
    </TransactionReceiptContext.Provider>
  );
}
