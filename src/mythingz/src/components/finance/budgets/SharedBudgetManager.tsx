import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useDatabase } from '../../../web/DatabaseProvider';
import {
  adjustSharedBudgetItem,
  createNormalBudget,
  getSharedBudgetItems,
  getSharedBudgets,
  getUnallocatedExpenses,
  setSharedBudgetClosed,
} from '../../../services/database';
import type { SharedBudget, SharedBudgetItem, Transaction } from '../../../services/database';
import { ItemizedItemsEditor } from '../../lists/itemizedItems';
import { BudgetCreationModal } from './BudgetCreationModal';
import { BudgetGeneralFields } from './BudgetGeneralFields';
import { UnallocatedExpenses } from './recurringBudgets/UnallocatedExpenses';
import './recurringBudgets/RecurringBudgetStyles.css';
import './SharedBudgetManager.css';

type SharedBudgetManagerProps = {
  query: string;
  createRequested: boolean;
  onCreateHandled: () => void;
  onOpenExpense: (transactionId: number) => void;
};
type DraftItem = { draftId: number; name: string; allocatedAmount: string };
type UnallocatedExpense = Transaction & { unallocated_amount: number };

let nextDraftItemId = 0;

const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAfterMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return localDateKey(date);
}

function emptyDraftItem(): DraftItem {
  return { draftId: ++nextDraftItemId, name: '', allocatedAmount: '' };
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function SharedBudgetManager({
  query,
  createRequested,
  onCreateHandled,
  onOpenExpense,
}: SharedBudgetManagerProps) {
  const database = useDatabase();
  const [budgets, setBudgets] = useState<SharedBudget[]>([]);
  const [unallocated, setUnallocated] = useState<UnallocatedExpense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(localDateKey());
  const [endDate, setEndDate] = useState(dateAfterMonth());
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [saving, setSaving] = useState(false);
  const [expandedBudgetId, setExpandedBudgetId] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<{ budgetId: number; items: SharedBudgetItem[] } | null>(null);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<number, string>>({});
  const [pendingClose, setPendingClose] = useState<number | null>(null);
  const [showAllUnallocated, setShowAllUnallocated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [budgetRows, expenses] = await Promise.all([
        getSharedBudgets(database, 'normal'),
        getUnallocatedExpenses(database),
      ]);
      setBudgets(budgetRows);
      setUnallocated(expenses as UnallocatedExpense[]);
      setError(null);
    } catch (reason) {
      console.error('Unable to load shared budget data', reason);
      setError('Budgets could not be loaded. Please try again.');
    } finally {
      setLoaded(true);
    }
  }, [database]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createOpen = createRequested;

  useEffect(() => {
    if (expandedBudgetId === null) return;
    let active = true;
    void getSharedBudgetItems(database, expandedBudgetId).then((items) => {
      if (!active) return;
      setExpandedItems({ budgetId: expandedBudgetId, items });
      setAllocationDrafts(Object.fromEntries(items.map((item) => [item.id, String(item.allocated_amount)])));
    }).catch((reason: unknown) => {
      console.error('Unable to load shared budget items', reason);
      if (active) setError('Budget details could not be loaded.');
    });
    return () => { active = false; };
  }, [database, expandedBudgetId]);

  const visibleBudgets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return budgets.filter((budget) =>
      !normalized || `${budget.name} ${budget.description} ${budget.status}`.toLowerCase().includes(normalized),
    );
  }, [budgets, query]);
  const unallocatedTotal = unallocated.reduce((sum, expense) => sum + expense.unallocated_amount, 0);

  const resetDraft = () => {
    setName('');
    setDescription('');
    setStartDate(localDateKey());
    setEndDate(dateAfterMonth());
    setDraftItems([emptyDraftItem()]);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createNormalBudget(database, {
        name,
        description,
        startDate,
        endDate,
        items: draftItems.map((item) => ({
          name: item.name,
          allocatedAmount: Number(item.allocatedAmount),
        })),
      });
      resetDraft();
      onCreateHandled();
      await refresh();
    } catch (reason) {
      console.error('Unable to create normal budget', reason);
      setError(reason instanceof Error ? reason.message : 'The budget could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const saveAllocation = async (item: SharedBudgetItem) => {
    const amount = Number(allocationDrafts[item.id]);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setError('Enter a whole, non-negative allocation amount.');
      return;
    }
    try {
      await adjustSharedBudgetItem(database, item.id, amount, 'Allocation updated');
      setError(null);
      await refresh();
      if (expandedBudgetId !== null) {
        const items = await getSharedBudgetItems(database, expandedBudgetId);
        setExpandedItems({ budgetId: expandedBudgetId, items });
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('below current spending')
        && window.confirm(`${reason.message}\n\nDo you want to confirm this allocation reduction?`)) {
        try {
          await adjustSharedBudgetItem(database, item.id, amount, 'Confirmed allocation reduction', true);
          setError(null);
          await refresh();
          if (expandedBudgetId !== null) {
            const items = await getSharedBudgetItems(database, expandedBudgetId);
            setExpandedItems({ budgetId: expandedBudgetId, items });
          }
          return;
        } catch (retryError) {
          console.error('Unable to confirm budget allocation change', retryError);
          setError(retryError instanceof Error ? retryError.message : 'The allocation could not be changed.');
          return;
        }
      }
      console.error('Unable to change budget allocation', reason);
      setError(reason instanceof Error ? reason.message : 'The allocation could not be changed.');
    }
  };

  const changeStatus = async (budget: SharedBudget, closed: boolean) => {
    try {
      await setSharedBudgetClosed(
        database,
        budget.id,
        closed,
        closed ? 'Closed after reviewing actual spending and unallocated expenses' : 'Budget reopened',
      );
      setPendingClose(null);
      setError(null);
      await refresh();
    } catch (reason) {
      console.error('Unable to update budget status', reason);
      setError(reason instanceof Error ? reason.message : 'The budget status could not be changed.');
    }
  };

  return (
    <div>
      {error ? (
        <div role="alert" className="normal-budget-card-panel normal-budget-inline-error">
          {error}
          <button type="button" onClick={() => void refresh()} className="normal-budget-action normal-budget-action--spaced">
            Retry
          </button>
        </div>
      ) : null}



      {createOpen ? (
        <BudgetCreationModal
          title="Create normal budget"
          onClose={() => { onCreateHandled(); resetDraft(); }}
        >
          <form onSubmit={(event) => void save(event)} className="normal-budget-card-panel">
            {error ? <div role="alert" className="normal-budget-card-panel normal-budget-form-error">{error}</div> : null}
            <BudgetGeneralFields
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
            />
            <div className="normal-budget-form-grid normal-budget-form-grid--spaced">
              <label className="normal-budget-field">
                Start date
                <input required type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} className="normal-budget-input" />
              </label>
              <label className="normal-budget-field">
                End date
                <input required type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} className="normal-budget-input" />
              </label>
            </div>
            <ItemizedItemsEditor
              items={draftItems.map((item) => ({
                editorKey: `normal-${item.draftId}`,
                text: item.name,
                done: false,
                price: item.allocatedAmount,
                quantity: '1',
              }))}
              onItemsChange={(action) => setDraftItems((current) => {
                const itemized = current.map((item) => ({
                  editorKey: `normal-${item.draftId}`,
                  text: item.name,
                  done: false,
                  price: item.allocatedAmount,
                  quantity: '1',
                }));
                const next = typeof action === 'function' ? action(itemized) : action;
                const currentByKey = new Map(current.map((item) => [`normal-${item.draftId}`, item]));
                return next.map((item) => {
                  const previous = item.editorKey ? currentByKey.get(item.editorKey) : undefined;
                  return {
                    draftId: previous?.draftId ?? ++nextDraftItemId,
                    name: item.text,
                    allocatedAmount: item.price,
                  };
                });
              })}
              monochrome
              showQuantity={false}
              itemsLabel="BUDGET ITEMS"
              totalLabel="Budget total"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" disabled={saving} className="normal-budget-action">
                {saving ? 'Saving…' : 'Create budget'}
              </button>
            </div>
          </form>
        </BudgetCreationModal>
      ) : null}

      {loaded && !visibleBudgets.length ? (
        <section className="recurring-budget-card">
          <h2 className="recurring-budget-subheading">Normal budgets</h2>
          <p className="recurring-budget-muted">No normal budgets yet. Create a budget to plan spending for a date range.</p>
        </section>
      ) : null}

      {visibleBudgets.map((budget) => {
        const expanded = expandedBudgetId === budget.id;
        const items = expandedItems?.budgetId === budget.id ? expandedItems.items : [];
        return (
          <article key={budget.id} className="recurring-budget-card">
            <button
              type="button"
              className="budget-template-periods-toggle normal-budget-card-toggle"
              onClick={() => {
                setExpandedBudgetId(expanded ? null : budget.id);
                setPendingClose(null);
              }}
              aria-expanded={expanded}
            >
              <span className="normal-budget-card-heading">
                <strong className="recurring-budget-subheading">{budget.name}</strong>
                <span className="recurring-budget-muted">
                  {budget.start_date ?? 'No start date'} – {budget.end_date ?? 'No end date'}
                </span>
              </span>
              <span className="normal-budget-card-status">
                <span className="recurring-budget-status">
                  {statusLabel(budget.status)}
                </span>
                <span aria-hidden="true" style={{ color: '#A3A3A3' }}>{expanded ? '⌄' : '›'}</span>
              </span>
              <span className="budget-template-periods-label">Budget summary</span>
              <span className="recurring-budget-template-items">
                <span className="recurring-budget-item-summary">Allocated: {money(budget.total_allocated)}</span>
                <span className="recurring-budget-item-summary">Spent: {money(budget.actual_amount)}</span>
                <span className="recurring-budget-item-summary">Remaining: {money(budget.remaining_amount)}</span>
              </span>
            </button>
            {expanded ? (
              <div style={{ marginTop: 4, borderTop: '1px solid #303030', paddingTop: 12 }}>
                <div className="normal-budget-summary-grid">
                  <span>Allocated <strong>{money(budget.total_allocated)}</strong></span>
                  <span>Actual <strong>{money(budget.actual_amount)}</strong></span>
                  <span>Remaining <strong>{money(budget.remaining_amount)}</strong></span>
                </div>
                {budget.description ? <p className="normal-budget-muted">{budget.description}</p> : null}
                {items.map((item) => (
                  <div key={item.id} className="normal-budget-item-row">
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block' }}>{item.name}</strong>
                      <span className="normal-budget-muted">
                        {money(item.actual_amount)} spent · {money(item.remaining_amount)} remaining
                      </span>
                    </span>
                    {budget.status !== 'closed' ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          aria-label={`Allocation for ${item.name}`}
                          type="number"
                          min="0"
                          step="1"
                          value={allocationDrafts[item.id] ?? String(item.allocated_amount)}
                          onChange={(event) => setAllocationDrafts((drafts) => ({
                            ...drafts,
                            [item.id]: event.currentTarget.value,
                          }))}
                          className="normal-budget-input normal-budget-input--allocation"
                        />
                        <button type="button" onClick={() => void saveAllocation(item)} className="normal-budget-action">Save</button>
                      </div>
                    ) : <strong>{money(item.allocated_amount)}</strong>}
                  </div>
                ))}
                {pendingClose === budget.id ? (
                  <div className="normal-budget-card-panel normal-budget-close-review">
                    <strong>Review before closing</strong>
                    <p className="normal-budget-muted">
                      Allocated {money(budget.total_allocated)} · actual spending {money(budget.actual_amount)} ·
                      {' '}{money(budget.remaining_amount)} remaining. Review the unallocated expenses above
                      ({unallocated.length} pending, {money(unallocatedTotal)}) before confirming.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => void changeStatus(budget, true)} className="normal-budget-action">
                        Confirm close
                      </button>
                      <button type="button" onClick={() => setPendingClose(null)} className="normal-budget-action">Cancel</button>
                    </div>
                  </div>
                ) : null}
                {budget.status === 'closed' ? (
                  <button type="button" onClick={() => void changeStatus(budget, false)} className="normal-budget-action normal-budget-close-action">
                    Reopen budget
                  </button>
                ) : (
                  <button type="button" onClick={() => setPendingClose(budget.id)} className="normal-budget-action normal-budget-close-action">
                    Review and close budget
                  </button>
                )}
              </div>
            ) : null}
          </article>
        );
      })}

      <UnallocatedExpenses
        expenses={unallocated}
        onOpenExpense={onOpenExpense}
        dashboard
        showAll={showAllUnallocated}
        onToggleShowAll={() => setShowAllUnallocated((shown) => !shown)}
      />
    </div>
  );
}
