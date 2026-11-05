import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
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
import { colors } from '../../shared/theme';
import { ItemizedItemsEditor } from '../../lists/itemizedItems';
import { BudgetCreationModal } from './BudgetCreationModal';
import { BudgetGeneralFields } from './BudgetGeneralFields';
import { UnallocatedExpenses } from './recurringBudgets/UnallocatedExpenses';
import { budgetStyles } from './recurringBudgets/RecurringBudgetStyles';

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

const cardStyle: CSSProperties = {
  background: '#191919',
  border: '1px solid #303030',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
};
const mutedStyle: CSSProperties = { color: colors.muted, fontSize: 13 };
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  background: '#111',
  border: '1px solid #303030',
  borderRadius: 8,
  color: colors.ink,
  font: 'inherit',
};
const actionStyle: CSSProperties = {
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #454545',
  background: '#222',
  color: colors.ink,
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
};

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
        <div role="alert" style={{ ...cardStyle, color: '#f0f0f0', borderColor: '#555' }}>
          {error}
          <button type="button" onClick={() => void refresh()} style={{ ...actionStyle, marginLeft: 12 }}>
            Retry
          </button>
        </div>
      ) : null}



      {createOpen ? (
        <BudgetCreationModal
          title="Create normal budget"
          onClose={() => { onCreateHandled(); resetDraft(); }}
        >
          <form onSubmit={(event) => void save(event)} style={cardStyle}>
            {error ? <div role="alert" style={{ ...cardStyle, marginBottom: 12 }}>{error}</div> : null}
            <BudgetGeneralFields
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
            />
            <div style={{ ...formGridStyle, marginTop: 12 }}>
              <label style={fieldStyle}>
                Start date
                <input required type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} style={inputStyle} />
              </label>
              <label style={fieldStyle}>
                End date
                <input required type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} style={inputStyle} />
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
              <button type="submit" disabled={saving} style={actionStyle}>
                {saving ? 'Saving…' : 'Create budget'}
              </button>
            </div>
          </form>
        </BudgetCreationModal>
      ) : null}

      {loaded && !visibleBudgets.length ? (
        <section style={budgetStyles.card}>
          <h2 style={budgetStyles.subheading}>Normal budgets</h2>
          <p style={budgetStyles.muted}>No normal budgets yet. Create a budget to plan spending for a date range.</p>
        </section>
      ) : null}

      {visibleBudgets.map((budget) => {
        const expanded = expandedBudgetId === budget.id;
        const items = expandedItems?.budgetId === budget.id ? expandedItems.items : [];
        return (
          <article key={budget.id}>
            <button
              type="button"
              className="budget-template-periods-toggle"
              onClick={() => {
                setExpandedBudgetId(expanded ? null : budget.id);
                setPendingClose(null);
              }}
              aria-expanded={expanded}

              style={budgetStyles.card}
            >
              <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={budgetStyles.subheading}>{budget.name}</strong>
                <span style={budgetStyles.muted}>
                  {budget.start_date ?? 'No start date'} – {budget.end_date ?? 'No end date'}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...budgetStyles.status, whiteSpace: 'nowrap' }}>
                  {statusLabel(budget.status)}
                </span>
                <span aria-hidden="true" style={{ color: colors.muted }}>{expanded ? '⌄' : '›'}</span>
              </span>
              <span className="budget-template-periods-label">Budget summary</span>
              <span style={budgetStyles.templateItems}>
                <span style={budgetStyles.itemSummary}>Allocated: {money(budget.total_allocated)}</span>
                <span style={budgetStyles.itemSummary}>Spent: {money(budget.actual_amount)}</span>
                <span style={budgetStyles.itemSummary}>Remaining: {money(budget.remaining_amount)}</span>
              </span>
            </button>
            {expanded ? (
              <div style={{ marginTop: 4, borderTop: '1px solid #303030', paddingTop: 12 }}>
                <div style={summaryGridStyle}>
                  <span>Allocated <strong>{money(budget.total_allocated)}</strong></span>
                  <span>Actual <strong>{money(budget.actual_amount)}</strong></span>
                  <span>Remaining <strong>{money(budget.remaining_amount)}</strong></span>
                </div>
                {budget.description ? <p style={mutedStyle}>{budget.description}</p> : null}
                {items.map((item) => (
                  <div key={item.id} style={{ ...baseRowStyle, ...budgetStyles.periodItem }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block' }}>{item.name}</strong>
                      <span style={mutedStyle}>
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
                          style={{ ...inputStyle, width: 120 }}
                        />
                        <button type="button" onClick={() => void saveAllocation(item)} style={actionStyle}>Save</button>
                      </div>
                    ) : <strong>{money(item.allocated_amount)}</strong>}
                  </div>
                ))}
                {pendingClose === budget.id ? (
                  <div style={{ ...cardStyle, marginTop: 12, marginBottom: 8, background: '#222' }}>
                    <strong>Review before closing</strong>
                    <p style={mutedStyle}>
                      Allocated {money(budget.total_allocated)} · actual spending {money(budget.actual_amount)} ·
                      {' '}{money(budget.remaining_amount)} remaining. Review the unallocated expenses above
                      ({unallocated.length} pending, {money(unallocatedTotal)}) before confirming.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => void changeStatus(budget, true)} style={actionStyle}>
                        Confirm close
                      </button>
                      <button type="button" onClick={() => setPendingClose(null)} style={actionStyle}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                {budget.status === 'closed' ? (
                  <button type="button" onClick={() => void changeStatus(budget, false)} style={{ ...actionStyle, marginTop: 10 }}>
                    Reopen budget
                  </button>
                ) : (
                  <button type="button" onClick={() => setPendingClose(budget.id)} style={{ ...actionStyle, marginTop: 10 }}>
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

const baseRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  paddingBlock: 10,
  borderBottom: '1px solid #303030',
  color: colors.ink,
};
const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: colors.muted,
  fontSize: 13,
};
const formGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 10,
};
const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
  color: colors.muted,
  fontSize: 13,
};
