import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { UpcomingEventRow } from '../../components/UpcomingEventRow';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  InsufficientBalanceError,
  localDateKey,
  saveRecord,
  type RecordDraft,
  type EventRecord,
  type ListItem,
  type NoteRecord,
  type RecordKind,
  type TaskRecord,
  type Transaction,
} from '../../services/database';

const formatMoney = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function HomeScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [activeListPlan, setActiveListPlan] = useState(0);

  const refresh = useCallback(async () => {
    const month = localDateKey().slice(0, 7);
    const [transactionRows, taskRows, eventRows, noteRows, spent, budgetLists] = await Promise.all([
      database.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 4'),
      database.getAllAsync<TaskRecord>(
        'SELECT * FROM tasks WHERE completed = 0 AND date <= ? ORDER BY date LIMIT 3',
        localDateKey(),
      ),
      database.getAllAsync<EventRecord>(
        `SELECT events.*,
          (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
         FROM events
         WHERE date >= ?
         ORDER BY date
         LIMIT 3`,
        localDateKey(),
      ),
      database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 3'),
      database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'expense' AND substr(date, 1, 7) = ?",
        month,
      ),
      database.getAllAsync<{ items: string }>(
        'SELECT items FROM lists WHERE budget_enabled = 1 AND finalized = 0',
      ),
    ]);
    setTransactions(transactionRows);
    setTasks(taskRows);
    setEvents(eventRows);
    setNotes(noteRows);
    setMonthlySpent(spent?.total ?? 0);
    setActiveListPlan(budgetLists.reduce((total, row) => {
      const items: ListItem[] = JSON.parse(row.items);
      return total + items.reduce(
        (listTotal, item) => listTotal +
          (Number(item.price) || 0) * (Number(item.quantity) || 1),
        0,
      );
    }, 0));
  }, [database]);

  useEffect(() => {
    let active = true;
    void refresh().catch((error: unknown) => {
      console.error('Unable to load home dashboard', error);
      if (active) window.alert('Unable to load\n\nYour dashboard could not be opened.');
    });
    return () => { active = false; };
  }, [refresh]);

  const onSave = async (kind: RecordKind, draft: Parameters<typeof saveRecord>[2]) => {
    await saveRecord(database, kind, draft);
    await refresh();
  };
  const addBudgetList = () => {
    setEditingDraft({
      title: '',
      category: 'Personal',
      budgetEnabled: true,
      listItems: [],
    });
    setComposer('list');
  };
  const confirmDelete = (id: number, title: string) => {
    if (!window.confirm(`Delete record?\n\nRemove “${title}” from your records?`)) return;
    void deleteRecord(database, 'transactions', id).then(refresh).catch((error: unknown) => {
      console.error('Unable to delete transaction', error);
      window.alert(`${error instanceof InsufficientBalanceError ? 'Not enough available funds' : 'Could not delete'}\n\n${error instanceof InsufficientBalanceError ? error.message : 'Please try again.'}`);
    });
  };
  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader
          title={`${greeting()}!`}
          subtitle={new Date().toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
          profile
        />
        <span style={localStyles.eyebrow}>YOUR DAY, AT A GLANCE</span>
        <div style={localStyles.quickGrid}>
          {([
            ['budget-list', '☷', 'Budget list'],
            ['note', '✎', 'New note'],
            ['task', '✓', 'Task'],
            ['event', '▦', 'Event'],
          ] as const).map(([kind, icon, label]) => (
            <button
              key={kind}
              onClick={() => {
                if (kind === 'budget-list') {
                  addBudgetList();
                } else {
                  setComposer(kind);
                }
              }}
              type="button" style={localStyles.quickAction}
            >
              <span style={localStyles.quickIcon}>{icon}</span>
              <span style={localStyles.quickLabel}>{label}</span>
            </button>
          ))}
        </div>

        <SectionTitle title="YOUR FINANCES" action="Open finances →" onAction={() => navigate('/space/finances')} />
        <div style={Object.assign({}, styles.panel, localStyles.financeCard)}>
          <div style={localStyles.financeHeader}>
            <div>
              <span style={localStyles.cardKicker}>MONTHLY SPENDING</span>
              <span style={localStyles.spent}>{formatMoney(monthlySpent)}</span>
              <span style={localStyles.budgetLine}>
                Active budget lists: {formatMoney(activeListPlan)}
              </span>
            </div>
            <span style={localStyles.financeMark}>↗</span>
          </div>
        </div>

        <SectionTitle title="TODAY'S TASKS" action="See all" onAction={() => navigate('/space/organize')} />
        <div style={styles.panel}>
          {tasks.length ? tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => navigate(`/space/records/task/${task.id}`, { state: { from: location.pathname } })}
            >
              <span style={localStyles.listLine}>○  {task.title}</span>
            </button>
          )) : <span style={localStyles.muted}>Nothing due. Add a task when you need one.</span>}
        </div>
        <SectionTitle title="UPCOMING EVENTS" action="See all" onAction={() => navigate('/space/calendar')} />
        <div style={styles.panel}>
          {events.length ? events.map((event) => (
            <UpcomingEventRow
              key={event.id}
              event={event}
              onClick={() => navigate(`/space/records/event/${event.id}`, { state: { from: location.pathname } })}
            />
          )) : <span style={localStyles.muted}>Your upcoming events will appear here.</span>}
        </div>
        <SectionTitle title="RECENT NOTES" action="Open organize →" onAction={() => navigate('/space/organize')} />
        <div style={styles.panel}>
          {notes.length ? notes.map((note) => (
            <button
              key={note.id}
              onClick={() => navigate(`/space/records/note/${note.id}`, { state: { from: location.pathname } })}
              onContextMenu={(pointerEvent) => {
                pointerEvent.preventDefault();
                confirmDelete(note.id, note.title);
              }}
            >
              <div style={localStyles.previewRow}>
                <span style={localStyles.noteIcon}>✎</span>
                <div style={localStyles.previewText}>
                  <span style={localStyles.recordTitle}>{note.title}</span>
                  <span style={localStyles.muted}>{note.notes || 'No note text yet'}</span>
                </div>
              </div>
            </button>
          )) : <span style={localStyles.muted}>Your recently updated notes will appear here.</span>}
        </div>
        <SectionTitle title="RECENT TRANSACTIONS" />
        <div style={styles.panel}>
          {transactions.length ? transactions.map((transaction) => (
            <button
              key={transaction.id}
              onContextMenu={transaction.kind === 'income' && transaction.loan_id === null
                ? (pointerEvent) => {
                  pointerEvent.preventDefault();
                  confirmDelete(transaction.id, transaction.title);
                }
                : undefined}
              style={localStyles.transactionRow}
            >
              <div style={localStyles.transactionIcon}>
                <span>
                  {transaction.kind === 'expense'
                    ? '↙'
                    : transaction.loan_id !== null ? '↔' : '↗'}
                </span>
              </div>
              <div style={localStyles.previewText}>
                <span style={localStyles.recordTitle}>{transaction.title}</span>
                <span style={localStyles.muted}>
                  {transaction.loan_id !== null ? 'Loan proceeds' : transaction.category}
                </span>
              </div>
              <span style={Object.assign({},
                localStyles.recordTitle,
                transaction.kind === 'income' && transaction.loan_id === null && localStyles.income,
              )}>
                {transaction.kind === 'expense' ? '−' : '+'}{formatMoney(transaction.amount)}
              </span>
            </button>
          )) : <span style={localStyles.muted}>Finalize a budget list to record an expense, or add income.</span>}
        </div>
      </div>
      <RecordComposer
        key={`${composer ?? 'closed'}-${editingDraft?.id ?? 'new'}`}
        kind={composer}
        initialDraft={editingDraft ?? undefined}
        onClose={() => {
          setComposer(null);
          setEditingDraft(null);
        }}
        onSave={onSave}
      />
    </div>
  );
}

const localStyles = {
  eyebrow: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    width: '48%',
    minHeight: 50,
    borderRadius: 11,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingInline: 8,
    gap: 10,
  },
  quickIcon: {
    fontSize: 16,
    color: colors.green,
    fontWeight: '800',
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  financeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    padding: 20,
  },
  financeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardKicker: {
    color: '#B8B8B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  spent: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  budgetLine: {
    color: '#B8B8B8',
    fontSize: 10,
    marginTop: 3,
  },
  financeMark: {
    color: colors.yellow,
    fontSize: 23,
    fontWeight: '700',
  },
  listLine: {
    color: colors.ink,
    fontSize: 12,
    paddingBlock: 8,
  },
  muted: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: '19px',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBlock: 8,
    gap: 12,
  },
  previewText: {
    flex: 1,
  },
  eventIcon: {
    color: colors.orange,
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  noteIcon: {
    color: colors.green,
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  recordTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingBlock: 8,
  },
  transactionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  income: {
    color: colors.green,
  },
} as const
