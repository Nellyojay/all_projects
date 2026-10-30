import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent, CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import type { BrowserDatabase } from '../../web/database';
import {
  deleteRecord,
  finalizeBudgetList,
  InsufficientFundsError,
  reopenBudgetList,
  toggleListItem,
} from '../../services/database';
import type { EventRecord, ListItem, ListRecord, RecordDraft } from '../../services/database';
import { colors, styles } from '../theme';

type ListRecordOptions = { budgetOnly?: boolean; eventId?: number };

export function loadLists(database: BrowserDatabase, options: ListRecordOptions = {}) {
  const conditions = [
    options.budgetOnly ? 'lists.budget_enabled = 1' : '',
    options.eventId === undefined ? '' : 'lists.event_id = ?',
  ].filter(Boolean);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const params = options.eventId === undefined ? [] : [options.eventId];

  return database.getAllAsync<ListRecord>(
    `SELECT lists.*, events.title AS event_title
     FROM lists
     LEFT JOIN events ON events.id = lists.event_id
     ${where}
     ORDER BY lists.id DESC`,
    ...params,
  );
}

function listItems(list: ListRecord): ListItem[] {
  return JSON.parse(list.items) as ListItem[];
}

function listTotal(items: ListItem[], checkedOnly = false) {
  return items.reduce((total, item) => total + (
    checkedOnly && !item.done
      ? 0
      : (Number(item.price) || 0) * (Number(item.quantity) || 1)
  ), 0);
}

const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export function OrganizerLists({
  lists,
  query,
  onChanged,
}: {
  lists: ListRecord[];
  query: string;
  onChanged: () => Promise<void>;
}) {
  const filtered = useMemo(() => lists.filter((list) =>
    `${list.title} ${list.items}`.toLowerCase().includes(query.toLowerCase()),
  ), [lists, query]);

  return filtered.length ? (
    <>
      {filtered.map((list) => <OrganizerListCard key={list.id} list={list} onChanged={onChanged} />)}
    </>
  ) : (
    <EmptyListState title="No lists yet" detail="Make a checklist for shopping, packing, or anything else." />
  );
}

function OrganizerListCard({
  list,
  onChanged,
}: {
  list: ListRecord;
  onChanged: () => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const items = listItems(list);

  const remove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!window.confirm(`Delete item?\n\nRemove “${list.title}”?`)) return;
    void deleteRecord(database, 'lists', list.id).then(onChanged).catch((error: unknown) => {
      console.error('Unable to delete list', error);
      window.alert('Could not delete\n\nPlease try again.');
    });
  };

  return (
    <div style={Object.assign({}, styles.panel, listStyles.organizerCard)}>
      <button
        type="button"
        style={listStyles.organizerListButton}
        onClick={() => navigate(`/space/records/list/${list.id}`, { state: { from: location.pathname } })}
        onContextMenu={remove}
      >
        <span style={listStyles.organizerTitle}>{list.title}</span>
        <span style={listStyles.organizerBody}>
          {items.length
            ? `${items.filter((item) => item.done).length} of ${items.length} items complete`
            : 'No items yet'}
        </span>
        {list.budget_enabled ? (
          <span style={listStyles.organizerBody}>
            {list.finalized ? 'Finalized · ' : 'Budget · '}{money(listTotal(items))}
          </span>
        ) : list.finalized ? (
          <span style={listStyles.organizerBody}>Finalized · list locked</span>
        ) : null}
        {list.event_id !== null && list.event_title ? (
          <span style={listStyles.eventTag}>EVENT · {list.event_title}</span>
        ) : null}
        <span style={listStyles.organizerHint}>
          {list.finalized ? 'Tap to review or reopen' : 'Tap to view and check items · hold title to delete'}
        </span>
      </button>
    </div>
  );
}

