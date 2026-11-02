import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { ExpenseComposer } from '../../components/ExpenseComposer';
import { RecordComposer } from '../../components/RecordComposer';
import { TransactionReceipt } from '../../components/TransactionReceipt';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  getAccounts,
  getRecentActivity,
  getReminders,
  localDateKey,
  saveExpense,
  saveRecord,
  type ExpenseDraft,
  type Account,
  type ActivityRecord,
  type RecordDraft,
  type EventRecord,
  type ListItem,
  type NoteRecord,
  type RecordKind,
  type ReminderRecord,
  type TaskRecord,
  type Transaction,
  type Transfer,
} from '../../services/database';
import { NoteCard } from '../../components/ui/note';

const formatMoney = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

type BudgetOverview = {
  id: number;
  title: string;
  planned: number;
  actual: number;
};

type ScheduleItem = {
  kind: 'event' | 'task' | 'reminder' | 'loan';
  id: number;
  title: string;
  date: string;
};

const formatScheduleDate = (date: string) => {
  const parsed = new Date(date.includes('T') ? date : `${date}T00:00:00`);
  return date.includes('T') ? parsed.toLocaleString() : parsed.toLocaleDateString();
};

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
  const [expenseComposerOpen, setExpenseComposerOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<(Transaction | Transfer) | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [activeListPlan, setActiveListPlan] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [accountBalance, setAccountBalance] = useState(0);
  const [budgetOverview, setBudgetOverview] = useState<BudgetOverview[]>([]);
  const [eventPreparation, setEventPreparation] = useState<{ id: number; title: string; tasks: number }[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loans, setLoans] = useState<{
    id: number;
    lender: string;
    due_date: string;
    principal: number;
    fees: number;
    repaid: number;
  }[]>([]);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [remainingTasks, setRemainingTasks] = useState(0);

  const refresh = useCallback(async () => {
    const month = localDateKey().slice(0, 7);
    const today = localDateKey();
    const [transactionRows, taskRows, eventRows, noteRows, spent, budgetLists,
      accounts, income, reminderRows, activityRows, loanRows, taskCounts, preparationRows] = await Promise.all([
        database.getAllAsync<Transaction>(
          `SELECT transactions.*, accounts.name AS account_name
         FROM transactions LEFT JOIN accounts ON accounts.id = transactions.account_id
         ORDER BY transactions.date DESC, transactions.id DESC LIMIT 4`,
        ),
        database.getAllAsync<TaskRecord>(
          "SELECT * FROM tasks WHERE completed = 0 AND date <= date(?, '+7 days') ORDER BY date LIMIT 30",
          today,
        ),
        database.getAllAsync<EventRecord>(
          `SELECT events.*,
          (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
         FROM events
         WHERE date >= ?
         ORDER BY date
         LIMIT 8`,
          today,
        ),
        database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 3'),
        database.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'expense' AND substr(date, 1, 7) = ?",
          month,
        ),
        database.getAllAsync<{
          id: number;
          title: string;
          items: string;
          actual: number;
        }>(
          `SELECT lists.id, lists.title, lists.items,
          COALESCE((
            SELECT SUM(transactions.amount)
            FROM record_links
            JOIN transactions ON transactions.id = CASE
              WHEN record_links.source_type = 'transaction' THEN record_links.source_id
              ELSE record_links.target_id
            END
            WHERE ((record_links.source_type = 'budget' AND record_links.source_id = lists.id
                    AND record_links.target_type = 'transaction')
                OR (record_links.target_type = 'budget' AND record_links.target_id = lists.id
                    AND record_links.source_type = 'transaction'))
              AND transactions.kind = 'expense'
          ), 0) AS actual
         FROM lists WHERE budget_enabled = 1 AND finalized = 0 ORDER BY title COLLATE NOCASE`,
        ),
        getAccounts(database),
        database.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE kind = 'income' AND loan_id IS NULL AND refund_of_transaction_id IS NULL
           AND substr(date, 1, 7) = ?`,
          month,
        ),
        getReminders(database, 'pending'),
        getRecentActivity(database, 8),
        database.getAllAsync<{
          id: number;
          lender: string;
          due_date: string;
          principal: number;
          fees: number;
          repaid: number;
        }>(
          `SELECT loans.id, loans.lender, loans.due_date, loans.principal, loans.fees,
           COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0) AS repaid
         FROM loans LEFT JOIN transactions ON transactions.loan_id = loans.id
         GROUP BY loans.id
         HAVING loans.principal + loans.fees >
           COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0)
         ORDER BY loans.due_date LIMIT 6`,
        ),
        database.getFirstAsync<{ completed: number; remaining: number }>(
          `SELECT
           (SELECT COUNT(*) FROM tasks WHERE completed = 1 AND date(completed_at) >= date(?, '-6 days')) AS completed,
           (SELECT COUNT(*) FROM tasks WHERE completed = 0) AS remaining`,
          today,
        ),
        database.getAllAsync<{ id: number; title: string; tasks: number }>(
          `SELECT events.id, events.title, COUNT(tasks.id) AS tasks
         FROM events
         JOIN record_links ON
           ((record_links.source_type = 'event' AND record_links.source_id = events.id
              AND record_links.target_type = 'task')
            OR (record_links.target_type = 'event' AND record_links.target_id = events.id
              AND record_links.source_type = 'task'))
         JOIN tasks ON tasks.id = CASE
           WHEN record_links.source_type = 'task' THEN record_links.source_id
           ELSE record_links.target_id
         END
         WHERE events.date >= ? AND tasks.completed = 0
         GROUP BY events.id, events.title ORDER BY events.date LIMIT 6`,
          today,
        ),
      ]);
    setTransactions(transactionRows);
    setTasks(taskRows);
    setEvents(eventRows);
    setNotes(noteRows);
    setMonthlySpent(spent?.total ?? 0);
    setMonthlyIncome(income?.total ?? 0);
    setAccountBalance(accounts.reduce((total, account: Account) => total + account.balance, 0));
    setReminders(reminderRows);
    setActivities(activityRows);
    setLoans(loanRows);
    setEventPreparation(preparationRows);
    setCompletedThisWeek(taskCounts?.completed ?? 0);
    setRemainingTasks(taskCounts?.remaining ?? 0);
    const budgets = budgetLists.map((row) => {
      const items: ListItem[] = JSON.parse(row.items);
      return {
        id: row.id,
        title: row.title,
        planned: items.reduce(
          (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 1),
          0,
        ),
        actual: row.actual,
      };
    });
    setBudgetOverview(budgets);
    setActiveListPlan(budgets.reduce((total, budget) => total + budget.planned, 0));
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
  const onSaveExpense = async (draft: ExpenseDraft) => {
    await saveExpense(database, draft);
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
  const removeNote = (_table: 'notes', id: number, title: string) => {
    if (!window.confirm(`Delete note?\n\nRemove “${title}” from your records?`)) return;
    void deleteRecord(database, 'notes', id).then(refresh).catch((error: unknown) => {
      console.error('Unable to delete note', error);
      window.alert('Could not delete note\n\nPlease try again.');
    });
  };
  const today = localDateKey();
  const dueTodayTasks = tasks.filter((task) => task.date === today);
  const overdueTasks = tasks.filter((task) => task.date < today);
  const todayEvents = events.filter((event) => event.date === today);
  const remindersDue = reminders.filter((reminder) => Date.parse(reminder.due_at) <= Date.now());
  const pendingReminders = reminders.filter((reminder) => Date.parse(reminder.due_at) > Date.now());
  const upcomingSchedule: ScheduleItem[] = [
    ...events.filter((event) => event.date >= today).map((event) => ({
      kind: 'event' as const, id: event.id, title: event.title, date: event.date,
    })),
    ...tasks.filter((task) => task.date > today).map((task) => ({
      kind: 'task' as const, id: task.id, title: task.title, date: task.date,
    })),
    ...pendingReminders.map((reminder) => ({
      kind: 'reminder' as const, id: reminder.id, title: reminder.title, date: reminder.due_at,
    })),
    ...loans.filter((loan) => loan.due_date >= today).map((loan) => ({
      kind: 'loan' as const,
      id: loan.id,
      title: `${loan.lender} repayment · ${formatMoney(loan.principal + loan.fees - loan.repaid)}`,
      date: loan.due_date,
    })),
  ].sort((first, second) => first.date.localeCompare(second.date)).slice(0, 7);
  const budgetAttention = budgetOverview.filter((budget) =>
    budget.planned > 0 && budget.actual / budget.planned >= 0.8,
  );
  const openScheduleItem = (item: ScheduleItem) => {
    if (item.kind === 'reminder') {
      navigate('/space/organize', { state: { section: 'Reminders', focusReminderId: item.id } });
    } else if (item.kind === 'loan') {
      navigate('/space/finances', { state: { section: 'loans' } });
    } else {
      navigate(`/space/records/${item.kind}/${item.id}`, { state: { from: location.pathname } });
    }
  };
  const openActivity = (activity: ActivityRecord) => {
    if (activity.record_id === null) return;
    if (activity.module === 'events' || activity.module === 'tasks' || activity.module === 'notes') {
      navigate(`/space/records/${activity.module.slice(0, -1)}/${activity.record_id}`, {
        state: { from: location.pathname },
      });
    } else if (activity.module === 'lists') {
      navigate(`/space/records/list/${activity.record_id}`, { state: { from: location.pathname } });
    } else if (activity.module === 'reminders') {
      navigate('/space/organize', { state: { section: 'Reminders', focusReminderId: activity.record_id } });
    } else if (activity.module === 'inbox') {
      navigate('/space/organize', { state: { section: 'Inbox' } });
    } else if (activity.module === 'finances') {
      const kind = activity.description.includes('Transfer') ? 'transfer' : 'transaction';
      navigate('/space/finances', {
        state: { section: kind === 'transfer' ? 'transfers' : 'transactions', focusRecord: { kind, id: activity.record_id } },
      });
    }
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
            ['expense', '−', 'Add expense'],
            ['inbox', '↳', 'Quick capture'],
          ] as const).map(([kind, icon, label]) => (
            <button
              key={kind}
              onClick={() => {
                if (kind === 'budget-list') {
                  addBudgetList();
                } else if (kind === 'inbox') {
                  navigate('/space/organize', { state: { section: 'Inbox' } });
                } else if (kind === 'expense') {
                  setExpenseComposerOpen(true);
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

        <SectionTitle title="FINANCIAL OVERVIEW" action="Open finances →" onAction={() => navigate('/space/finances')} />
        <div style={Object.assign({}, styles.panel, localStyles.financeCard)}>
          <div style={localStyles.metricGrid}>
            {[
              ['TOTAL ACCOUNT BALANCE', accountBalance],
              ['MONTHLY INCOME', monthlyIncome],
              ['MONTHLY EXPENSES', monthlySpent],
              ['ACTIVE BUDGETS', activeListPlan],
            ].map(([label, amount]) => (
              <div key={label} style={localStyles.metric}>
                <span style={localStyles.cardKicker}>{label}</span>
                <span style={localStyles.metricValue}>{formatMoney(Number(amount))}</span>
              </div>
            ))}
          </div>
          {budgetOverview.length > 0 && (
            <div style={localStyles.budgetList}>
              <span style={localStyles.cardKicker}>BUDGET REMAINING</span>
              {budgetOverview.slice(0, 4).map((budget) => {
                const remaining = budget.planned - budget.actual;
                const percentage = budget.planned > 0
                  ? Math.min(100, Math.round((budget.actual / budget.planned) * 100))
                  : 0;
                return (
                  <button
                    key={budget.id}
                    type="button"
                    onClick={() => navigate(`/space/records/list/${budget.id}`, { state: { from: location.pathname } })}
                    style={localStyles.budgetRow}
                  >
                    <span style={localStyles.budgetName}>{budget.title}</span>
                    <span style={localStyles.muted}>
                      {formatMoney(remaining)} remaining · {percentage}% used
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <SectionTitle title="TODAY'S OVERVIEW" action="See all" onAction={() => navigate('/space/organize')} />
        <div style={styles.panel}>
          <span style={localStyles.cardKicker}>TASKS DUE TODAY</span>
          {dueTodayTasks.length ? dueTodayTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => navigate(`/space/records/task/${task.id}`, { state: { from: location.pathname } })}
            >
              <span style={localStyles.listLine}>○  {task.title}</span>
            </button>
          )) : <span style={localStyles.muted}>No tasks due today.</span>}
          {overdueTasks.length > 0 && (
            <div style={localStyles.attentionGroup}>
              <span style={localStyles.attentionLabel}>OVERDUE TASKS</span>
              {overdueTasks.slice(0, 4).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate(`/space/records/task/${task.id}`, { state: { from: location.pathname } })}
                  style={localStyles.attentionButton}
                >
                  {task.title} · due {task.date}
                </button>
              ))}
            </div>
          )}
          <div style={localStyles.attentionGroup}>
            <span style={localStyles.cardKicker}>EVENTS TODAY</span>
            {todayEvents.length ? todayEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => navigate(`/space/records/event/${event.id}`, { state: { from: location.pathname } })}
                style={localStyles.attentionButton}
              >
                {event.title}
              </button>
            )) : <span style={localStyles.muted}>No events scheduled today.</span>}
          </div>
          {remindersDue.length > 0 && (
            <div style={localStyles.attentionGroup}>
              <span style={localStyles.attentionLabel}>REMINDERS DUE OR OVERDUE</span>
              {remindersDue.slice(0, 4).map((reminder) => (
                <button
                  key={reminder.id}
                  type="button"
                  onClick={() => navigate('/space/organize', {
                    state: { section: 'Reminders', focusReminderId: reminder.id },
                  })}
                  style={localStyles.attentionButton}
                >
                  {reminder.title} · {formatScheduleDate(reminder.due_at)}
                </button>
              ))}
            </div>
          )}
        </div>

        <SectionTitle title="NEEDS ATTENTION" action="Open reminders →" onAction={() => navigate('/space/organize', { state: { section: 'Reminders' } })} />
        <div style={styles.panel}>
          {overdueTasks.length === 0 && remindersDue.length === 0 && budgetAttention.length === 0
            && eventPreparation.length === 0
            && loans.every((loan) => loan.due_date >= today)
            ? <span style={localStyles.muted}>Nothing needs attention right now.</span>
            : null}
          {overdueTasks.slice(0, 3).map((task) => (
            <button
              key={`task-${task.id}`}
              type="button"
              onClick={() => navigate(`/space/records/task/${task.id}`, { state: { from: location.pathname } })}
              style={localStyles.attentionButton}
            >
              Overdue task: {task.title}
            </button>
          ))}
          {budgetAttention.map((budget) => (
            <button
              key={`budget-${budget.id}`}
              type="button"
              onClick={() => navigate(`/space/records/list/${budget.id}`, { state: { from: location.pathname } })}
              style={localStyles.attentionButton}
            >
              Budget near limit: {budget.title} ({Math.round((budget.actual / budget.planned) * 100)}% used)
            </button>
          ))}
          {eventPreparation.map((event) => (
            <button
              key={`event-${event.id}`}
              type="button"
              onClick={() => navigate(`/space/records/event/${event.id}`, { state: { from: location.pathname } })}
              style={localStyles.attentionButton}
            >
              Event needs preparation: {event.title} · {event.tasks} incomplete tasks
            </button>
          ))}
          {loans.filter((loan) => loan.due_date < today).slice(0, 3).map((loan) => (
            <button
              key={`loan-${loan.id}`}
              type="button"
              onClick={() => navigate('/space/finances', { state: { section: 'loans' } })}
              style={localStyles.attentionButton}
            >
              Overdue loan repayment: {loan.lender} · {loan.due_date}
            </button>
          ))}
          {remindersDue.slice(0, 3).map((reminder) => (
            <button
              key={`reminder-${reminder.id}`}
              type="button"
              onClick={() => navigate('/space/organize', { state: { section: 'Reminders', focusReminderId: reminder.id } })}
              style={localStyles.attentionButton}
            >
              Reminder due: {reminder.title}
            </button>
          ))}
        </div>

        <SectionTitle title="UPCOMING SCHEDULE" action="Open calendar →" onAction={() => navigate('/space/calendar')} />
        <div style={styles.panel}>
          {upcomingSchedule.length ? upcomingSchedule.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => openScheduleItem(item)}
              style={localStyles.scheduleRow}
            >
              <span style={localStyles.scheduleDate}>{formatScheduleDate(item.date)}</span>
              <span style={localStyles.recordTitle}>{item.title}</span>
              <span style={localStyles.scheduleKind}>{item.kind}</span>
            </button>
          )) : <span style={localStyles.muted}>Nothing scheduled soon.</span>}
        </div>

        <SectionTitle title="RECENT NOTES" action="Open organize →" onAction={() => navigate('/space/organize')} />
        <div style={styles.panelGrid}>
          {notes.length ? notes.map((note) => (
            <NoteCard key={note.id} note={note} remove={removeNote} />
          )) : <span style={localStyles.muted}>Your recently updated notes will appear here.</span>}
        </div>

        <SectionTitle title="RECENT TRANSACTIONS" />
        <div style={styles.panel}>
          {transactions.length ? transactions.map((transaction) => (
            <button
              key={transaction.id}
              type="button"
              onClick={() => setSelectedTransaction(transaction)}
              style={localStyles.transactionRow}
            >
              <div style={localStyles.transactionIcon}>
                <span>
                  {transaction.kind === 'expense'
                    ? '−'
                    : transaction.loan_id !== null ? '↔' : '+'}
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
          )) : <span style={localStyles.muted}>Add an expense or income, or finalize a budget list.</span>}
        </div>

        <SectionTitle title="PERSONAL PROGRESS" action="Open tasks →" onAction={() => navigate('/space/organize', { state: { section: 'Tasks' } })} />
        <div style={Object.assign({}, styles.panel, localStyles.metricGrid)}>
          <div style={localStyles.metric}>
            <span style={localStyles.cardKicker}>TASKS COMPLETED · 7 DAYS</span>
            <span style={localStyles.metricValue}>{completedThisWeek}</span>
          </div>
          <div style={localStyles.metric}>
            <span style={localStyles.cardKicker}>TASKS REMAINING</span>
            <span style={localStyles.metricValue}>{remainingTasks}</span>
          </div>
          <div style={localStyles.metric}>
            <span style={localStyles.cardKicker}>BUDGET UTILIZATION</span>
            <span style={localStyles.metricValue}>
              {budgetOverview.reduce((total, budget) => total + budget.planned, 0) > 0
                ? `${Math.round(
                  budgetOverview.reduce((total, budget) => total + budget.actual, 0)
                  / budgetOverview.reduce((total, budget) => total + budget.planned, 0) * 100,
                )}%`
                : '—'}
            </span>
          </div>
        </div>

        <SectionTitle
          title="RECENT ACTIVITY"
          action="View all"
          onAction={() => navigate('/space/organize', { state: { section: 'Activity' } })}
        />
        <div style={styles.panel}>
          {activities.length ? activities.map((activity) => (
            <div key={activity.id} style={localStyles.activityRow}>
              {activity.action !== 'deleted' && activity.module !== 'links' && activity.record_id !== null ? (
                <button type="button" onClick={() => openActivity(activity)} style={localStyles.activityButton}>
                  <span style={localStyles.recordTitle}>{activity.description}</span>
                  <time dateTime={activity.occurred_at} style={localStyles.muted}>
                    {new Date(activity.occurred_at).toLocaleString()}
                  </time>
                </button>
              ) : (
                <>
                  <span style={localStyles.recordTitle}>{activity.description}</span>
                  <time dateTime={activity.occurred_at} style={localStyles.muted}>
                    {new Date(activity.occurred_at).toLocaleString()}
                  </time>
                </>
              )}
            </div>
          )) : <span style={localStyles.muted}>Your recent activity will appear here.</span>}
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
      {expenseComposerOpen ? (
        <ExpenseComposer
          onClose={() => setExpenseComposerOpen(false)}
          onSave={onSaveExpense}
        />
      ) : null}
      {selectedTransaction ? (
        <TransactionReceipt
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onChanged={refresh}
        />
      ) : null}
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
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 14,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  budgetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTop: `1px solid ${colors.line}`,
  },
  budgetRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    paddingBlock: 5,
    textAlign: 'left',
  },
  budgetName: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  attentionGroup: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: 11,
    paddingTop: 9,
    borderTop: `1px solid ${colors.line}`,
  },
  attentionLabel: {
    color: colors.orange,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  attentionButton: {
    width: '100%',
    paddingBlock: 8,
    color: colors.ink,
    fontSize: 11,
    textAlign: 'left',
  },
  scheduleRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(90px, 0.8fr) minmax(0, 2fr) auto',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingBlock: 10,
    textAlign: 'left',
    borderBottom: `1px solid ${colors.line}`,
  },
  scheduleDate: {
    color: colors.muted,
    fontSize: 9,
  },
  scheduleKind: {
    color: colors.green,
    fontSize: 9,
    textTransform: 'capitalize',
  },
  activityRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    paddingBlock: 9,
    borderBottom: `1px solid ${colors.line}`,
  },
  activityButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 5,
    textAlign: 'left',
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
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingBlock: 8,
    textAlign: 'left',
    color: colors.ink,
    backgroundColor: 'transparent',
    border: 0,
    cursor: 'pointer',
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
