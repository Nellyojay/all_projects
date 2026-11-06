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
import { DetailsModal } from '../../shared/DetailsModal';
import { BudgetCreationModal } from './BudgetCreationModal';
import { BudgetGeneralFields } from './BudgetGeneralFields';
import { UnallocatedExpenses } from './recurringBudgets/UnallocatedExpenses';
import { useModalBack } from '../../shared/ModalBackContext';
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
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [selectedBudgetItems, setSelectedBudgetItems] = useState<{ budgetId: number; items: SharedBudgetItem[] } | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<number, string>>({});
  const [pendingClose, setPendingClose] = useState<number | null>(null);
  const [showAllUnallocated, setShowAllUnallocated] = useState(false);
  const closeBudgetDetails = useCallback(() => {
    setSelectedBudgetId(null);
    setPendingClose(null);
  }, []);
  useModalBack(selectedBudgetId !== null, closeBudgetDetails);

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
    if (selectedBudgetId === null) return;
    let active = true;
    void getSharedBudgetItems(database, selectedBudgetId).then((items) => {
      if (!active) return;
      setSelectedBudgetItems({ budgetId: selectedBudgetId, items });
      setAllocationDrafts(Object.fromEntries(items.map((item) => [item.id, String(item.allocated_amount)])));
      setDetailsError(null);
    }).catch((reason: unknown) => {
      console.error('Unable to load shared budget items', reason);
      if (active) {
        setDetailsError('Budget items could not be loaded. Close and reopen this budget to try again.');
        setSelectedBudgetItems({ budgetId: selectedBudgetId, items: [] });
      }
    });
    return () => { active = false; };
  }, [database, selectedBudgetId]);

  const visibleBudgets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return budgets.filter((budget) =>
      !normalized || `${budget.name} ${budget.description} ${budget.status}`.toLowerCase().includes(normalized),
    );
  }, [budgets, query]);
  const selectedBudget = budgets.find((budget) => budget.id === selectedBudgetId) ?? null;
  const selectedItems = selectedBudgetItems?.budgetId === selectedBudgetId
    ? selectedBudgetItems.items
    : [];
  const loadingSelectedItems = selectedBudgetId !== null
    && selectedBudgetItems?.budgetId !== selectedBudgetId;
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
      if (selectedBudgetId !== null) {
        const items = await getSharedBudgetItems(database, selectedBudgetId);
        setSelectedBudgetItems({ budgetId: selectedBudgetId, items });
      }
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('below current spending')
        && window.confirm(`${reason.message}\n\nDo you want to confirm this allocation reduction?`)) {
        try {
          await adjustSharedBudgetItem(database, item.id, amount, 'Confirmed allocation reduction', true);
          setError(null);
          await refresh();
          if (selectedBudgetId !== null) {
            const items = await getSharedBudgetItems(database, selectedBudgetId);
            setSelectedBudgetItems({ budgetId: selectedBudgetId, items });
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
        return (
          <article key={budget.id} className="recurring-budget-card">
            <button
              type="button"
              className="budget-template-periods-toggle normal-budget-card-toggle"
              onClick={() => {
                setSelectedBudgetId(budget.id);
                setPendingClose(null);
                setError(null);
                setDetailsError(null);
              }}
              aria-haspopup="dialog"
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
                <span aria-hidden="true" style={{ color: '#A3A3A3' }}>›</span>
              </span>
              <span className="budget-template-periods-label">Budget summary</span>
              <span className="recurring-budget-template-items">
                <span className="recurring-budget-item-summary">Allocated: {money(budget.total_allocated)}</span>
                <span className="recurring-budget-item-summary">Spent: {money(budget.actual_amount)}</span>
                <span className="recurring-budget-item-summary">Remaining: {money(budget.remaining_amount)}</span>
              </span>
            </button>
          </article>
        );
      })}

      {selectedBudget ? (
        <DetailsModal
          label={`${selectedBudget.name} budget details`}
          title={selectedBudget.name}
          onClose={closeBudgetDetails}
        >
          <h1 className="normal-budget-details-title">Budget overview</h1>
          {error ? <p role="alert" className="normal-budget-inline-error">{error}</p> : null}
          {detailsError ? <p role="alert" className="normal-budget-inline-error">{detailsError}</p> : null}
          <div className="record-details-infoCard normal-budget-details-summary">
            {selectedBudget.start_date || selectedBudget.end_date ? (
              <>
                <span className="record-details-infoLabel">PERIOD</span>
                <span className="record-details-infoValue">
                  {selectedBudget.start_date ?? 'No start date'} – {selectedBudget.end_date ?? 'No end date'}
                </span>
              </>
            ) : null}
            <span className="record-details-infoLabel">STATUS</span>
            <span className="record-details-infoValue">{statusLabel(selectedBudget.status)}</span>
            <div className="normal-budget-summary-grid">
              <span>Allocated <strong>{money(selectedBudget.total_allocated)}</strong></span>
              <span>Actual expenses <strong>{money(selectedBudget.actual_amount)}</strong></span>
              <span>Remaining <strong>{money(selectedBudget.remaining_amount)}</strong></span>
            </div>
          </div>
          {selectedBudget.description ? (
            <p className="normal-budget-muted normal-budget-details-description">{selectedBudget.description}</p>
          ) : null}
          <section className="normal-budget-details-items" aria-label="Budget items and allocations">
            <h2 className="recurring-budget-subheading">Budget items</h2>
            {loadingSelectedItems ? (
              <p className="normal-budget-muted">Loading budget items…</p>
            ) : selectedItems.length ? selectedItems.map((item) => (
              <div key={item.id} className="normal-budget-item-row">
                <span className="normal-budget-item-copy">
                  <strong>{item.name}</strong>
                  <span className="normal-budget-muted">
                    {money(item.actual_amount)} in expenses · {money(item.remaining_amount)} remaining
                  </span>
                </span>
                {selectedBudget.status !== 'closed' ? (
                  <div className="normal-budget-allocation-control">
                    <input
                      aria-label={`Allocation for ${item.name}`}
                      type="number"
                      min="0"
                      step="1"
                      value={allocationDrafts[item.id] ?? String(item.allocated_amount)}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setAllocationDrafts((drafts) => ({
                          ...drafts,
                          [item.id]: value,
                        }));
                      }}
                      className="normal-budget-input normal-budget-input--allocation"
                    />
                    <button type="button" onClick={() => void saveAllocation(item)} className="normal-budget-action">Save</button>
                  </div>
                ) : <strong>{money(item.allocated_amount)}</strong>}
              </div>
            )) : !loadingSelectedItems ? (
              <p className="normal-budget-muted">No items have been added to this budget.</p>
            ) : null}
          </section>
          {pendingClose === selectedBudget.id ? (
            <div className="normal-budget-card-panel normal-budget-close-review">
              <strong>Review before closing</strong>
              <p className="normal-budget-muted">
                Closing only locks this budget; it does not create or change expenses. Actual expenses remain separate records and count toward this budget when allocated.
                {' '}Allocated {money(selectedBudget.total_allocated)} · actual expenses {money(selectedBudget.actual_amount)} ·
                {' '}{money(selectedBudget.remaining_amount)} remaining.
              </p>
              <div className="normal-budget-review-actions">
                <button type="button" onClick={() => void changeStatus(selectedBudget, true)} className="normal-budget-action">
                  Confirm close
                </button>
                <button type="button" onClick={() => setPendingClose(null)} className="normal-budget-action">Cancel</button>
              </div>
            </div>
          ) : null}
          {selectedBudget.status === 'closed' ? (
            <button type="button" onClick={() => void changeStatus(selectedBudget, false)} className="normal-budget-action normal-budget-close-action">
              Reopen budget
            </button>
          ) : (
            <button type="button" onClick={() => setPendingClose(selectedBudget.id)} className="normal-budget-action normal-budget-close-action">
              Review and close budget
            </button>
          )}
        </DetailsModal>
      ) : null}

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
