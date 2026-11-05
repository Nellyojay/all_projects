import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useDatabase } from '../../../web/DatabaseProvider';
import {
  getBudgetItemsForExpenseDate,
  getRefundableAmount,
  getTransactionBudgetAllocations,
  saveBudgetRefund,
  saveTransactionBudgetAllocations,
} from '../../../services/database';
import type { BudgetPeriodItem, Transaction, Transfer } from '../../../services/database';
import { colors, styles } from '../../shared/theme';

type ReceiptRecord = Transaction | Transfer;
type ReceiptItem = { name: string; quantity: number; unitPrice: number };
type BudgetAllocationOption = BudgetPeriodItem & {
  budget_id: number;
  period_item_id: number | null;
  budget_type: 'normal' | 'recurring';
  template_name: string;
  start_date: string;
  end_date: string;
  period_status: string;
};
type SavedBudgetAllocation = Awaited<ReturnType<typeof getTransactionBudgetAllocations>>[number];

type TransactionReceiptProps = {
  transaction: ReceiptRecord;
  onClose: () => void;
  onChanged?: () => Promise<void>;
};

const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

function formattedDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
}

function referenceFor(record: ReceiptRecord) {
  const date = record.date.replace(/\D/g, '');
  const id = String(record.id).padStart(5, '0');
  return `MT-${date}-${'from_account_id' in record ? 'T' : ''}${id}`;
}

function expenseReceiptNotes(notes: string): { description: string; items: ReceiptItem[] } {
  const markerIndex = notes.lastIndexOf('Items:\n');
  if (markerIndex < 0) return { description: notes.trim(), items: [] };

  const description = notes.slice(0, markerIndex).trim();
  const itemLines = notes.slice(markerIndex + 'Items:\n'.length).split('\n');
  const items = itemLines.flatMap((line) => {
    const match = /^(\d+)\s×\s(.+?)\s· UGX ([\d,]+(?:\.\d+)?) each$/.exec(line);
    if (!match) return [];
    return [{
      quantity: Number(match[1]),
      name: match[2],
      unitPrice: Number(match[3].replace(/,/g, '')),
    }];
  });
  return { description, items };
}

