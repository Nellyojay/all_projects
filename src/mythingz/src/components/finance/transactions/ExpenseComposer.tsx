import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../../web/DatabaseProvider';
import {
  EXPENSE_CATEGORIES,
  getAccounts,
  getAllocatableBudgetItems,
  InsufficientBalanceError,
  type Account,
  type ExpenseDraft,
  type BudgetPeriodItem,
} from '../../../services/database';
import { AccountPicker } from '../accounts/account';
import { ItemizedItemsEditor } from '../../lists/itemizedItems';
import './ExpenseComposer.css';
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
    budget_type: 'normal' | 'recurring';
    template_name: string;
    start_date: string | null;
    end_date: string | null;
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
    <section className="record-composer-page expense-composer-backdrop" aria-label="Add expense">
      <div className="expense-composer-sheet">
        <div className="expense-composer-header">
          <h1 className="expense-composer-heading">Add expense</h1>
          <button onClick={close} type="button" className="expense-composer-closeButton">
            Cancel
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)} className="expense-composer-form">
          <label className="expense-composer-label" htmlFor="expense-title">TITLE</label>
          <input
            id="expense-title"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="What was this expense for?"
            className="expense-composer-input"
          />
          <label className="expense-composer-label" htmlFor="expense-category">CATEGORY</label>
          <select
            id="expense-category"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
            className="expense-composer-input"
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
          <section className="expense-composer-budgetSection" aria-label="Optional budget allocation">
            <span className="expense-composer-label">BUDGET ALLOCATION · OPTIONAL</span>
            {budgetItems.length ? (
              <>
                <div className="expense-composer-allocationControls">
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
                    className="expense-composer-input"
                  >
                    <option value="">Choose a budget item</option>
                    {budgetItems.map((item) => {
                      return (
                        <option key={item.id} value={item.id}>
                          {item.budget_type === 'normal' ? 'Normal' : 'Recurring'} · {item.template_name} · {item.name}
                        </option>
                      );
                    })}
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
                    className="expense-composer-input"
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
                    className="expense-composer-addAllocation"
                  >
                    Add item
                  </button>
                </div>
                {budgetAllocations.map((allocation) => {
                  const item = budgetItems.find((candidate) => candidate.id === allocation.budgetItemId);
                  return (
                    <div key={allocation.budgetItemId} className="expense-composer-allocationRow">
                      <span className="expense-composer-allocationName">
                        {item
                          ? `${item.budget_type === 'normal' ? 'Normal' : 'Recurring'} · ${item.template_name} · ${item.name}`
                          : 'Budget item'}
                      </span>
                      <span>{allocation.amount.toLocaleString('en-UG')} UGX</span>
                      <button
                        type="button"
                        aria-label={`Remove ${item?.name ?? 'budget item'} allocation`}
                        onClick={() => setBudgetAllocations((current) =>
                          current.filter((entry) => entry.budgetItemId !== allocation.budgetItemId),
                        )}
                        className="expense-composer-removeAllocation"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                <span className="expense-composer-allocationBalance">
                  {allocatedTotal > 0
                    ? `${Math.max(0, allocationRemainder).toLocaleString('en-UG')} UGX remains unallocated. You can leave this balance unassigned.`
                    : 'Choose one or more items, or leave the full expense unallocated.'}
                </span>
              </>
            ) : (
              <span className="expense-composer-allocationBalance">
                No active normal or recurring budget items cover today.
              </span>
            )}
          </section>
          <label className="expense-composer-label" htmlFor="expense-notes">NOTES · OPTIONAL</label>
          <textarea
            id="expense-notes"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            placeholder="Add a note"
            rows={3}
            className="expense-composer-textarea"
          />
          <button
            type="submit"
            disabled={saving}
            className={`expense-composer-save${saving ? ' expense-composer-disabled' : ''}`}
          >
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </div>
    </section>
  );
}
