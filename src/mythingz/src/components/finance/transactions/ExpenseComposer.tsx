import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../../web/DatabaseProvider';
import type { CSSProperties } from 'react';
import {
  EXPENSE_CATEGORIES,
  getAccounts,
  getAllocatableBudgetItems,
  InsufficientBalanceError,
  type Account,
  type ExpenseDraft,
  type BudgetPeriodItem,
} from '../../../services/database';
import { colors } from '../../shared/theme';
import { AccountPicker } from '../accounts/account';
import { ItemizedItemsEditor } from '../../lists/itemizedItems';
import {
  createEmptyItemizedItem,
  parseItemizedItems,
  type ItemizedItem,
} from '../../lists/itemizedItemsModel';

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
  const [budgetItems, setBudgetItems] = useState<(BudgetPeriodItem & {
    template_name: string;
    start_date: string;
    end_date: string;
  })[]>([]);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState('');
  const [budgetAllocationAmount, setBudgetAllocationAmount] = useState('');
  const [budgetAllocations, setBudgetAllocations] = useState<NonNullable<ExpenseDraft['budgetAllocations']>>([]);
  const [saving, setSaving] = useState(false);
  const expenseTotal = items.reduce((sum, item) => {
    const price = item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0;
    const quantity = item.quantity.trim() ? Number(item.quantity) : 1;
    return Number.isFinite(price) && Number.isFinite(quantity) ? sum + price * quantity : sum;
  }, 0);
  const allocatedTotal = budgetAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const allocationRemainder = expenseTotal - allocatedTotal;
  console.log("Budget items:", budgetItems);

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

  useEffect(() => {
    let active = true;
    void getAllocatableBudgetItems(database)
      .then((rows) => { if (active) setBudgetItems(rows); })
      .catch((error: unknown) => {
        console.error('Unable to load budget items', error);
        if (active) window.alert('Could not load budgets\n\nPlease try again.');
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
    if (budgetAllocations.reduce((sum, item) => sum + item.amount, 0) > total) {
      window.alert('Check budget allocation\n\nAllocated amounts cannot exceed the expense total.');
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
        budgetAllocations,
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
          <section style={expenseStyles.budgetSection} aria-label="Optional budget allocation">
            <span style={expenseStyles.label}>BUDGET ALLOCATION · OPTIONAL</span>
            {budgetItems.length ? (
              <>
                <div style={expenseStyles.allocationControls}>
                  <select
                    value={selectedBudgetItemId}
                    onChange={(event) => {
                      const selectedId = event.currentTarget.value;
                      setSelectedBudgetItemId(selectedId);
                      const selectedItem = budgetItems.find((item) => String(item.id) === selectedId);
                      setBudgetAllocationAmount(
                        selectedItem ? String(selectedItem.actual_amount) : '',
                      );
                    }}
                    aria-label="Choose a budget item"
                    style={expenseStyles.input}
                  >
                    <option value="">Choose a budget item</option>
                    {budgetItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.template_name} · {item.name} ({item.start_date}–{item.end_date})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={Math.max(0, allocationRemainder)}
                    value={budgetAllocationAmount}
                    onChange={(event) => setBudgetAllocationAmount(event.currentTarget.value)}
                    placeholder={`Amount · up to ${Math.max(0, allocationRemainder)}`}
                    aria-label="Amount to allocate to this budget item"
                    style={expenseStyles.input}
                  />
                  <button
                    type="button"
                    disabled={!selectedBudgetItemId || !budgetAllocationAmount}
                    onClick={() => {
                      const budgetItemId = Number(selectedBudgetItemId);
                      const amount = Number(budgetAllocationAmount);
                      if (!Number.isSafeInteger(amount) || amount <= 0
                        || budgetAllocations.some((allocation) => allocation.budgetItemId === budgetItemId)
                        || amount > allocationRemainder) {
                        window.alert('Check budget allocation\n\nChoose a new item and a whole amount within the unallocated balance.');
                        return;
                      }
                      setBudgetAllocations((current) => [...current, { budgetItemId, amount }]);
                      setSelectedBudgetItemId('');
                      setBudgetAllocationAmount('');
                    }}
                    style={expenseStyles.addAllocation}
                  >
                    Add item
                  </button>
                </div>
                {budgetAllocations.map((allocation) => {
                  const item = budgetItems.find((candidate) => candidate.id === allocation.budgetItemId);
                  return (
                    <div key={allocation.budgetItemId} style={expenseStyles.allocationRow}>
                      <span style={expenseStyles.allocationName}>
                        {item ? `${item.template_name} · ${item.name}` : 'Budget item'}
                      </span>
                      <span>{allocation.amount.toLocaleString('en-UG')} UGX</span>
                      <button
                        type="button"
                        aria-label={`Remove ${item?.name ?? 'budget item'} allocation`}
                        onClick={() => setBudgetAllocations((current) =>
                          current.filter((entry) => entry.budgetItemId !== allocation.budgetItemId),
                        )}
                        style={expenseStyles.removeAllocation}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                <span style={expenseStyles.allocationBalance}>
                  {allocatedTotal > 0
                    ? `${Math.max(0, allocationRemainder).toLocaleString('en-UG')} UGX remains unallocated. You can leave this balance unassigned.`
                    : 'Choose one or more items, or leave the full expense unallocated.'}
                </span>
              </>
            ) : (
              <span style={expenseStyles.allocationBalance}>No active recurring budget items cover today.</span>
            )}
          </section>
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
  budgetSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
    padding: 12,
    border: `1px solid ${colors.line}`,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  allocationControls: { display: 'flex', flexDirection: 'column', gap: 8 },
  addAllocation: {
    minHeight: 40,
    alignSelf: 'flex-start',
    paddingInline: 14,
    borderRadius: 8,
    backgroundColor: colors.green,
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  allocationRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    fontSize: 10,
    color: colors.ink,
  },
  allocationName: { flex: 1 },
  removeAllocation: { color: colors.muted, fontSize: 9 },
  allocationBalance: { color: colors.muted, fontSize: 10, lineHeight: '16px' },
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
