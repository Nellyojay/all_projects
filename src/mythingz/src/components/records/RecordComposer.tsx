import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import {
  INCOME_CATEGORIES,
  InsufficientBalanceError,
  getAccounts,
  getTransferCharges,
  localDateKey,
  type Account,
  type RecordDraft,
  type RecordKind,
} from '../../services/database';
import '../shared/theme.css';
import { AccountPicker } from '../finance/accounts/account';
import { ListComposer } from '../lists/list';
import { parseItemizedItems, type ItemizedItem } from '../lists/itemizedItemsModel';
import './RecordComposer.css';

export const MAX_TITLE_LENGTH = 32;

const titles: Record<RecordKind, string> = {
  income: 'Add income',
  loan: 'Add loan',
  'loan-repayment': 'Record loan repayment',
  transfer: 'Transfer between accounts',
  event: 'New event',
  task: 'New task',
  note: 'New note',
  list: 'New list',
};

const categoryHints: Record<RecordKind, string> = {
  income: 'Salary, business…',
  loan: 'Lender or source',
  'loan-repayment': 'Loan repayment',
  transfer: 'Transfer',
  event: 'Appointment, birthday…',
  task: 'High, normal, low priority',
  note: 'Personal, work…',
  list: 'Optional category',
};

type Props = {
  kind: RecordKind | null;
  defaultDate?: string;
  initialDraft?: RecordDraft;
  amountLocked?: boolean;
  onClose: () => void;
  onSave: (kind: RecordKind, draft: RecordDraft) => Promise<void>;
};

const incomeCategory = (draft?: RecordDraft) =>
  INCOME_CATEGORIES.find(
    (option) => option.toLowerCase() === draft?.category.toLowerCase(),
  ) ?? INCOME_CATEGORIES[0];

let nextComposerEntryId = 0;

