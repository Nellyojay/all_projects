import { loansApi, transactionsApi } from '../../../api/finance.api';
import {
  activityLogsApi,
  eventsApi,
  listItemsApi,
  listsApi,
  notesApi,
  recordLinksApi,
  remindersApi,
  tasksApi,
} from '../../../api/records.api';
import type {
  ActivityRecord,
  EventRecord,
  ListItem,
  NoteRecord,
  LinkedRecordType,
  ReminderRecord,
  TaskRecord,
  Transaction,
} from './database_types';
import { getAccounts } from './finance_database';

const LINKED_RECORD_TYPES: LinkedRecordType[] = [
  'event', 'task', 'note', 'budget', 'transaction', 'list', 'reminder', 'inbox',
];

function isLinkedRecordType(value: string): value is LinkedRecordType {
  return LINKED_RECORD_TYPES.includes(value as LinkedRecordType);
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

export async function getDashboardData(month: string, today: string) {
  const [
    taskRows,
    eventRows,
    noteRows,
    transactionRows,
    listRows,
    listItemRows,
    recordLinks,
    accountRows,
    reminderRows,
    activityRows,
    loanRows,
  ] = await Promise.all([
    tasksApi.list(),
    eventsApi.list(),
    notesApi.list(),
    transactionsApi.list(),
    listsApi.list(),
    listItemsApi.list(),
    recordLinksApi.list(),
    getAccounts(),
    remindersApi.list(),
    activityLogsApi.list(),
    loansApi.list(),
  ]);

  const transactions = transactionRows
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
    .slice(0, 4)
    .map((transaction): Transaction => ({
      ...transaction,
      account_name: transaction.account_id === null
        ? null
        : accountRows.find((account) => account.id === transaction.account_id)?.name ?? null,
    }));
  const taskRecords: TaskRecord[] = taskRows.map((task) => ({
    ...task,
    completed: Number(task.completed),
  }));
  const budgetCountByEvent = new Map<number, number>();
  for (const list of listRows) {
    if (list.budget_enabled && list.event_id !== null) {
      budgetCountByEvent.set(list.event_id, (budgetCountByEvent.get(list.event_id) ?? 0) + 1);
    }
  }
  const listItemsById = new Map<number, ListItem[]>();
  for (const item of listItemRows) {
    const items = listItemsById.get(item.list_id) ?? [];
    items.push({
      text: item.text,
      done: item.done,
      price: item.price,
      quantity: item.quantity,
    });
    listItemsById.set(item.list_id, items);
  }
  const transactionById = new Map(transactionRows.map((transaction) => [transaction.id, transaction]));
  const budgetLists = listRows
    .filter((list) => list.budget_enabled && !list.finalized)
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((list) => {
      const actual = recordLinks.reduce((total, link) => {
        const linkedTransactionId = link.source_type === 'transaction'
          ? link.source_id
          : link.target_type === 'transaction' ? link.target_id : null;
        const linkedListId = link.source_type === 'budget' || link.source_type === 'list'
          ? link.source_id
          : link.target_type === 'budget' || link.target_type === 'list' ? link.target_id : null;
        const transaction = linkedTransactionId === null
          ? undefined
          : transactionById.get(linkedTransactionId);
        return linkedListId === list.id && transaction?.kind === 'expense'
          ? total + transaction.amount
          : total;
      }, 0);
      return {
        id: list.id,
        title: list.title,
        items: JSON.stringify(listItemsById.get(list.id) ?? []),
        actual,
      };
    });

  const events: EventRecord[] = eventRows
    .filter((event) => event.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id)
    .slice(0, 8)
    .map((event) => ({
      ...event,
      budget_count: budgetCountByEvent.get(event.id) ?? 0,
    }));
  const notes: NoteRecord[] = noteRows
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, 3);
  const tasks = taskRecords
    .filter((task) => !task.completed && task.date <= shiftDate(today, 7))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id)
    .slice(0, 30);
  const monthTransactions = transactionRows.filter((transaction) => transaction.date.slice(0, 7) === month);
  const spent = monthTransactions.reduce((sum, transaction) =>
    sum + (transaction.kind === 'expense' ? transaction.amount : 0), 0);
  const income = monthTransactions.reduce((sum, transaction) =>
    sum + (transaction.kind === 'income'
      && transaction.loan_id === null
      && transaction.refund_of_transaction_id === null
      ? transaction.amount
      : 0), 0);
  const repaidByLoan = new Map<number, number>();
  for (const transaction of transactionRows) {
    if (transaction.loan_id !== null && transaction.kind === 'expense') {
      repaidByLoan.set(
        transaction.loan_id,
        (repaidByLoan.get(transaction.loan_id) ?? 0) + transaction.amount,
      );
    }
  }
  const loans = loanRows
    .map((loan) => ({
      id: loan.id,
      lender: loan.lender,
      due_date: loan.due_date,
      principal: loan.principal,
      fees: loan.fees,
      repaid: repaidByLoan.get(loan.id) ?? 0,
    }))
    .filter((loan) => loan.principal + loan.fees > loan.repaid)
    .sort((left, right) => left.due_date.localeCompare(right.due_date))
    .slice(0, 6);
  const completedThisWeek = taskRecords.filter((task) =>
    Boolean(task.completed)
    && task.completed_at !== null
    && task.completed_at.slice(0, 10) >= shiftDate(today, -6),
  ).length;
  const eventIdsByTask = new Map<number, Set<number>>();
  for (const link of recordLinks) {
    const eventId = link.source_type === 'event' && link.target_type === 'task'
      ? link.source_id
      : link.target_type === 'event' && link.source_type === 'task' ? link.target_id : null;
    const taskId = link.source_type === 'task' && link.target_type === 'event'
      ? link.source_id
      : link.target_type === 'task' && link.source_type === 'event' ? link.target_id : null;
    if (eventId === null || taskId === null) continue;
    const task = taskRows.find((row) => row.id === taskId);
    if (!task || task.completed) continue;
    const eventTasks = eventIdsByTask.get(eventId) ?? new Set<number>();
    eventTasks.add(taskId);
    eventIdsByTask.set(eventId, eventTasks);
  }
  const eventPreparation = eventRows
    .filter((event) => event.date >= today && (eventIdsByTask.get(event.id)?.size ?? 0) > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 6)
    .map((event) => ({
      id: event.id,
      title: event.title,
      tasks: eventIdsByTask.get(event.id)?.size ?? 0,
    }));

  return {
    transactions,
    tasks,
    events,
    notes,
    spent,
    budgetLists,
    accounts: accountRows,
    income,
    reminders: reminderRows
      .filter((reminder) => reminder.status === 'pending')
      .sort((left, right) => left.due_at.localeCompare(right.due_at) || left.id - right.id)
      .map((reminder): ReminderRecord => {
        if (reminder.related_type !== null && !isLinkedRecordType(reminder.related_type)) {
          throw new Error(`Reminder ${reminder.id} has an unsupported linked record type.`);
        }
        return { ...reminder, related_type: reminder.related_type };
      }),
    activities: activityRows
      .sort((left, right) =>
        right.occurred_at.localeCompare(left.occurred_at) || right.id - left.id)
      .slice(0, 8) as ActivityRecord[],
    loans,
    completedThisWeek,
    remainingTasks: taskRecords.filter((task) => !task.completed).length,
    eventPreparation,
  };
}