export function FinanceBudgetLists({ lists, query }: { lists: ListRecord[]; query: string }) {
  const filtered = useMemo(() => lists.filter((list) =>
    `${list.title} ${list.items} ${list.event_title ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [lists, query]);

  return filtered.length ? (
    <>
      {filtered.map((list) => <FinanceBudgetCard key={list.id} list={list} />)}
    </>
  ) : (
    <div style={Object.assign({}, styles.panel, listStyles.emptyBudgetCard)}>
      <span style={listStyles.emptyTitle}>Plan expenses with a list</span>
      <span style={listStyles.secondary}>
        Add quantities and unit prices in a budget list, then finalize checked items to record the expense.
      </span>
    </div>
  );
}

function FinanceBudgetCard({ list }: { list: ListRecord }) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = listItems(list);

  return (
    <button
      type="button"
      onClick={() => navigate(`/space/records/list/${list.id}`, { state: { from: location.pathname } })}
      style={Object.assign({}, styles.panel, listStyles.budgetCard)}
    >
      <div style={listStyles.budgetHeading}>
        <div>
          <span style={listStyles.budgetTitle}>{list.title}</span>
          <span style={listStyles.secondary}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {list.finalized ? ' · Finalized' : ' · In progress'}
          </span>
        </div>
        <span style={listStyles.amount}>{money(listTotal(items))}</span>
      </div>
      <span style={listStyles.secondary}>
        {list.finalized
          ? `${money(listTotal(items, true))} recorded as expense`
          : `${money(listTotal(items, true))} checked · tap to review`}
      </span>
      {list.event_id !== null && list.event_title ? (
        <span style={listStyles.eventTag}>EVENT · {list.event_title}</span>
      ) : null}
    </button>
  );
}

export function EmptyListState({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={Object.assign({}, styles.panel, listStyles.emptyState)}>
      <span style={listStyles.emptyTitle}>{title}</span>
      <span style={listStyles.organizerBody}>{detail}</span>
    </div>
  );
}

export function ListDetails({
  initialList,
  formatAmount,
  onChanged,
  onListChanged,
  onLoanDraft,
}: {
  initialList: ListRecord;
  formatAmount: (amount: number) => string;
  onChanged: () => Promise<void>;
  onListChanged: (list: ListRecord) => void;
  onLoanDraft: (draft: RecordDraft) => void;
}) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const list = initialList;
  const items = listItems(list);
  const checkedItems = items.filter((item) => item.done);
  const checkedTotal = listTotal(items, true);

  const updateList = (next: ListRecord) => {
    onListChanged(next);
  };

  const toggleItem = async (itemIndex: number) => {
    const updatedItems = items.map((item, index) =>
      index === itemIndex ? { ...item, done: !item.done } : item,
    );
    try {
      await toggleListItem(database, list, itemIndex);
      updateList({ ...list, items: JSON.stringify(updatedItems) });
      await onChanged();
    } catch (error) {
      console.error('Unable to update list item', error);
      window.alert('Could not update list\n\nPlease try again.');
    }
  };

  const finalize = () => {
    if (!window.confirm(`Finalize this list?\n\nUGX ${formatAmount(checkedTotal)} will be recorded as an expense. The list will be locked until reopened.`)) return;
    void finalizeBudgetList(database, list.id)
      .then((result) => {
        updateList({ ...list, finalized: 1, final_transaction_id: result.transactionId });
        return onChanged();
      })
      .catch((error: unknown) => {
        if (error instanceof InsufficientFundsError) {
          if (window.confirm(`Not enough available funds\n\n${error.message}\n\nCreate a loan for the exact shortfall?`)) {
            onLoanDraft({
              title: '',
              category: 'Loan',
              amount: error.shortfall,
              fees: 0,
              dueDate: '',
              notes: `Shortfall financing for ${list.title}`,
            });
          }
          return;
        }
        window.alert(`Could not finalize list\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
      });
  };

  const reopen = () => {
    if (!window.confirm('Reopen this list?\n\nThe linked expense will be removed and you can edit the list again.')) return;
    void reopenBudgetList(database, list.id)
      .then(async () => {
        updateList({ ...list, finalized: 0, final_transaction_id: null });
        await onChanged();
      })
      .catch((error: unknown) => {
        console.error('Unable to reopen list', error);
        window.alert('Could not reopen list\n\nPlease try again.');
      });
  };

  return (
    <div style={listStyles.detailCard}>
      <span style={listStyles.detailMeta}>
        {checkedItems.length} of {items.length} complete
      </span>
      {list.event_id !== null ? (
        <button
          type="button"
          style={listStyles.detailEventTag}
          onClick={() => navigate(`/space/records/event/${list.event_id}`, {
            state: { from: location.pathname },
          })}
        >
          EVENT · {list.event_title || 'Attached event'}
        </button>
      ) : null}
      {list.finalized ? <span style={listStyles.finalizedBadge}>FINALIZED · LIST LOCKED</span> : null}
      {items.length ? items.map((item, index) => (
        <button
          key={`${list.id}-${index}`}
          type="button"
          disabled={Boolean(list.finalized)}
          onClick={() => void toggleItem(index)}
          style={listStyles.detailItem}
        >
          <div style={Object.assign({}, listStyles.checkbox, item.done && listStyles.checkboxDone)}>
            {item.done ? <span style={listStyles.checkmark}>✓</span> : null}
          </div>
          <span style={Object.assign({}, listStyles.detailItemText, item.done && listStyles.completedText)}>
            {list.budget_enabled && (item.quantity ?? 1) > 1
              ? `${item.quantity} × ${item.text}`
              : item.text}
          </span>
          {list.budget_enabled ? (
            <span style={listStyles.itemPrice}>
              UGX {formatAmount(Number(item.price) || 0)} ea
              {' · '}UGX {formatAmount(
                (Number(item.price) || 0) * (Number(item.quantity) || 1),
              )}
            </span>
          ) : null}
        </button>
      )) : <span style={listStyles.detailBody}>This list has no items yet.</span>}
      {list.budget_enabled ? (
        <div style={listStyles.totals}>
          <span style={listStyles.totalLabel}>Number of items</span>
          <span style={listStyles.totalValue}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          <span style={listStyles.totalLabel}>Full list total</span>
          <span style={listStyles.totalValue}>{money(listTotal(items))}</span>
          <span style={listStyles.totalLabel}>Checked items ({checkedItems.length})</span>
          <span style={listStyles.totalValue}>{money(checkedTotal)}</span>
        </div>
      ) : null}
      {list.budget_enabled && !list.finalized ? (
        <button type="button" onClick={finalize} style={styles.button}>
          <span style={styles.buttonText}>Finalize list</span>
        </button>
      ) : null}
      {list.finalized ? (
        <button type="button" onClick={reopen} style={listStyles.secondaryAction}>
          <span style={listStyles.secondaryActionText}>Reopen list · reverse expense</span>
        </button>
      ) : null}
    </div>
  );
}

