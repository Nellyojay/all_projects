import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useDatabase } from '../web/DatabaseProvider';
import type { Transaction, Transfer } from '../services/database';
import { colors, styles } from './theme';

type ReceiptRecord = Transaction | Transfer;
type ReceiptItem = { name: string; quantity: number; unitPrice: number };

type TransactionReceiptProps = {
  transaction: ReceiptRecord;
  onClose: () => void;
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

export function TransactionReceipt({ transaction, onClose }: TransactionReceiptProps) {
  const database = useDatabase();
  const [loanDetails, setLoanDetails] = useState<{ principal: number; fees: number } | null>(null);
  const [loanDetailsUnavailable, setLoanDetailsUnavailable] = useState(false);
  const isTransfer = 'from_account_id' in transaction;
  const isExpense = !isTransfer && transaction.kind === 'expense';
  const loanId = isTransfer ? null : transaction.loan_id;
  const type = isTransfer
    ? 'Transfer'
    : transaction.category === 'Loan repayment'
      ? 'Loan repayment'
      : transaction.loan_id !== null && transaction.kind === 'income'
        ? 'Loan proceeds'
        : isExpense ? transaction.category : 'Income received';
  const reference = referenceFor(transaction);
  const expenseNotes = isExpense ? expenseReceiptNotes(transaction.notes) : null;

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
          <button type="button" onClick={printReceipt} style={styles.button}>
            Download Receipt
          </button>
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
} satisfies Record<string, CSSProperties>;
