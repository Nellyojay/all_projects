import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import type { CSSProperties } from 'react';
import type { EventRecord, ListItem, ListRecord } from '../../services/database';
import { colors } from '../theme';

type Props = {
  event: EventRecord;
  formatAmount: (amount: number) => string;
  sharedStyles: {
    infoCard: CSSProperties;
    infoLabel: CSSProperties;
    infoValue: CSSProperties;
    body: CSSProperties;
  };
};

const eventStyles = {
  budgetedTag: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
    paddingBlock: 7,
    paddingInline: 10,
    borderRadius: 6,
    backgroundColor: colors.greenSoft,
    marginTop: 14,
  },
  budgetedTagText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  eventBudgets: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    padding: 14,
    borderWidth: 1,
    border: `1px solid ${colors.line}`,
    marginTop: 12,
  },
  eventBudgetsTitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  eventBudgetCard: {
    display: 'block',
    width: '100%',
    color: colors.ink,
    textAlign: 'left',
    backgroundColor: 'transparent',
    borderTop: `1px solid ${colors.line}`,
    paddingTop: 11,
    marginTop: 4,
  },
  eventBudgetHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventBudgetName: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  eventBudgetTotal: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '800',
  },
  eventBudgetMessage: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: '16px',
    marginTop: 5,
  },
  eventBudgetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 8,
  },
  eventBudgetItemText: {
    flex: 1,
    color: colors.ink,
    fontSize: 10,
  },
  eventBudgetItemPrice: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
  },
} satisfies Record<string, CSSProperties>;

function isBirthdayEvent(event: EventRecord) {
  return event.category.toLowerCase() === 'birthday';
}

export function EventDetails({ event, formatAmount, sharedStyles }: Props) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [eventBudgets, setEventBudgets] = useState<ListRecord[]>([]);
  const [openEventBudgetId, setOpenEventBudgetId] = useState<number | null>(null);
  const [loadingEventBudgets, setLoadingEventBudgets] = useState(false);
  const isBirthday = isBirthdayEvent(event);

  const toggleEventBudgets = async () => {
    if (openEventBudgetId === event.id) {
      setOpenEventBudgetId(null);
      return;
    }
    setOpenEventBudgetId(event.id);
    setLoadingEventBudgets(true);
    try {
      const budgets = await database.getAllAsync<ListRecord>(
        `SELECT lists.*, events.title AS event_title
         FROM lists
         LEFT JOIN events ON events.id = lists.event_id
         WHERE lists.event_id = ? AND lists.budget_enabled = 1
         ORDER BY lists.id DESC`,
        event.id,
      );
      setEventBudgets(budgets);
    } catch (error) {
      console.error('Unable to load budgets for event', error);
      setOpenEventBudgetId(null);
      window.alert('Could not load budgets\n\nPlease try again.');
    } finally {
      setLoadingEventBudgets(false);
    }
  };

  return (
    <>
      <div style={sharedStyles.infoCard}>
        <span style={sharedStyles.infoLabel}>{isBirthday ? 'BIRTHDAY DATE' : 'DATE'}</span>
        <span style={sharedStyles.infoValue}>
          {new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <span style={sharedStyles.infoLabel}>{isBirthday ? 'PERSON' : 'EVENT TYPE'}</span>
        <span style={sharedStyles.infoValue}>
          {isBirthday ? event.title : event.category}
        </span>
        {event.budget_count > 0 ? (
          <button
            type="button"
            aria-expanded={openEventBudgetId === event.id}
            onClick={() => void toggleEventBudgets()}
            style={eventStyles.budgetedTag}
          >
            <span style={eventStyles.budgetedTagText}>
              BUDGETED{event.budget_count > 1 ? ` · ${event.budget_count} BUDGETS` : ''}
            </span>
          </button>
        ) : null}
      </div>
      {openEventBudgetId === event.id ? (
        <div style={eventStyles.eventBudgets}>
          <span style={eventStyles.eventBudgetsTitle}>ATTACHED BUDGETS</span>
          {loadingEventBudgets ? (
            <span style={eventStyles.eventBudgetMessage}>Loading budgets…</span>
          ) : eventBudgets.length ? eventBudgets.map((budget) => {
            const items: ListItem[] = JSON.parse(budget.items);
            const total = items.reduce(
              (sum, item) => sum +
                (Number(item.price) || 0) * (Number(item.quantity) || 1),
              0,
            );
            const checkedTotal = items.reduce(
              (sum, item) => sum + (item.done
                ? (Number(item.price) || 0) * (Number(item.quantity) || 1)
                : 0),
              0,
            );
            return (
              <button
                key={budget.id}
                type="button"
                onClick={() => navigate(`/space/records/list/${budget.id}`, {
                  state: { from: location.pathname },
                })}
                style={eventStyles.eventBudgetCard}
              >
                <div style={eventStyles.eventBudgetHeading}>
                  <span style={eventStyles.eventBudgetName}>{budget.title}</span>
                  <span style={eventStyles.eventBudgetTotal}>
                    UGX {formatAmount(total)}
                  </span>
                </div>
                <span style={eventStyles.eventBudgetMessage}>
                  {budget.finalized
                    ? 'Finalized'
                    : `${items.filter((item) => item.done).length} of ${items.length} checked`}
                  {' · '}UGX {formatAmount(checkedTotal)} checked
                </span>
                {items.length ? items.map((item, index) => (
                  <div
                    key={`${budget.id}-item-${index}`}
                    style={eventStyles.eventBudgetItem}
                  >
                    <span style={eventStyles.eventBudgetItemText}>
                      {item.done ? '✓  ' : '○  '}
                      {item.quantity > 1 ? `${item.quantity} × ` : ''}
                      {item.text}
                    </span>
                    <span style={eventStyles.eventBudgetItemPrice}>
                      UGX {formatAmount(
                        (Number(item.price) || 0) * (Number(item.quantity) || 1),
                      )}
                    </span>
                  </div>
                )) : (
                  <span style={eventStyles.eventBudgetMessage}>No items added.</span>
                )}
              </button>
            );
          }) : (
            <span style={eventStyles.eventBudgetMessage}>
              No budget lists are currently attached to this event.
            </span>
          )}
        </div>
      ) : null}
      <span style={sharedStyles.body}>
        {event.notes || (isBirthday
          ? 'No birthday notes or gift ideas yet.'
          : 'No event notes yet.')}
      </span>
    </>
  );
}

export function EventHeading({ event }: Pick<Props, 'event'>) {
  return <>{isBirthdayEvent(event) ? 'Birthday' : 'Event'}</>;
}
