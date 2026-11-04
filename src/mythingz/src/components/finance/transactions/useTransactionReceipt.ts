import { useContext } from 'react';
import { TransactionReceiptContext } from './TransactionReceiptContext';

export function useTransactionReceipt() {
  const openReceipt = useContext(TransactionReceiptContext);
  if (!openReceipt) {
    throw new Error('Transaction receipts must be opened inside TransactionReceiptProvider.');
  }
  return openReceipt;
}