export function RecordComposer({
  kind,
  defaultDate,
  initialDraft,
  amountLocked = false,
  onClose,
  onSave,
}: Props) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const historyEntryId = useRef<string | null>(null);
  const historyEntryReady = useRef(false);
  const [title, setTitle] = useState(
    () => (initialDraft?.title ?? '').slice(0, MAX_TITLE_LENGTH),
  );
  const [editingNoteTitle, setEditingNoteTitle] = useState(false);
  const [editingNoteBody, setEditingNoteBody] = useState(false);
  const [categorySelection, setCategorySelection] = useState(() => ({
    kind,
    draft: initialDraft,
    value: kind === 'income' ? incomeCategory(initialDraft) : initialDraft?.category ?? '',
  }));
  const category = categorySelection.kind === kind && categorySelection.draft === initialDraft
    ? categorySelection.value
    : kind === 'income' ? incomeCategory(initialDraft) : initialDraft?.category ?? '';
  const setCategory = (value: string) => {
    setCategorySelection({ kind, draft: initialDraft, value });
  };
  const [amount, setAmount] = useState(initialDraft?.amount?.toString() ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(initialDraft?.accountId ?? null);
  const [fromAccountId, setFromAccountId] = useState<number | null>(initialDraft?.fromAccountId ?? null);
  const [toAccountId, setToAccountId] = useState<number | null>(initialDraft?.toAccountId ?? null);
  const [date, setDate] = useState(initialDraft?.date || defaultDate || localDateKey());
  const [fees, setFees] = useState(initialDraft?.fees?.toString() ?? '');
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? '');
  const [notes, setNotes] = useState(initialDraft?.notes ?? '');
  const [listItems, setListItems] = useState<ItemizedItem[]>(() => {
    const items = initialDraft?.listItems
      ?? initialDraft?.notes?.split(/\r?\n|,/).filter((item) => item.trim()).map((text) => ({
        text: text.trim(),
        done: false,
        price: 0,
        quantity: 1,
      }));
    return items?.length
      ? items.map((item) => ({
        ...item,
        price: item.price ? String(item.price) : '',
        quantity: String(item.quantity ?? 1),
      }))
      : [{ text: '', done: false, price: '', quantity: '1' }];
  });
  const transferCharges = kind === 'transfer'
    ? getTransferCharges(
      accounts.find((account) => account.id === fromAccountId)?.type ?? '',
      accounts.find((account) => account.id === toAccountId)?.type ?? '',
    )
    : [];
  const transferChargeTotal = transferCharges.reduce((total, charge) => total + charge.amount, 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!kind || !['income', 'loan', 'loan-repayment', 'transfer'].includes(kind)) return;
    let active = true;
    void getAccounts(database)
      .then((rows) => {
        if (!active) return;
        setAccounts(rows);
        const defaultId = rows[0]?.id ?? null;
        setAccountId((current) => current ?? defaultId);
        setFromAccountId((current) => current ?? defaultId);
        setToAccountId((current) => current ?? rows.find((account) => account.id !== defaultId)?.id ?? null);
      })
      .catch((error: unknown) => {
        console.error('Unable to load accounts for finance record', error);
        window.alert('Could not load accounts\n\nPlease try again.');
      });
    return () => { active = false; };
  }, [database, kind]);

  const close = useCallback(() => {
    if (historyEntryId.current) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      navigate(-1);
    }
    setTitle('');
    setEditingNoteTitle(false);
    setEditingNoteBody(false);
    setCategorySelection({
      kind,
      draft: initialDraft,
      value: kind === 'income' ? INCOME_CATEGORIES[0] : '',
    });
    setAmount('');
    setAccountId(null);
    setFromAccountId(null);
    setToAccountId(null);
    setDate(defaultDate || localDateKey());
    setFees('');
    setDueDate('');
    setNotes('');
    setListItems([{ text: '', done: false, price: '', quantity: '1' }]);
    onClose();
  }, [defaultDate, initialDraft, kind, navigate, onClose]);

  useEffect(() => {
    if (!kind) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      return;
    }

    const state = location.state;
    const currentEntryId = typeof state === 'object' && state !== null
      && 'recordComposerEntry' in state
      && typeof state.recordComposerEntry === 'string'
      ? state.recordComposerEntry
      : null;

    if (!historyEntryId.current) {
      const entryId = `record-composer-${++nextComposerEntryId}`;
      historyEntryId.current = entryId;
      historyEntryReady.current = false;
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { state: { ...(state ?? {}), recordComposerEntry: entryId } },
      );
      return;
    }

    if (currentEntryId === historyEntryId.current) {
      historyEntryReady.current = true;
      return;
    }

    if (historyEntryReady.current) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      close();
    }
  }, [close, kind, location, navigate]);

  useEffect(() => {
    if (!kind) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, kind]);

  const submit = async () => {
    if (!kind) return;
    const parsedAmount = Number(amount.replace(/,/g, ''));
    if (!title.trim() && kind !== 'transfer') {
      window.alert(`${kind === 'loan' ? 'Add a lender' : 'Add a title'}\n\n${kind === 'loan' ? 'Enter the lender or loan source.' : 'Enter a name before saving.'}`);
      return;
    }
    if ((kind === 'income' || kind === 'loan' || kind === 'loan-repayment' || kind === 'transfer') &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      window.alert('Check the amount\n\nEnter an amount greater than zero.');
      return;
    }
    if ((kind === 'income' || kind === 'loan' || kind === 'loan-repayment') && !accountId) {
      window.alert('Choose an account\n\nSelect the account for this transaction.');
      return;
    }
    if (kind === 'transfer' && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) {
      window.alert('Choose accounts\n\nSelect two different accounts for this transfer.');
      return;
    }
    const parsedFees = fees.trim() ? Number(fees.replace(/,/g, '')) : 0;
    if (kind === 'loan' && (!Number.isFinite(parsedFees) || parsedFees < 0)) {
      window.alert('Check loan fees\n\nEnter interest or fees of zero or more.');
      return;
    }
    const parsedListItems = kind === 'list' ? parseItemizedItems(listItems) : [];
    if (parsedListItems === null) {
      window.alert('Check item quantity and price\n\nEnter a whole-number quantity of at least one and a valid unit price of zero or more.');
      return;
    }
    const parsedDate = new Date(`${date}T12:00:00`);
    if ((kind === 'event' || kind === 'task') &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localDateKey(parsedDate) !== date)) {
      window.alert('Check the date\n\nUse the YYYY-MM-DD date format.');
      return;
    }
    if (kind === 'loan' && dueDate) {
      const parsedDueDate = new Date(`${dueDate}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || localDateKey(parsedDueDate) !== dueDate) {
        window.alert('Check the due date\n\nUse the YYYY-MM-DD date format.');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(kind, {
        id: initialDraft?.id,
        title: title || 'Transfer',
        category: category || (kind === 'task' ? 'Normal' : 'Personal'),
        amount: parsedAmount,
        date: kind === 'event' || kind === 'task' ? date : localDateKey(),
        notes,
        fees: kind === 'loan' ? parsedFees : undefined,
        dueDate: kind === 'loan' ? dueDate : undefined,
        loanId: kind === 'loan-repayment' ? initialDraft?.loanId : undefined,
        accountId: kind === 'income' || kind === 'loan' || kind === 'loan-repayment'
          ? accountId ?? undefined
          : undefined,
        fromAccountId: kind === 'transfer' ? fromAccountId ?? undefined : undefined,
        toAccountId: kind === 'transfer' ? toAccountId ?? undefined : undefined,
        listItems: kind === 'list' ? parsedListItems : undefined,
      });
      close();
    } catch (error) {
      console.error('Unable to save record', error);
      window.alert(`${error instanceof InsufficientBalanceError ? 'Not enough available funds' : 'Could not save'}\n\n${error instanceof InsufficientBalanceError ? error.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!kind) return null;

  return (
    <section className="record-composer-page record-composer-backdrop" aria-label={titles[kind]}>
      <div className="record-composer-sheet">
        <div className="record-composer-header">
          <h1 className="record-composer-heading">{titles[kind]}</h1>
          <button onClick={close} type="button" className="record-composer-closeButton">
            Cancel
          </button>
        </div>
        <div className="record-composer-form">
          {kind === 'note' ? (
            <>
              {editingNoteTitle ? (
                <input
                  autoFocus
                  maxLength={MAX_TITLE_LENGTH}
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  aria-label="Note title"
                  placeholder="Note title"
                  className="record-composer-noteTitleInput"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingNoteTitle(true)}
                  aria-label="Edit note title"
                  className="record-composer-noteTitlePreview"
                >
                  {title || 'Add a title'}
                </button>
              )}
              <input
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
                aria-label="Note category"
                placeholder="Add a category (optional)"
                className="record-composer-noteCategory"
              />
            </>
          ) : kind === 'transfer' ? null : (
            <>
              <input
                autoFocus
                maxLength={MAX_TITLE_LENGTH}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                aria-label={kind === 'loan' ? 'Lender or source name' : kind === 'loan-repayment' ? 'Payment title' : 'List title or name'}
                placeholder={kind === 'loan' ? 'LENDER NAME / SOURCE NAME' : kind === 'loan-repayment' ? 'PAYMENT TITLE' : kind === 'task' ? 'Name your task' : 'Name your record'}
                className="title-input"
              />
            </>
          )}

          {kind === 'income' || kind === 'loan' || kind === 'loan-repayment' || kind === 'transfer' ? (
            <>
              <span className="record-composer-label">
                {kind === 'loan'
                  ? 'PRINCIPAL · UGX'
                  : kind === 'loan-repayment' ? 'REPAYMENT · UGX' : 'AMOUNT · UGX'}
              </span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                placeholder="0" inputMode="decimal" readOnly={amountLocked}
                className="record-composer-input"
              />
            </>
          ) : null}
          {kind === 'income' || kind === 'loan' || kind === 'loan-repayment' ? (
            <AccountPicker
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              label={kind === 'income' || kind === 'loan' ? 'RECEIVED INTO · ACCOUNT' : 'PAID FROM · ACCOUNT'}
            />
          ) : null}
          {kind === 'transfer' ? (
            <>
              <AccountPicker
                accounts={accounts}
                value={fromAccountId}
                onChange={(id) => {
                  setFromAccountId(id);
                  if (id === toAccountId) {
                    setToAccountId(accounts.find((account) => account.id !== id)?.id ?? null);
                  }
                }}
                label="FROM ACCOUNT"
              />
              <AccountPicker
                accounts={accounts.filter((account) => account.id !== fromAccountId)}
                value={toAccountId}
                onChange={setToAccountId}
                label="TO ACCOUNT"
              />
              {transferCharges.length ? (
                <div className="record-composer-transferCharges">
                  <strong>Automatic transfer charges</strong>
                  {transferCharges.map((charge) => (
                    <span key={charge.label}>
                      {charge.label}: UGX {charge.amount.toLocaleString('en-UG')}
                    </span>
                  ))}
                  <strong>
                    Total deducted: UGX {(
                      (Number(amount.replace(/,/g, '')) || 0) + transferChargeTotal
                    ).toLocaleString('en-UG')}
                  </strong>
                </div>
              ) : null}
            </>
          ) : null}
          {kind === 'loan' ? (
            <>
              <span className="record-composer-label">INTEREST / FEES · UGX</span>
              <input
                value={fees}
                onChange={(event) => setFees(event.currentTarget.value)}
                placeholder="0" inputMode="decimal"
                className="record-composer-input"
              />
            </>
          ) : null}

          {kind === 'income' ? (
            <>
              <span className="record-composer-label">CATEGORY</span>
              <div className="app-panel-grid">
                {INCOME_CATEGORIES.map((incomeCategory) => (
                  <button
                    key={incomeCategory}
                    type="button" aria-selected={category === incomeCategory}
                    onClick={() => setCategory(incomeCategory)}
                    className={`record-composer-categoryOption${category === incomeCategory ? ' record-composer-categoryOptionSelected' : ''}`}
                  >
                    <span
                      className={`record-composer-categoryOptionText${category === incomeCategory ? ' record-composer-categoryOptionTextSelected' : ''}`}
                    >
                      {incomeCategory}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : kind !== 'list' && kind !== 'loan' && kind !== 'loan-repayment' && kind !== 'transfer' && kind !== 'note' ? (
            <>
              <span className="record-composer-label">
                {kind === 'task' ? 'PRIORITY' : kind === 'event' ? 'EVENT TYPE' : 'CATEGORY'}
              </span>
              <input
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
                placeholder={kind ? categoryHints[kind] : ''}
                className="record-composer-input"
              />
            </>
          ) : null}
          {kind === 'event' || kind === 'task' ? (
            <>
              <span className="record-composer-label">DATE · YYYY-MM-DD</span>
              <input
                value={date}
                onChange={(event) => setDate(event.currentTarget.value)}
                placeholder="YYYY-MM-DD"
                className="record-composer-input" autoCapitalize="off"
              />
            </>
          ) : null}
          {kind === 'loan' ? (
            <>
              <span className="record-composer-label">DUE DATE · OPTIONAL · YYYY-MM-DD</span>
              <input
                value={dueDate}
                onChange={(event) => setDueDate(event.currentTarget.value)}
                placeholder="YYYY-MM-DD"
                className="record-composer-input" autoCapitalize="off"
              />
            </>
          ) : null}
          {kind === 'list' ? (
            <ListComposer
              listItems={listItems}
              onListItemsChange={setListItems}
            />
          ) : kind === 'note' ? (
            editingNoteBody ? (
              <textarea
                autoFocus
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                aria-label="Note body"
                placeholder="Write your note here"
                className="record-composer-noteBodyInput"
                rows={6}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingNoteBody(true)}
                aria-label="Edit note body"
                className="record-composer-noteBodyPreview"
              >
                {notes || 'Tap to write your note'}
              </button>
            )
          ) : (
            <>
              <span className="record-composer-label">DETAILS</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                placeholder="Add a note (optional)"
                className="record-composer-input record-composer-multiline"
                rows={4}
              />
            </>
          )}
          <button
            disabled={saving}
            onClick={submit}
            type="button" className={`record-composer-save${saving ? ' record-composer-disabled' : ''}`}
          >
            <span className="record-composer-saveText">{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
