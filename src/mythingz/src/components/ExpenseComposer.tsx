import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../web/DatabaseProvider';
import type { CSSProperties } from 'react';
import {
  EXPENSE_CATEGORIES,
  getAccounts,
  InsufficientBalanceError,
  type Account,
  type ExpenseDraft,
} from '../services/database';
import { colors } from './theme';
import { AccountPicker } from './ui/account';
import { ItemizedItemsEditor } from './ui/itemizedItems';
import {
  createEmptyItemizedItem,
  parseItemizedItems,
  type ItemizedItem,
} from './ui/itemizedItemsModel';

type ExpenseComposerProps = {
  onClose: () => void;
  onSave: (draft: ExpenseDraft) => Promise<void>;
};

let nextExpenseComposerEntryId = 0;

export function ExpenseComposer({ onClose, onSave }: ExpenseComposerProps) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const historyEntryId = useRef<string | null>(null);
  const historyEntryReady = useRef(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [notes, setNotes] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [items, setItems] = useState<ItemizedItem[]>([createEmptyItemizedItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getAccounts(database)
      .then((rows) => {
        if (!active) return;
        setAccounts(rows);
        setAccountId((current) =>
          current !== null && rows.some((account) => account.id === current)
            ? current
            : rows[0]?.id ?? null,
        );
      })
      .catch((error: unknown) => {
        console.error('Unable to load accounts for expense', error);
        window.alert('Could not load accounts\n\nPlease try again.');
      });
    return () => { active = false; };
  }, [database]);

  const close = useCallback(() => {
    if (historyEntryId.current) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      navigate(-1);
    }
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    const state = location.state;
    const currentEntryId = typeof state === 'object' && state !== null
      && 'expenseComposerEntry' in state
      && typeof state.expenseComposerEntry === 'string'
      ? state.expenseComposerEntry
      : null;

    if (!historyEntryId.current) {
      const entryId = `expense-composer-${++nextExpenseComposerEntryId}`;
      historyEntryId.current = entryId;
      historyEntryReady.current = false;
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { state: { ...(state ?? {}), expenseComposerEntry: entryId } },
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
  }, [close, location, navigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      window.alert('Add an expense title\n\nEnter a name before saving.');
      return;
    }
    if (!accountId) {
      window.alert('Choose an account\n\nSelect the account this expense will be paid from.');
      return;
    }

    const parsedItems = parseItemizedItems(items);
    if (parsedItems === null) {
      window.alert('Check item quantity and price\n\nEnter a whole-number quantity of at least one and a valid unit price of zero or more.');
      return;
    }
    if (!parsedItems.length) {
      window.alert('Add expense items\n\nEnter at least one item before saving.');
      return;
    }
    const total = parsedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isFinite(total) || total <= 0) {
      window.alert('Check the expense total\n\nEnter item prices that add up to more than zero.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category: category.trim() || 'General',
        notes: notes.trim(),
        accountId,
        items: parsedItems,
      });
      close();
    } catch (error) {
      console.error('Unable to save expense', error);
      window.alert(error instanceof InsufficientBalanceError
        ? `Not enough available funds\n\n${error.message}`
        : `Could not save expense\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="record-composer-page" style={expenseStyles.backdrop} aria-label="Add expense">
      <div style={expenseStyles.sheet}>
        <div style={expenseStyles.header}>
          <h1 style={expenseStyles.heading}>Add expense</h1>
          <button onClick={close} type="button" style={expenseStyles.closeButton}>
            Cancel
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)} style={expenseStyles.form}>
          <label style={expenseStyles.label} htmlFor="expense-title">TITLE</label>
          <input
            id="expense-title"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="What was this expense for?"
            style={expenseStyles.input}
          />
          <label style={expenseStyles.label} htmlFor="expense-category">CATEGORY</label>
          <select
            id="expense-category"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            style={expenseStyles.input}
          >
            {EXPENSE_CATEGORIES.map((expenseCategory) => (
              <option key={expenseCategory} value={expenseCategory}>
                {expenseCategory}
              </option>
            ))}
          </select>
          <AccountPicker
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="PAID FROM · ACCOUNT"
          />
          <ItemizedItemsEditor
            items={items}
            onItemsChange={setItems}
            itemsLabel="EXPENSE ITEMS"
          />
          <label style={expenseStyles.label} htmlFor="expense-notes">NOTES · OPTIONAL</label>
          <textarea
            id="expense-notes"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            placeholder="Add a note"
            rows={3}
            style={expenseStyles.textarea}
          />
          <button
            type="submit"
            disabled={saving}
            style={Object.assign({}, expenseStyles.save, saving && expenseStyles.disabled)}
          >
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </div>
    </section>
  );
}

const expenseStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    width: '100%',
    minHeight: '100dvh',
    overflowY: 'auto',
    backgroundColor: colors.background,
  },
  sheet: {
    width: '100%',
    maxWidth: 960,
    minHeight: '100dvh',
    marginInline: 'auto',
    backgroundColor: colors.background,
    paddingInline: 12,
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  header: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBlock: 20,
    marginBottom: 8,
    borderBottom: `1px solid ${colors.line}`,
  },
  heading: { margin: 0, fontSize: 18, fontWeight: '800', color: colors.ink },
  closeButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: 14,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 760,
    marginInline: 'auto',
    paddingBottom: 12,
    paddingInline: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderRadius: 10,
    border: `1px solid ${colors.line}`,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingInline: 14,
    fontSize: 13,
  },
  textarea: {
    minHeight: 84,
    borderRadius: 10,
    border: `1px solid ${colors.line}`,
    backgroundColor: colors.surface,
    color: colors.ink,
    padding: 12,
    fontSize: 13,
    resize: 'vertical',
  },
  save: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 11,
    marginTop: 20,
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: { opacity: 0.6 },
} satisfies Record<string, CSSProperties>;
