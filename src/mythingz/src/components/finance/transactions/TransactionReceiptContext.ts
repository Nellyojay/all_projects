import { createContext } from 'react';
import type { Transaction, Transfer } from '../../../services/database';

export type ReceiptTarget = { kind: 'transaction' | 'transfer'; id: number };
export type ReceiptRecord = Transaction | Transfer;
export type ReceiptOnChanged = () => Promise<void>;
export type OpenReceipt = (target: ReceiptTarget, onChanged?: ReceiptOnChanged) => Promise<void>;

export const TransactionReceiptContext = createContext<OpenReceipt | null>(null);
