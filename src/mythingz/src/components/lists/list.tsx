import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import type { BrowserDatabase } from '../../web/database';
import {
  deleteRecord,
  finalizeBudgetList,
  getAccounts,
  InsufficientBalanceError,
  InsufficientFundsError,
  reopenBudgetList,
  toggleListItem,
} from '../../services/database';
import type { Account, EventRecord, ListItem, ListRecord, RecordDraft } from '../../services/database';
import '../shared/theme.css';
import { AccountPicker } from '../finance/accounts/account';
import { ItemizedItemsEditor } from './itemizedItems';
import type { ItemizedItem } from './itemizedItemsModel';
import './list.css';

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

export function ListComposer({
  budgetEnabled,
  onBudgetEnabledChange,
  eventId,
  onEventIdChange,
  notes,
  onNotesChange,
  listItems,
  onListItemsChange,
}: {
  budgetEnabled: boolean;
  onBudgetEnabledChange: (enabled: boolean) => void;
  eventId: number | null;
  onEventIdChange: (eventId: number | null) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  listItems: ItemizedItem[];
  onListItemsChange: Dispatch<SetStateAction<ItemizedItem[]>>;
}) {
  const database = useDatabase();
  const [eventPickerVisible, setEventPickerVisible] = useState(false);
  const [savedEvents, setSavedEvents] = useState<EventRecord[]>([]);

  const openEventPicker = async () => {
    try {
      const events = await database.getAllAsync<EventRecord>(
        `SELECT events.*,
          (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
         FROM events
         ORDER BY date, id`,
      );
      setSavedEvents(events);
      setEventPickerVisible((visible) => !visible);
    } catch (error) {
      console.error('Unable to load saved events for budget', error);
      window.alert('Could not load events\n\nPlease try again.');
    }
  };

  return (
    <>
      <div className="list-composer-budget-option">
        <div className="list-composer-budget-copy">
          <span className="list-composer-budget-title">Add to budget</span>
          <span className="list-composer-budget-description">Track item prices and total the list</span>
        </div>
        <input
          type="checkbox"
          checked={budgetEnabled}
          onChange={(event) => onBudgetEnabledChange(event.currentTarget.checked)}
        />
      </div>
      {budgetEnabled ? (
        <div className="list-composer-event-budget-section">
          <label className="list-composer-label" htmlFor="budget-list-notes">NOTES · OPTIONAL</label>
          <textarea
            id="budget-list-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.currentTarget.value)}
            placeholder="Add a note about this budget list"
            rows={3}
            className="list-composer-notes"
          />
          <span className="list-composer-label">EVENT</span>
          <button
            type="button" aria-expanded={eventPickerVisible}
            onClick={() => void openEventPicker()}
            className="list-composer-attach-event"
          >
            <span className="list-composer-attach-event-text">
              {eventId === null ? '＋  Attach a saved event' : 'Change attached event'}
            </span>
          </button>
          {eventId !== null ? (
            <span className="list-composer-attached-event">
              {savedEvents.find((event) => event.id === eventId)?.title ?? 'Saved event attached'}
            </span>
          ) : null}
          {eventPickerVisible ? (
            <div className="list-composer-event-options">
              <button
                type="button" aria-selected={eventId === null}
                onClick={() => {
                  onEventIdChange(null);
                  setEventPickerVisible(false);
                }}
                className={`list-composer-event-option${eventId === null ? ' list-composer-event-option--selected' : ''}`}
              >
                <span className="list-composer-event-option-title">No event</span>
              </button>
              {savedEvents.map((event) => (
                <button
                  key={event.id}
                  type="button" aria-selected={eventId === event.id}
                  onClick={() => {
                    onEventIdChange(event.id);
                    setEventPickerVisible(false);
                  }}
                  className={`list-composer-event-option${eventId === event.id ? ' list-composer-event-option--selected' : ''}`}
                >
                  <span className="list-composer-event-option-title">{event.title}</span>
                  <span className="list-composer-event-option-date">{event.date}</span>
                </button>
              ))}
              {savedEvents.length === 0 ? (
                <span className="list-composer-no-events">
                  Create a calendar event first to attach it to this budget.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <ItemizedItemsEditor
        items={listItems}
        onItemsChange={onListItemsChange}
        showPricing={budgetEnabled}
        showTotal={budgetEnabled}
        totalLabel="List total"
      />
    </>
  );
}

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
    <div className="app-panel list-organizer-card">
      <button
        type="button"
        className="list-organizer-button"
        onClick={() => navigate(`/space/records/list/${list.id}`, { state: { from: location.pathname } })}
        onContextMenu={remove}
      >
        <span className="list-organizer-title">{list.title}</span>
        <span className="list-organizer-body">
          {items.length
            ? `${items.filter((item) => item.done).length} of ${items.length} items complete`
            : 'No items yet'}
        </span>
        {list.budget_enabled ? (
          <span className="list-organizer-body">
            {list.finalized ? 'Finalized · ' : 'Budget · '}{money(listTotal(items))}
          </span>
        ) : list.finalized ? (
          <span className="list-organizer-body">Finalized · list locked</span>
        ) : null}
        {list.event_id !== null && list.event_title ? (
          <span className="list-event-tag">EVENT · {list.event_title}</span>
        ) : null}
        <span className="list-organizer-hint">
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
    <div className="app-panel list-empty-budget-card">
      <span className="list-empty-title">Plan expenses with a list</span>
      <span className="list-secondary">
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
      className="app-panel list-budget-card"
    >
      <div className="list-budget-heading">
        <div>
          <span className="list-budget-title">{list.title}</span>
          <span className="list-secondary">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {list.finalized ? ' · Finalized' : ' · In progress'}
          </span>
        </div>
        <span className="list-amount">{money(listTotal(items))}</span>
      </div>
      <span className="list-secondary">
        {list.finalized
          ? `${money(listTotal(items, true))} recorded as expense`
          : `${money(listTotal(items, true))} checked · tap to review`}
      </span>
      {list.event_id !== null && list.event_title ? (
        <span className="list-event-tag">EVENT · {list.event_title}</span>
      ) : null}
    </button>
  );
}

export function EmptyListState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="app-panel list-empty-state">
      <span className="list-empty-title">{title}</span>
      <span className="list-organizer-body">{detail}</span>
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const list = initialList;
  const items = listItems(list);
  const checkedItems = items.filter((item) => item.done);
  const checkedTotal = listTotal(items, true);

  useEffect(() => {
    let active = true;
    void getAccounts(database).then((rows) => {
      if (!active) return;
      setAccounts(rows);
      setAccountId((current) => current ?? rows[0]?.id ?? null);
    }).catch((error: unknown) => {
      console.error('Unable to load accounts for budget list', error);
      window.alert('Could not load accounts\n\nPlease try again.');
    });
    return () => { active = false; };
  }, [database]);

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
    if (!accountId) {
      window.alert('Choose an account\n\nSelect the account this expense will be paid from.');
      return;
    }
    void finalizeBudgetList(database, list.id, accountId)
      .then((result) => {
        updateList({ ...list, finalized: 1, final_transaction_id: result.transactionId });
        return onChanged();
      })
      .catch((error: unknown) => {
        if (error instanceof InsufficientFundsError || error instanceof InsufficientBalanceError) {
          if (window.confirm(`Not enough available funds\n\n${error.message}\n\nCreate a loan for the exact shortfall?`)) {
            onLoanDraft({
              title: '',
              category: 'Loan',
              amount: error.shortfall,
              fees: 0,
              dueDate: '',
              accountId,
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
    <div className="list-detail-card">
      <span className="list-detail-meta">
        {checkedItems.length} of {items.length} complete
      </span>
      {list.event_id !== null ? (
        <button
          type="button"
          className="list-detail-event-tag"
          onClick={() => navigate(`/space/records/event/${list.event_id}`, {
            state: { from: location.pathname },
          })}
        >
          EVENT · {list.event_title || 'Attached event'}
        </button>
      ) : null}
      {list.finalized ? <span className="list-finalized-badge">FINALIZED · LIST LOCKED</span> : null}
      {items.length ? items.map((item, index) => (
        <button
          key={`${list.id}-${index}`}
          type="button"
          disabled={Boolean(list.finalized)}
          onClick={() => void toggleItem(index)}
          className="list-detail-item"
        >
          <div className={`list-checkbox${item.done ? ' list-checkbox--done' : ''}`}>
            {item.done ? <span className="list-checkmark">✓</span> : null}
          </div>
          <span className={`list-detail-item-text${item.done ? ' list-detail-item-text--completed' : ''}`}>
            {list.budget_enabled && (item.quantity ?? 1) > 1
              ? `${item.quantity} × ${item.text}`
              : item.text}
          </span>
          {list.budget_enabled ? (
            <span className="list-item-price">
              UGX {formatAmount(Number(item.price) || 0)} ea
              {' · '}UGX {formatAmount(
                (Number(item.price) || 0) * (Number(item.quantity) || 1),
              )}
            </span>
          ) : null}
        </button>
      )) : <span className="list-detail-body">This list has no items yet.</span>}
      {list.notes?.trim() ? (
        <div className="list-detail-body">
          <strong>Notes</strong>
          <div style={{ whiteSpace: 'pre-wrap' }}>{list.notes}</div>
        </div>
      ) : null}
      {list.budget_enabled ? (
        <div className="list-totals">
          <span className="list-total-label">Number of items</span>
          <span className="list-total-value">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          <span className="list-total-label">Full list total</span>
          <span className="list-total-value">{money(listTotal(items))}</span>
          <span className="list-total-label">Checked items ({checkedItems.length})</span>
          <span className="list-total-value">{money(checkedTotal)}</span>
        </div>
      ) : null}
      <div className='mb-2'>
        {list.budget_enabled && !list.finalized ? (
          <AccountPicker
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="PAID FROM · ACCOUNT"
          />
        ) : null}
      </div>

      {list.budget_enabled && !list.finalized ? (
        <button
          type="button"
          onClick={finalize}
          className="app-button app-button--text-only"
        >
          <span className="app-button-text">Finalize list</span>
        </button>
      ) : null}
      {list.finalized ? (
        <button type="button" onClick={reopen} className="list-secondary-action">
          <span className="list-secondary-action-text">Reopen list · reverse expense</span>
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
    <button type="button" aria-expanded={expanded} onClick={onToggle} className="list-budgeted-tag">
      <span className="list-budgeted-tag-text">
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
    <div className="list-event-budgets">
      <span className="list-event-budgets-title">ATTACHED BUDGETS</span>
      {loading ? (
        <span className="list-event-budget-message">Loading budgets…</span>
      ) : loadError ? (
        <span className="list-event-budget-message">Could not load budgets. Close and reopen this section to try again.</span>
      ) : budgets.length ? budgets.map((budget) => {
        const items = listItems(budget);
        return (
          <button
            key={budget.id}
            type="button"
            onClick={() => navigate(`/space/records/list/${budget.id}`, {
              state: { from: location.pathname },
            })}
            className="list-event-budget-card"
          >
            <div className="list-event-budget-heading">
              <span className="list-event-budget-name">{budget.title}</span>
              <span className="list-event-budget-total">{formatCurrency(listTotal(items))}</span>
            </div>
            <span className="list-event-budget-message">
              {budget.finalized
                ? 'Finalized'
                : `${items.filter((item) => item.done).length} of ${items.length} checked`}
              {' · '}{formatCurrency(listTotal(items, true))} checked
            </span>
            {items.length ? items.map((item, index) => (
              <div key={`${budget.id}-item-${index}`} className="list-event-budget-item">
                <span className="list-event-budget-item-text">
                  {item.done ? '✓  ' : '○  '}
                  {(item.quantity ?? 1) > 1 ? `${item.quantity} × ` : ''}{item.text}
                </span>
                <span className="list-event-budget-item-price">
                  {formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                </span>
              </div>
            )) : <span className="list-event-budget-message">No items added.</span>}
          </button>
        );
      }) : (
        <span className="list-event-budget-message">
          No budget lists are currently attached to this event.
        </span>
      )}
    </div>
  );
}