export function EventBudgetToggle({
  event,
  expanded,
  onToggle,
}: {
  event: EventRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (event.budget_count <= 0) return null;
  return (
    <button type="button" aria-expanded={expanded} onClick={onToggle} style={listStyles.budgetedTag}>
      <span style={listStyles.budgetedTagText}>
        BUDGETED{event.budget_count > 1 ? ` · ${event.budget_count} BUDGETS` : ''}
      </span>
    </button>
  );
}

export function EventBudgetPanel({
  eventId,
  expanded,
  formatAmount,
}: {
  eventId: number;
  expanded: boolean;
  formatAmount: (amount: number) => string;
}) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [budgets, setBudgets] = useState<ListRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const formatCurrency = (amount: number) => `UGX ${formatAmount(amount)}`;

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    void loadLists(database, { budgetOnly: true, eventId })
      .then((rows) => { if (active) setBudgets(rows); })
      .catch((error: unknown) => {
        console.error('Unable to load budgets for event', error);
        if (active) {
          setLoadError(true);
          window.alert('Could not load budgets\n\nPlease try again.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [database, eventId, expanded]);

  if (!expanded) return null;
  return (
    <div style={listStyles.eventBudgets}>
      <span style={listStyles.eventBudgetsTitle}>ATTACHED BUDGETS</span>
      {loading ? (
        <span style={listStyles.eventBudgetMessage}>Loading budgets…</span>
      ) : loadError ? (
        <span style={listStyles.eventBudgetMessage}>Could not load budgets. Close and reopen this section to try again.</span>
      ) : budgets.length ? budgets.map((budget) => {
        const items = listItems(budget);
        return (
          <button
            key={budget.id}
            type="button"
            onClick={() => navigate(`/space/records/list/${budget.id}`, {
              state: { from: location.pathname },
            })}
            style={listStyles.eventBudgetCard}
          >
            <div style={listStyles.eventBudgetHeading}>
              <span style={listStyles.eventBudgetName}>{budget.title}</span>
              <span style={listStyles.eventBudgetTotal}>{formatCurrency(listTotal(items))}</span>
            </div>
            <span style={listStyles.eventBudgetMessage}>
              {budget.finalized
                ? 'Finalized'
                : `${items.filter((item) => item.done).length} of ${items.length} checked`}
              {' · '}{formatCurrency(listTotal(items, true))} checked
            </span>
            {items.length ? items.map((item, index) => (
              <div key={`${budget.id}-item-${index}`} style={listStyles.eventBudgetItem}>
                <span style={listStyles.eventBudgetItemText}>
                  {item.done ? '✓  ' : '○  '}
                  {(item.quantity ?? 1) > 1 ? `${item.quantity} × ` : ''}{item.text}
                </span>
                <span style={listStyles.eventBudgetItemPrice}>
                  {formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                </span>
              </div>
            )) : <span style={listStyles.eventBudgetMessage}>No items added.</span>}
          </button>
        );
      }) : (
        <span style={listStyles.eventBudgetMessage}>
          No budget lists are currently attached to this event.
        </span>
      )}
    </div>
  );
}

const listStyles = {
  organizerCard: {
    display: 'flex',
    flexDirection: 'column',
  },
  organizerListButton: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    textAlign: 'left',
  },
  organizerTitle: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  organizerBody: {
    color: colors.muted, fontSize: 10, lineHeight: '18px', marginTop: 7, whiteSpace: 'pre-wrap',
  },
  organizerHint: {
    color: colors.muted, fontSize: 6, marginTop: 'auto', paddingTop: 9, fontWeight: '700',
  },
  eventTag: {
    alignSelf: 'flex-start', color: colors.green, fontSize: 9, fontWeight: '800',
    letterSpacing: 0.4, backgroundColor: colors.greenSoft, paddingInline: 9, paddingBlock: 6,
    borderRadius: 6, marginTop: 10, overflow: 'hidden',
  },
  emptyState: { alignItems: 'center', paddingBlock: 22 },
  emptyBudgetCard: { backgroundColor: colors.yellowSoft, borderColor: colors.yellowSoft },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  secondary: { color: colors.muted, fontSize: 10, marginTop: 4, lineHeight: '17px' },
  budgetCard: { marginBottom: 10 },
  budgetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetTitle: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  amount: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  detailCard: {
    backgroundColor: colors.surface, borderRadius: 11, padding: 16, borderWidth: 1,
    borderColor: colors.line, marginTop: 12,
  },
  detailMeta: { color: colors.muted, fontSize: 10, marginBottom: 8 },
  detailEventTag: {
    alignSelf: 'flex-start', color: colors.green, fontSize: 9, fontWeight: '800',
    letterSpacing: 0.4, paddingBlock: 6, paddingInline: 9, borderRadius: 6,
    backgroundColor: colors.greenSoft, marginBottom: 10,
  },
  finalizedBadge: {
    alignSelf: 'flex-start', color: colors.ink, fontSize: 9, fontWeight: '800',
    letterSpacing: 0.8, paddingBlock: 6, paddingInline: 9, borderRadius: 5,
    backgroundColor: colors.line, marginBottom: 8,
  },
  detailItem: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: colors.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  checkmark: { color: colors.background, fontSize: 12, fontWeight: '800' },
  detailItemText: { flex: 1, color: colors.ink, fontSize: 12 },
  itemPrice: { color: colors.muted, fontSize: 9, fontWeight: '600', marginLeft: 'auto' },
  completedText: { color: colors.muted, textDecorationLine: 'line-through' },
  detailBody: { color: colors.muted, fontSize: 12, lineHeight: '20px' },
  totals: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 10, paddingTop: 12 },
  totalLabel: { color: colors.muted, fontSize: 9, marginBottom: 4 },
  totalValue: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 10 },
  finalizeButton: {
    minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    backgroundColor: colors.ink, marginTop: 8,
  },
  finalizeText: { color: colors.background, fontSize: 11, fontWeight: '800' },
  secondaryAction: {
    alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: colors.line,
    paddingBlock: 10, paddingInline: 14, marginTop: 16, border: `1px solid ${colors.line}`,
  },
  secondaryActionText: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  budgetedTag: {
    alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingBlock: 7,
    paddingInline: 10, borderRadius: 6, backgroundColor: colors.greenSoft, marginTop: 14,
  },
  budgetedTagText: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  eventBudgets: {
    backgroundColor: colors.surface, borderRadius: 11, padding: 14, borderWidth: 1,
    border: `1px solid ${colors.line}`, marginTop: 12,
  },
  eventBudgetsTitle: {
    color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10,
  },
  eventBudgetCard: {
    display: 'block', width: '100%', color: colors.ink, textAlign: 'left',
    backgroundColor: 'transparent', borderTop: `1px solid ${colors.line}`,
    paddingTop: 11, marginTop: 4,
  },
  eventBudgetHeading: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  eventBudgetName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '800' },
  eventBudgetTotal: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  eventBudgetMessage: { color: colors.muted, fontSize: 9, lineHeight: '16px', marginTop: 5 },
  eventBudgetItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 8 },
  eventBudgetItemText: { flex: 1, color: colors.ink, fontSize: 10 },
  eventBudgetItemPrice: { color: colors.muted, fontSize: 9, fontWeight: '600' },
} satisfies Record<string, CSSProperties>;