export function TransactionReceipt({ transaction, onClose, onChanged }: TransactionReceiptProps) {
  const database = useDatabase();
  const [loanDetails, setLoanDetails] = useState<{ principal: number; fees: number } | null>(null);
  const [loanDetailsUnavailable, setLoanDetailsUnavailable] = useState(false);
  const [refundRemaining, setRefundRemaining] = useState(0);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [budgetOptions, setBudgetOptions] = useState<BudgetAllocationOption[]>([]);
  const [savedAllocations, setSavedAllocations] = useState<SavedBudgetAllocation[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<number, string>>({});
  const [showAllocationForm, setShowAllocationForm] = useState(false);
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [allocationsLoaded, setAllocationsLoaded] = useState(false);
  const isTransfer = 'from_account_id' in transaction;
  const isExpense = !isTransfer && transaction.kind === 'expense';
  const loanId = isTransfer ? null : transaction.loan_id;
  const type = isTransfer
    ? 'Transfer'
    : transaction.refund_of_transaction_id !== null
      ? 'Refund received'
      : transaction.category === 'Loan repayment'
        ? 'Loan repayment'
        : transaction.loan_id !== null && transaction.kind === 'income'
          ? 'Loan proceeds'
          : isExpense ? transaction.category : 'Income received';
  const reference = referenceFor(transaction);
  const expenseNotes = isExpense ? expenseReceiptNotes(transaction.notes) : null;
  const allocationsLocked = savedAllocations.some((allocation) =>
    !['active', 'awaiting_review'].includes(allocation.period_status),
  );
  const budgetAllocatedTotal = Object.values(allocationAmounts)
    .reduce((sum, amount) => sum + (Number(amount) || 0), 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const printStyles = document.createElement('style');
    printStyles.textContent = `
      @page {
        size: A4 portrait;
        margin: 50mm;
      }
      @media print {
        body * { visibility: hidden !important; }
        #mythings-transaction-receipt,
        #mythings-transaction-receipt * { visibility: visible !important; }
        html, body {
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
        #mythings-transaction-receipt {
          position: absolute !important;
          inset: 0 auto auto 50% !important;
          width: 100% !important;
          max-width: 170mm !important;
          max-height: none !important;
          overflow: visible !important;
          margin: 0 !important;
          transform: translateX(-50%) !important;
          padding: 0 !important;
          color: #111 !important;
          background: #fff !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          font-family: Arial, Helvetica, sans-serif !important;
          font-size: 20pt !important;
          print-color-adjust: economy;
          -webkit-print-color-adjust: economy;
        }
        #mythings-transaction-receipt * {
          color: #111 !important;
          background-color: transparent !important;
          border-color: #d1d5db !important;
          box-shadow: none !important;
        }
        .receipt-modal {
          position: static !important;
          display: block !important;
          overflow: visible !important;
          padding: 0 !important;
          background: #fff !important;
          backdrop-filter: none !important;
        }
        .receipt-close,
        #mythings-transaction-receipt > button { display: none !important; }
        .receipt-divider { border-color: #d1d5db !important; }
        #mythings-transaction-receipt header,
        #mythings-transaction-receipt .receipt-row,
        #mythings-transaction-receipt .receipt-item-row,
        #mythings-transaction-receipt footer,
        #mythings-transaction-receipt p {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        #mythings-transaction-receipt h1 {
          margin-block: 4mm !important;
          font-size: 30pt !important;
        }
        #mythings-transaction-receipt header strong { font-size: 20pt !important; }
        #mythings-transaction-receipt header span { font-size: 14pt !important; }
        #mythings-transaction-receipt .receipt-hero span { font-size: 12pt !important; }
        #mythings-transaction-receipt .receipt-row span,
        #mythings-transaction-receipt .receipt-item-row span,
        #mythings-transaction-receipt .receipt-item-header span,
        #mythings-transaction-receipt .receipt-description,
        #mythings-transaction-receipt .receipt-item-list,
        #mythings-transaction-receipt .receipt-fees {
          font-size: 12pt !important;
          line-height: 1.4 !important;
        }
        #mythings-transaction-receipt footer { font-size: 12pt !important; }
        #mythings-transaction-receipt p { font-size: 10pt !important; }
        #mythings-transaction-receipt strong { font-weight: 700 !important; }
        #mythings-transaction-receipt footer { padding-top: 8mm !important; }
      }
    `;
    document.head.appendChild(printStyles);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      printStyles.remove();
    };
  }, [onClose]);

  useEffect(() => {
    if (loanId === null) return;
    let active = true;
    void database.getFirstAsync<{ principal: number; fees: number }>(
      'SELECT principal, fees FROM loans WHERE id = ?',
      loanId,
    ).then((details) => {
      if (active) {
        setLoanDetails(details ?? null);
        setLoanDetailsUnavailable(details === null);
      }
    }).catch((error: unknown) => {
      console.error('Unable to load loan details for transaction receipt', error);
      if (active) setLoanDetailsUnavailable(true);
    });
    return () => { active = false; };
  }, [database, loanId]);

  useEffect(() => {
    if (!isExpense) return;
    let active = true;
    void getRefundableAmount(database, transaction.id)
      .then((amount) => { if (active) setRefundRemaining(amount); })
      .catch((error: unknown) => {
        console.error('Unable to load refundable expense balance', error);
        if (active) setRefundError('Refund availability could not be loaded.');
      });
    void Promise.all([
      getBudgetItemsForExpenseDate(database, transaction.date),
      getTransactionBudgetAllocations(database, transaction.id),
    ])
      .then(([options, allocations]) => {
        if (!active) return;
        setBudgetOptions(options);
        setSavedAllocations(allocations);
        setAllocationAmounts(Object.fromEntries(
          allocations.map((allocation) => [allocation.budget_item_id, String(allocation.amount)]),
        ));
        setAllocationsLoaded(true);
        setAllocationError(null);
      })
      .catch((error: unknown) => {
        console.error('Unable to load budget allocations for expense', error);
        if (active) {
          setAllocationError('Budget allocations could not be loaded.');
        }
      })
      .finally(() => {
        if (active) setAllocationLoading(false);
      });
    return () => { active = false; };
  }, [database, isExpense, transaction.id, transaction.date]);

  const submitBudgetAllocations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const allocations = budgetOptions.flatMap((item) => {
      const amount = Number(allocationAmounts[item.id] ?? 0);
      return amount > 0 ? [{ budgetItemId: item.id, amount }] : [];
    });
    const allocatedAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (allocatedAmount > transaction.amount) {
      setAllocationError('Allocations cannot exceed the full expense amount.');
      return;
    }
    setAllocationSaving(true);
    setAllocationError(null);
    try {
      await saveTransactionBudgetAllocations(database, transaction.id, allocations);
    } catch (reason) {
      console.error('Unable to update expense budget allocations', reason);
      setAllocationError(reason instanceof Error ? reason.message : 'Budget allocations could not be saved.');
      return;
    } finally {
      setAllocationSaving(false);
    }
    setSavedAllocations(allocations.flatMap((allocation) => {
      const option = budgetOptions.find((item) => item.id === allocation.budgetItemId);
      return option ? [{
        period_item_id: option.period_item_id,
        budget_item_id: option.id,
        budget_id: option.budget_id,
        amount: allocation.amount,
        item_name: option.name,
        template_name: option.template_name,
        period_status: option.period_status,
        budget_type: option.budget_type,
      }] : [];
    }));
    setShowAllocationForm(false);
    try {
      await onChanged?.();
    } catch (reason) {
      console.error('Unable to refresh finances after allocation update', reason);
      window.alert('Budget allocation saved, but the finance view could not be refreshed.');
    }
  };

  const submitRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRefundSaving(true);
    setRefundError(null);
    try {
      await saveBudgetRefund(database, transaction.id, Number(refundAmount));
      setRefundRemaining(0);
    } catch (reason) {
      console.error('Unable to record expense refund', reason);
      setRefundError(reason instanceof Error ? reason.message : 'The refund could not be recorded.');
      try {
        setRefundRemaining(await getRefundableAmount(database, transaction.id));
      } catch (refreshError) {
        console.error('Unable to refresh refundable expense balance', refreshError);
      }
      return;
    } finally {
      setRefundSaving(false);
    }
    try {
      await onChanged?.();
    } catch (reason) {
      console.error('Unable to refresh finances after refund', reason);
      window.alert('Refund recorded\n\nThe refund was saved, but the finance view could not be refreshed.');
    }
    onClose();
  };

  const printReceipt = () => {
    window.print();
  };

  return (
    <div style={receiptStyles.backdrop} className="receipt-modal" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-receipt-title"
        style={receiptStyles.modalContent}
        onClick={(event) => event.stopPropagation()}
      >
        <section id="mythings-transaction-receipt" style={receiptStyles.receipt}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transaction receipt"
            className="receipt-close"
            style={receiptStyles.closeButton}
          >
            ×
          </button>
          <header style={receiptStyles.header}>
            <strong style={receiptStyles.brandName}>myThings</strong>
            <span id="transaction-receipt-title" style={receiptStyles.receiptTitle}>
              Transaction Receipt
            </span>
          </header>
          <div style={receiptStyles.divider} className="receipt-divider" />
          <div style={receiptStyles.hero} className="receipt-hero">
            <span style={receiptStyles.type}>{type.toUpperCase()}</span>
            <h1 style={receiptStyles.amount}>
              UGX {Math.abs(transaction.amount).toLocaleString('en-UG')}
            </h1>
          </div>
          <div style={receiptStyles.divider} className="receipt-divider" />

          <div style={receiptStyles.details}>
            <ReceiptRow
              label="Title:"
              value={isTransfer
                ? `${transaction.from_account_name || 'Source'} → ${transaction.to_account_name || 'Destination'}`
                : transaction.title}
            />
            <ReceiptRow label="Category:" value={isTransfer ? 'Transfer' : transaction.category} />
            {isTransfer ? (
              <>
                <ReceiptRow label="From account:" value={transaction.from_account_name || 'Not specified'} />
                <ReceiptRow label="To account:" value={transaction.to_account_name || 'Not specified'} />
              </>
            ) : (
              <ReceiptRow label="Account:" value={transaction.account_name || 'Not specified'} />
            )}
            <ReceiptRow label="Date:" value={formattedDate(transaction.date)} />
            <ReceiptRow label="Time:" value="Not recorded" />
          </div>

          {!isTransfer && transaction.loan_id !== null ? (
            <div style={receiptStyles.loanDetails} className="receipt-fees">
              {loanDetails ? (
                <>
                  <ReceiptRow label="Loan principal:" value={money(loanDetails.principal)} />
                  <ReceiptRow label="Loan fees:" value={money(loanDetails.fees)} />
                </>
              ) : loanDetailsUnavailable ? (
                <ReceiptRow label="Loan details:" value="Unavailable" />
              ) : (
                <ReceiptRow label="Loan details:" value="Loading…" />
              )}
              {transaction.category === 'Loan repayment' ? (
                <ReceiptRow label="Repayment:" value={money(transaction.amount)} />
              ) : null}
            </div>
          ) : null}
          {isTransfer && transaction.charges.length ? (
            <div style={receiptStyles.loanDetails} className="receipt-fees">
              <strong>Transfer charges:</strong>
              {transaction.charges.map((charge, index) => (
                <ReceiptRow
                  key={`${charge.title}-${index}`}
                  label={`${charge.title}:`}
                  value={money(charge.amount)}
                />
              ))}
              <ReceiptRow
                label="Total charges:"
                value={money(transaction.charges.reduce((total, charge) => total + charge.amount, 0))}
              />
            </div>
          ) : null}

          <div style={receiptStyles.divider} className="receipt-divider" />
          {expenseNotes?.items.length ? (
            <div style={receiptStyles.itemList} className="receipt-item-list">
              <strong>Items:</strong>
              <div style={receiptStyles.itemTable}>
                <div style={receiptStyles.itemHeader} className="receipt-item-header">
                  <span>Item</span>
                  <span style={receiptStyles.itemNumeric}>Qty</span>
                  <span style={receiptStyles.itemNumeric}>Unit price</span>
                  <span style={receiptStyles.itemNumeric}>Total</span>
                </div>
                {expenseNotes.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} style={receiptStyles.itemRow} className="receipt-item-row">
                    <span style={receiptStyles.itemName}>{item.name}</span>
                    <span style={receiptStyles.itemNumeric}>{item.quantity}</span>
                    <span style={receiptStyles.itemNumeric}>{money(item.unitPrice)}</span>
                    <span style={receiptStyles.itemNumeric}>{money(item.quantity * item.unitPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {(expenseNotes?.description || (!isExpense && transaction.notes.trim())) ? (
            <div style={receiptStyles.description} className="receipt-description">
              <strong>Description:</strong>
              <span style={{ whiteSpace: 'pre-line' }}>
                {expenseNotes?.description || transaction.notes}
              </span>
            </div>
          ) : null}
          <div style={receiptStyles.divider} className="receipt-divider" />
          <div style={receiptStyles.reference}>
            <strong>Transaction Reference:</strong>
            <strong>{reference}</strong>
          </div>
          <div style={receiptStyles.divider} className="receipt-divider" />

          <div style={receiptStyles.divider} className="receipt-divider" />
          <footer style={receiptStyles.footer}>Thank you for using myThings!</footer>
          <p style={receiptStyles.disclaimer} className="receipt-secondary">
            Personal transaction record; not verified by a bank or mobile-money provider.
          </p>
          <button
            type="button"
            onClick={printReceipt}
            style={Object.assign({}, styles.button, styles.buttonTextOnly)}
          >
            Download Receipt
          </button>
          {isExpense ? (
            <div style={receiptStyles.refundSection}>
              <strong>Budget allocation</strong>
              {allocationLoading ? (
                <span style={receiptStyles.refundHint}>Loading budget items…</span>
              ) : (
                <>
                  {savedAllocations.length ? savedAllocations.map((allocation) => (
                    <span key={allocation.budget_item_id} style={receiptStyles.refundHint}>
                      {allocation.template_name} · {allocation.item_name}: {money(allocation.amount)}
                    </span>
                  )) : (
                    <span style={receiptStyles.refundHint}>
                      No budget allocation yet · {money(transaction.amount)} unallocated
                    </span>
                  )}
                  {savedAllocations.length ? (
                    <span style={receiptStyles.refundHint}>
                      {money(Math.max(0, transaction.amount - savedAllocations
                        .reduce((sum, allocation) => sum + allocation.amount, 0)))} remains unallocated.
                    </span>
                  ) : null}
                  {allocationsLocked ? (
                    <span style={receiptStyles.refundError}>
                      Reopen the closed period or restore the budget period before changing these allocations.
                    </span>
                  ) : showAllocationForm ? (
                    <form onSubmit={(event) => void submitBudgetAllocations(event)} style={receiptStyles.refundForm}>
                      <strong>Split this expense across budget items</strong>
                      {budgetOptions.length ? budgetOptions.map((item) => (
                        <label key={item.id} style={receiptStyles.allocationRow}>
                          <span>{item.template_name} · {item.name}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={allocationAmounts[item.id] ?? ''}
                            onChange={(event) => setAllocationAmounts({
                              ...allocationAmounts,
                              [item.id]: event.currentTarget.value,
                            })}
                            aria-label={`Amount allocated to ${item.template_name} · ${item.name}`}
                            style={receiptStyles.refundInput}
                          />
                        </label>
                      )) : (
                        <span style={receiptStyles.refundHint}>
                          No open budget period covers this expense date.
                        </span>
                      )}
                      <span style={receiptStyles.refundHint}>
                        Allocated {money(budgetAllocatedTotal)} of {money(transaction.amount)}.
                        {' '}{money(Math.max(0, transaction.amount - budgetAllocatedTotal))} will remain unallocated.
                      </span>
                      {allocationError ? (
                        <span role="alert" style={receiptStyles.refundError}>{allocationError}</span>
                      ) : null}
                      <div style={receiptStyles.refundActions}>
                        <button
                          type="button"
                          onClick={() => { setShowAllocationForm(false); setAllocationError(null); }}
                          style={receiptStyles.refundCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={allocationSaving || !allocationsLoaded}
                          style={receiptStyles.refundSave}
                        >
                          {allocationSaving ? 'Saving…' : budgetAllocatedTotal === 0 ? 'Leave unallocated' : 'Save allocation'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setShowAllocationForm(true); setAllocationError(null); }}
                      disabled={!allocationsLoaded}
                      style={receiptStyles.refundOpen}
                    >
                      {savedAllocations.length ? 'Edit budget allocation' : 'Allocate to a budget'}
                    </button>
                  )}
                </>
              )}
              {allocationError && !showAllocationForm ? (
                <span role="alert" style={receiptStyles.refundError}>{allocationError}</span>
              ) : null}
            </div>
          ) : null}
          {isExpense && refundRemaining > 0 ? (
            <div style={receiptStyles.refundSection}>
              {showRefundForm ? (
                <form onSubmit={(event) => void submitRefund(event)} style={receiptStyles.refundForm}>
                  <strong>Record a refund</strong>
                  <span style={receiptStyles.refundHint}>
                    Up to {money(refundRemaining)} can be returned to {transaction.account_name || 'the original account'}.
                    Budget item allocations will be reversed proportionally.
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={refundRemaining}
                    step="1"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.currentTarget.value)}
                    placeholder="Refund amount in UGX"
                    aria-label="Refund amount in UGX"
                    style={receiptStyles.refundInput}
                  />
                  {refundError ? <span role="alert" style={receiptStyles.refundError}>{refundError}</span> : null}
                  <div style={receiptStyles.refundActions}>
                    <button type="button" onClick={() => setShowRefundForm(false)} style={receiptStyles.refundCancel}>
                      Cancel
                    </button>
                    <button type="submit" disabled={refundSaving || !refundAmount} style={receiptStyles.refundSave}>
                      {refundSaving ? 'Saving…' : 'Save refund'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowRefundForm(true); setRefundError(null); }}
                  style={receiptStyles.refundOpen}
                >
                  Record refund · {money(refundRemaining)} remaining
                </button>
              )}
            </div>
          ) : isExpense && refundError ? (
            <span role="alert" style={receiptStyles.refundError}>{refundError}</span>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={receiptStyles.row} className="receipt-row">
      <span style={receiptStyles.rowLabel}>{label}</span>
      <span style={receiptStyles.rowValue}>{value}</span>
    </div>
  );
}

const receiptStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflowY: 'auto',
    paddingInline: 12,
    backgroundColor: '#0009',
    backdropFilter: 'blur(4px)',
  },
  modalContent: { width: '100%', maxWidth: 480 },
  receipt: {
    position: 'relative',
    width: '100%',
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    paddingInline: 18,
    paddingBlock: 22,
    color: colors.ink,
    background: '#111',
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    boxShadow: '0 20px 70px #0008',
  },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginBottom: 10 },
  brandName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.6 },
  receiptTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    display: 'flex',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: colors.ink,
    backgroundColor: '#202020',
    border: `1px solid ${colors.line}`,
    borderRadius: 8,
    fontSize: 20,
  },
  divider: { borderTop: `1px solid ${colors.line}` },
  hero: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, paddingBlock: 4 },
  type: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  amount: { margin: 0, fontSize: 20, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' },
  details: { display: 'flex', flexDirection: 'column', gap: 11, paddingBlock: 18 },
  loanDetails: { display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 15 },
  row: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  rowLabel: { flex: '0 0 42%', color: colors.muted, fontSize: 11 },
  rowValue: { maxWidth: '58%', textAlign: 'right', fontSize: 11, fontWeight: '700', overflowWrap: 'anywhere' },
  itemList: { display: 'flex', flexDirection: 'column', gap: 10, paddingBlock: 15, fontSize: 11 },
  itemTable: { display: 'flex', flexDirection: 'column', gap: 9 },
  itemHeader: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 38px 86px 86px',
    gap: 8,
    alignItems: 'end',
    paddingBottom: 7,
    borderBottom: `1px solid ${colors.line}`,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  itemRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 38px 86px 86px',
    gap: 8,
    alignItems: 'start',
    fontSize: 10,
  },
  itemName: { textAlign: 'left', overflowWrap: 'anywhere' },
  itemNumeric: { textAlign: 'right', whiteSpace: 'nowrap' },
  description: { display: 'flex', flexDirection: 'column', gap: 8, paddingBlock: 15, fontSize: 11, lineHeight: '17px', overflowWrap: 'anywhere' },
  reference: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    paddingBlock: 15,
    fontSize: 11,
    overflowWrap: 'anywhere',
  },
  totalRow: { display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 5, fontSize: 13, fontWeight: '800' },
  disclaimer: {
    margin: '12px 0 0',
    color: colors.muted,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: '14px',
  },
  footer: { paddingTop: 14, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  actionMessage: { display: 'block', marginTop: 9, color: colors.muted, textAlign: 'center', fontSize: 9 },
  refundSection: { marginTop: 14 },
  refundForm: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${colors.line}`, borderRadius: 8, color: colors.ink, fontSize: 11 },
  refundHint: { color: colors.muted, fontSize: 9, lineHeight: '15px' },
  refundInput: { minHeight: 40, paddingInline: 10, border: `1px solid ${colors.line}`, borderRadius: 7, backgroundColor: colors.background, color: colors.ink, fontSize: 11 },
  allocationRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, 0.6fr)', alignItems: 'center', gap: 8, color: colors.ink, fontSize: 10 },
  refundActions: { display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  refundCancel: { minHeight: 34, paddingInline: 10, border: `1px solid ${colors.line}`, borderRadius: 6, backgroundColor: colors.surface, color: colors.muted, fontSize: 9 },
  refundSave: { minHeight: 34, paddingInline: 10, border: 0, borderRadius: 6, backgroundColor: colors.green, color: colors.background, fontSize: 9, fontWeight: '700' },
  refundOpen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    width: '100%',
    marginTop: 12,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700'
  },
  refundError: { color: colors.orange, fontSize: 9 },
} satisfies Record<string, CSSProperties>;
