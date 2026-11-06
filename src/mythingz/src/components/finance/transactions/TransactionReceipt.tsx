import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useDatabase } from '../../../web/DatabaseProvider';
import {
  getBudgetItemsForExpenseDate,
  getRefundableAmount,
  getTransactionBudgetAllocations,
  saveBudgetRefund,
  saveTransactionBudgetAllocations,
} from '../../../services/database';
import type { BudgetPeriodItem, Transaction, Transfer } from '../../../services/database';
import '../../shared/theme.css';
import './TransactionReceipt.css';

type ReceiptRecord = Transaction | Transfer;
type ReceiptItem = { name: string; quantity: number; unitPrice: number };
type BudgetAllocationOption = BudgetPeriodItem & {
  budget_id: number;
  period_item_id: number | null;
  budget_type: 'normal' | 'recurring';
  template_name: string;
  start_date: string | null;
  end_date: string | null;
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
    <div  className="receipt-modal transaction-receipt-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-receipt-title"
        className="transaction-receipt-modalContent"
        onClick={(event) => event.stopPropagation()}
      >
        <section id="mythings-transaction-receipt" className="transaction-receipt-receipt">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transaction receipt"
            className="receipt-close transaction-receipt-closeButton"

          >
            ×
          </button>
          <header className="transaction-receipt-header">
            <strong className="transaction-receipt-brandName">myThings</strong>
            <span id="transaction-receipt-title" className="transaction-receipt-receiptTitle">
              Transaction Receipt
            </span>
          </header>
          <div  className="receipt-divider transaction-receipt-divider" />
          <div  className="receipt-hero transaction-receipt-hero">
            <span className="transaction-receipt-type">{type.toUpperCase()}</span>
            <h1 className="transaction-receipt-amount">
              UGX {Math.abs(transaction.amount).toLocaleString('en-UG')}
            </h1>
          </div>
          <div  className="receipt-divider transaction-receipt-divider" />

          <div className="transaction-receipt-details">
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
            <div  className="receipt-fees transaction-receipt-loanDetails">
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
            <div  className="receipt-fees transaction-receipt-loanDetails">
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

          <div  className="receipt-divider transaction-receipt-divider" />
          {expenseNotes?.items.length ? (
            <div  className="receipt-item-list transaction-receipt-itemList">
              <strong>Items:</strong>
              <div className="transaction-receipt-itemTable">
                <div  className="receipt-item-header transaction-receipt-itemHeader">
                  <span>Item</span>
                  <span className="transaction-receipt-itemNumeric">Qty</span>
                  <span className="transaction-receipt-itemNumeric">Unit price</span>
                  <span className="transaction-receipt-itemNumeric">Total</span>
                </div>
                {expenseNotes.items.map((item, index) => (
                  <div key={`${item.name}-${index}`}  className="receipt-item-row transaction-receipt-itemRow">
                    <span className="transaction-receipt-itemName">{item.name}</span>
                    <span className="transaction-receipt-itemNumeric">{item.quantity}</span>
                    <span className="transaction-receipt-itemNumeric">{money(item.unitPrice)}</span>
                    <span className="transaction-receipt-itemNumeric">{money(item.quantity * item.unitPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {(expenseNotes?.description || (!isExpense && transaction.notes.trim())) ? (
            <div  className="receipt-description transaction-receipt-description">
              <strong>Description:</strong>
              <span style={{ whiteSpace: 'pre-line' }}>
                {expenseNotes?.description || transaction.notes}
              </span>
            </div>
          ) : null}
          <div  className="receipt-divider transaction-receipt-divider" />
          <div className="transaction-receipt-reference">
            <strong>Transaction Reference:</strong>
            <strong>{reference}</strong>
          </div>
          <div  className="receipt-divider transaction-receipt-divider" />

          <div  className="receipt-divider transaction-receipt-divider" />
          <footer className="transaction-receipt-footer">Thank you for using myThings!</footer>
          <p  className="receipt-secondary transaction-receipt-disclaimer">
            Personal transaction record; not verified by a bank or mobile-money provider.
          </p>
          <button
            type="button"
            onClick={printReceipt}
            className="app-button app-button--text-only"
          >
            Download Receipt
          </button>
          {isExpense ? (
            <div className="transaction-receipt-refundSection">
              <strong>Budget allocation</strong>
              {allocationLoading ? (
                <span className="transaction-receipt-refundHint">Loading budget items…</span>
              ) : (
                <>
                  {savedAllocations.length ? savedAllocations.map((allocation) => (
                    <span key={allocation.budget_item_id} className="transaction-receipt-refundHint">
                      {allocation.template_name} · {allocation.item_name}: {money(allocation.amount)}
                    </span>
                  )) : (
                    <span className="transaction-receipt-refundHint">
                      No budget allocation yet · {money(transaction.amount)} unallocated
                    </span>
                  )}
                  {savedAllocations.length ? (
                    <span className="transaction-receipt-refundHint">
                      {money(Math.max(0, transaction.amount - savedAllocations
                        .reduce((sum, allocation) => sum + allocation.amount, 0)))} remains unallocated.
                    </span>
                  ) : null}
                  {allocationsLocked ? (
                    <span className="transaction-receipt-refundError">
                      Reopen the closed period or restore the budget period before changing these allocations.
                    </span>
                  ) : showAllocationForm ? (
                    <form onSubmit={(event) => void submitBudgetAllocations(event)} className="transaction-receipt-refundForm">
                      <strong>Split this expense across budget items</strong>
                      {budgetOptions.length ? budgetOptions.map((item) => (
                        <label key={item.id} className="transaction-receipt-allocationRow">
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
                            className="transaction-receipt-refundInput"
                          />
                        </label>
                      )) : (
                        <span className="transaction-receipt-refundHint">
                          No open budget period covers this expense date.
                        </span>
                      )}
                      <span className="transaction-receipt-refundHint">
                        Allocated {money(budgetAllocatedTotal)} of {money(transaction.amount)}.
                        {' '}{money(Math.max(0, transaction.amount - budgetAllocatedTotal))} will remain unallocated.
                      </span>
                      {allocationError ? (
                        <span role="alert" className="transaction-receipt-refundError">{allocationError}</span>
                      ) : null}
                      <div className="transaction-receipt-refundActions">
                        <button
                          type="button"
                          onClick={() => { setShowAllocationForm(false); setAllocationError(null); }}
                          className="transaction-receipt-refundCancel"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={allocationSaving || !allocationsLoaded}
                          className="transaction-receipt-refundSave"
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
                      className="transaction-receipt-refundOpen"
                    >
                      {savedAllocations.length ? 'Edit budget allocation' : 'Allocate to a budget'}
                    </button>
                  )}
                </>
              )}
              {allocationError && !showAllocationForm ? (
                <span role="alert" className="transaction-receipt-refundError">{allocationError}</span>
              ) : null}
            </div>
          ) : null}
          {isExpense && refundRemaining > 0 ? (
            <div className="transaction-receipt-refundSection">
              {showRefundForm ? (
                <form onSubmit={(event) => void submitRefund(event)} className="transaction-receipt-refundForm">
                  <strong>Record a refund</strong>
                  <span className="transaction-receipt-refundHint">
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
                    className="transaction-receipt-refundInput"
                  />
                  {refundError ? <span role="alert" className="transaction-receipt-refundError">{refundError}</span> : null}
                  <div className="transaction-receipt-refundActions">
                    <button type="button" onClick={() => setShowRefundForm(false)} className="transaction-receipt-refundCancel">
                      Cancel
                    </button>
                    <button type="submit" disabled={refundSaving || !refundAmount} className="transaction-receipt-refundSave">
                      {refundSaving ? 'Saving…' : 'Save refund'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowRefundForm(true); setRefundError(null); }}
                  className="transaction-receipt-refundOpen"
                >
                  Record refund · {money(refundRemaining)} remaining
                </button>
              )}
            </div>
          ) : isExpense && refundError ? (
            <span role="alert" className="transaction-receipt-refundError">{refundError}</span>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div  className="receipt-row transaction-receipt-row">
      <span className="transaction-receipt-rowLabel">{label}</span>
      <span className="transaction-receipt-rowValue">{value}</span>
    </div>
  );
}
