# Database API usage

The database API wraps the app's local SQLite database. Create it from the `BrowserDatabase` supplied by `useDatabase()`; it does not open or initialize another database.

```tsx
import { createDatabaseApi } from '../../services/database';
import { useDatabase } from '../../web/DatabaseProvider';

function Example() {
  const database = useDatabase();
  const api = createDatabaseApi(database);

  // Use api in event handlers or effects.
  return null;
}
```

## Read rows

Table APIs are grouped by domain: `finance`, `budgets`, and `records`.

```ts
const accounts = await api.tables.finance.accounts.list();
const openTasks = await api.tables.records.tasks.list({
  where: { completed: 0 },
  orderBy: 'date',
  direction: 'ASC',
});

const task = await api.tables.records.tasks.getById(12);
const latestReminder = await api.tables.records.reminders.findFirst({
  where: { status: 'pending' },
  orderBy: 'due_at',
});
const pendingCount = await api.tables.records.reminders.count({ status: 'pending' });
```

All list methods accept optional `where`, `orderBy`, `direction`, `limit`, and `offset` values. Filters are combined with `AND`; use `null` to match a SQL `NULL` column. Column names are checked against the table definition.

```ts
const recentTransactions = await api.tables.finance.transactions.list({
  where: { kind: 'expense', account_id: 3 },
  orderBy: 'date',
  direction: 'DESC',
  limit: 20,
  offset: 0,
});
```

## Create, update, and delete

Creation returns the inserted row ID. Updates and deletes return `true` if a row was affected.

```ts
const taskId = await api.tables.records.tasks.create({
  title: 'Call the clinic',
  category: 'Personal',
  date: '2026-11-07',
  notes: '',
  completed: 0,
  completed_at: null,
});

await api.tables.records.tasks.update(taskId, { completed: 1 });
await api.tables.records.tasks.delete(taskId);
```

Only provide fields that need changing in `update`. Do not include an `id` in a `create` record, or change a row's primary key with `update`. Tables with non-`id` primary keys (such as `legacyBudgetItemMap`) provide `getByKey`, `updateByKey`, and `deleteByKey`.

## Prefer domain operations for business actions

Use the domain APIs when an action has validation, side effects, or accounting rules. These operations are grouped under `finance`, `budgets`, `records`, `recordEditor`, `lists`, and `notes`; their method names and argument types are available in `database_api.ts`.

```ts
await api.finance.saveExpense({
  title: 'Groceries',
  category: 'Food',
  notes: '',
  accountId: 3,
  items: [{ text: 'Rice', done: false, price: 5000, quantity: 1 }],
});

const budgets = await api.budgets.getSharedBudgets();
const reminders = await api.records.getReminders();
await api.notes.saveNote({
  title: 'Ideas',
  category: 'Personal',
  content: 'Plan for next week',
});
```

Raw table writes can skip those business rules. In particular, use domain operations for expenses, transfers, loans, refunds, budget changes, and record conversion rather than writing their related rows individually.

## Transactions

Group multiple low-level writes into one SQLite transaction. If the callback throws, the database rolls back the transaction.

```ts
await api.transaction(async () => {
  const eventId = await api.tables.records.events.create({
    title: 'Dentist',
    category: 'Personal',
    date: '2026-11-08',
    notes: '',
  });

  await api.tables.records.reminders.create({
    title: 'Bring insurance card',
    description: '',
    due_at: '2026-11-08T08:00:00.000Z',
    status: 'pending',
    related_type: 'event',
    related_id: eventId,
    created_at: new Date().toISOString(),
    completed_at: null,
  });
});
```

## Backup operations

```ts
const sqliteBytes = await api.backups.exportSqlite();
const jsonData = await api.backups.exportJson();
const snapshot = await api.backups.getJsonSnapshot();
```

`restoreSqlite(bytes)` replaces the local database and should be used only after the user selects and confirms a backup file. The database API validates and initializes the restored database.
